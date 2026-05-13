/**
 * Purpose: Video asset loader node definitions and manager-side finish simulation.
 */
import type { NodeDefinition, ProcessContext } from '../../../types.js';
import { normalizeLocalMediaRef } from '../../media-utils.js';
import { coerceAssetVolumeGain } from '../../utils.js';
import { getRecordString } from '../node-definition-utils.js';

type LoadVideoTimelineState = {
  signature: string;
  lastPlay: boolean;
  accumulatedMs: number;
};

type VideoPlaybackOptions = {
  source: string;
  fit: 'contain' | 'fit-screen' | 'cover' | 'fill';
  startClamped: number;
  endClamped: number;
  cursorForPlayback: number | null;
  loop: boolean;
  play: boolean;
  reverse: boolean;
  volumeGain: number;
  mutedEffective: boolean;
};

const loadVideoTimelineState = new Map<string, LoadVideoTimelineState>();

function coerceBooleanLike(value: unknown): boolean {
  return typeof value === 'number' ? value >= 0.5 : Boolean(value);
}

function parseVideoPlaybackInputs(
  inputs: Record<string, unknown>,
  config: Record<string, unknown>,
  source: string
): VideoPlaybackOptions {
  const fitRaw = typeof config.fit === 'string' ? config.fit.trim().toLowerCase() : '';
  const fit =
    fitRaw === 'cover' || fitRaw === 'fill' || fitRaw === 'fit-screen' ? fitRaw : 'contain';
  const startSecRaw = inputs.startSec;
  const endSecRaw = inputs.endSec;
  const cursorSecRaw = inputs.cursorSec;
  const startSec =
    typeof startSecRaw === 'number' && Number.isFinite(startSecRaw) ? startSecRaw : 0;
  const endSec = typeof endSecRaw === 'number' && Number.isFinite(endSecRaw) ? endSecRaw : -1;
  const cursorSec =
    typeof cursorSecRaw === 'number' && Number.isFinite(cursorSecRaw) ? cursorSecRaw : -1;

  const loop = coerceBooleanLike(inputs.loop);
  const play = coerceBooleanLike(inputs.play);
  const reverse = coerceBooleanLike(inputs.reverse);
  const muted = coerceBooleanLike(inputs.muted);
  const volumeGain = Math.round(coerceAssetVolumeGain(inputs.volume) * 100) / 100;
  const mutedEffective = muted || volumeGain <= 0;

  const startClamped = Math.max(0, startSec);
  const endClamped = endSec >= 0 ? Math.max(startClamped, endSec) : -1;
  const cursorClamped = cursorSec >= 0 ? Math.max(startClamped, cursorSec) : -1;
  const cursorForPlayback =
    cursorClamped >= 0
      ? endClamped >= 0
        ? Math.min(endClamped, cursorClamped)
        : cursorClamped
      : null;

  return {
    source,
    fit,
    startClamped,
    endClamped,
    cursorForPlayback,
    loop,
    play,
    reverse,
    volumeGain,
    mutedEffective,
  };
}

function createVideoRef(opts: VideoPlaybackOptions, context: ProcessContext): string {
  if (!opts.source) return '';
  const tValue =
    opts.endClamped >= 0
      ? `${opts.startClamped},${opts.endClamped}`
      : `${opts.startClamped},`;
  const positionParam = opts.cursorForPlayback !== null ? `&p=${opts.cursorForPlayback}` : '';
  const nodeParam = context?.nodeId ? `&node=${encodeURIComponent(String(context.nodeId))}` : '';
  const fitParam = opts.fit !== 'contain' ? `&fit=${opts.fit}` : '';
  const refBase = `${opts.source}#t=${tValue}&loop=${opts.loop ? 1 : 0}&play=${opts.play ? 1 : 0}&rev=${opts.reverse ? 1 : 0}&vol=${opts.volumeGain}&muted=${opts.mutedEffective ? 1 : 0}${positionParam}${nodeParam}`;
  return fitParam ? `${refBase}${fitParam}` : refBase;
}

function computeVideoEnded(
  opts: VideoPlaybackOptions,
  context: ProcessContext,
  timelineKey: string
): boolean {
  const qSec = (value: number): number => Math.round(value * 100) / 100;
  const signature = [
    timelineKey,
    qSec(opts.startClamped),
    qSec(opts.endClamped),
    qSec(opts.cursorForPlayback ?? -1),
    opts.loop ? 1 : 0,
    opts.reverse ? 1 : 0,
  ].join('|');

  const prevState = loadVideoTimelineState.get(context.nodeId);
  const state: LoadVideoTimelineState = prevState ?? {
    signature: '',
    lastPlay: false,
    accumulatedMs: 0,
  };

  if (signature !== state.signature) {
    state.signature = signature;
    state.accumulatedMs = 0;
  }

  const playRising = opts.play && !state.lastPlay;
  let durationSec: number | null = null;
  if (!opts.loop) {
    if (opts.reverse) {
      const startPos =
        opts.cursorForPlayback ?? (opts.endClamped >= 0 ? opts.endClamped : opts.startClamped);
      durationSec = Math.max(0, startPos - opts.startClamped);
    } else if (opts.endClamped >= 0) {
      const startPos = opts.cursorForPlayback ?? opts.startClamped;
      durationSec = Math.max(0, opts.endClamped - startPos);
    }
  }

  const durationMs = durationSec !== null ? durationSec * 1000 : null;
  const atEdgeBefore = !opts.loop && durationMs !== null && state.accumulatedMs >= durationMs;
  if (atEdgeBefore && playRising) {
    state.accumulatedMs = 0;
  }

  const dtMs =
    typeof context.deltaTime === 'number' && Number.isFinite(context.deltaTime)
      ? Math.max(0, context.deltaTime)
      : 0;

  if (!opts.loop && durationMs !== null && opts.play) {
    if (durationMs <= 0) {
      state.accumulatedMs = durationMs;
    } else if (state.lastPlay) {
      state.accumulatedMs += dtMs;
      if (state.accumulatedMs >= durationMs) {
        state.accumulatedMs = durationMs;
      }
    }
  }

  state.lastPlay = opts.play;
  loadVideoTimelineState.set(context.nodeId, state);

  if (opts.loop || durationMs === null) return false;
  const finishThresholdMs = Math.max(0, durationMs - 100);
  return state.accumulatedMs >= finishThresholdMs;
}

export function createLoadVideoFromAssetsNode(): NodeDefinition {
  return {
    type: 'load-video-from-assets',
    label: 'Load Video From Remote',
    category: 'Assets',
    inputs: [
      { id: 'startSec', label: 'Start (s)', type: 'number', defaultValue: 0, min: 0, step: 0.01 },
      { id: 'endSec', label: 'End (s)', type: 'number', defaultValue: -1, min: -1, step: 0.01 },
      {
        id: 'cursorSec',
        label: 'Cursor (s)',
        type: 'number',
        defaultValue: -1,
        min: -1,
        step: 0.01,
      },
      { id: 'loop', label: 'Loop', type: 'boolean', defaultValue: false },
      { id: 'play', label: 'Play', type: 'boolean', defaultValue: true },
      { id: 'reverse', label: 'Reverse', type: 'boolean', defaultValue: false },
      {
        id: 'volume',
        label: 'Volume',
        type: 'number',
        defaultValue: 0,
        min: -1,
        max: 100,
        step: 0.01,
      },
      { id: 'muted', label: 'Mute', type: 'boolean', defaultValue: true },
    ],
    outputs: [
      { id: 'ref', label: 'Video Out', type: 'video', kind: 'sink' },
      { id: 'ended', label: 'Finish', type: 'boolean' },
    ],
    configSchema: [
      {
        key: 'assetId',
        label: 'Video Asset',
        type: 'asset-picker',
        assetKind: 'video',
        defaultValue: '',
      },
      {
        key: 'timeline',
        label: 'Timeline',
        type: 'time-range',
        defaultValue: { startSec: 0, endSec: -1, cursorSec: -1 },
        min: 0,
        step: 0.01,
      },
      {
        key: 'fit',
        label: 'Fit',
        type: 'select',
        defaultValue: 'contain',
        options: [
          { value: 'contain', label: 'Contain' },
          { value: 'fit-screen', label: 'Fit Screen' },
          { value: 'cover', label: 'Cover' },
          { value: 'fill', label: 'Fill' },
        ],
      },
    ],
    process: (inputs, config, context) => {
      const assetId = typeof config.assetId === 'string' ? config.assetId.trim() : '';
      const opts = parseVideoPlaybackInputs(inputs, config, assetId ? `asset:${assetId}` : '');
      const ref = createVideoRef(opts, context);

      if (!assetId) {
        loadVideoTimelineState.delete(context.nodeId);
        return { ref: '', ended: false };
      }

      return { ref, ended: computeVideoEnded(opts, context, assetId) };
    },
    onDisable: (_inputs, _config, context) => {
      // Reset manager-side timeline state so `Finish` doesn't stay latched across stop/start.
      loadVideoTimelineState.delete(context.nodeId);
    },
  };
}

export function createLoadVideoFromLocalNode(): NodeDefinition {
  return {
    type: 'load-video-from-local',
    label: 'Load Video From Local(Display only)',
    category: 'Assets',
    inputs: [
      { id: 'asset', label: 'Asset', type: 'string', defaultValue: '' },
      { id: 'startSec', label: 'Start (s)', type: 'number', defaultValue: 0, min: 0, step: 0.01 },
      { id: 'endSec', label: 'End (s)', type: 'number', defaultValue: -1, min: -1, step: 0.01 },
      {
        id: 'cursorSec',
        label: 'Cursor (s)',
        type: 'number',
        defaultValue: -1,
        min: -1,
        step: 0.01,
      },
      { id: 'loop', label: 'Loop', type: 'boolean', defaultValue: false },
      { id: 'play', label: 'Play', type: 'boolean', defaultValue: true },
      { id: 'reverse', label: 'Reverse', type: 'boolean', defaultValue: false },
      {
        id: 'volume',
        label: 'Volume',
        type: 'number',
        defaultValue: 0,
        min: -1,
        max: 100,
        step: 0.01,
      },
      { id: 'muted', label: 'Mute', type: 'boolean', defaultValue: true },
    ],
    outputs: [
      { id: 'ref', label: 'Video Out', type: 'video', kind: 'sink' },
      { id: 'ended', label: 'Finish', type: 'boolean' },
    ],
    configSchema: [
      {
        key: 'assetPath',
        label: 'Video Asset',
        type: 'local-asset-picker',
        assetKind: 'video',
        defaultValue: '',
      },
      {
        key: 'timeline',
        label: 'Timeline',
        type: 'time-range',
        defaultValue: { startSec: 0, endSec: -1, cursorSec: -1 },
        min: 0,
        step: 0.01,
      },
      {
        key: 'fit',
        label: 'Fit',
        type: 'select',
        defaultValue: 'contain',
        options: [
          { value: 'contain', label: 'Contain' },
          { value: 'fit-screen', label: 'Fit Screen' },
          { value: 'cover', label: 'Cover' },
          { value: 'fill', label: 'Fill' },
        ],
      },
    ],
    process: (inputs, config, context) => {
      const assetUrl =
        typeof inputs.asset === 'string' && inputs.asset.trim()
          ? inputs.asset.trim()
          : getRecordString(config, 'assetPath') ?? '';
      const localRef = assetUrl ? normalizeLocalMediaRef(assetUrl, 'video') : '';
      const baseUrl = (() => {
        if (!localRef) return '';
        const hashIndex = localRef.indexOf('#');
        return hashIndex >= 0 ? localRef.slice(0, hashIndex) : localRef;
      })();
      const opts = parseVideoPlaybackInputs(inputs, config, baseUrl);
      const ref = createVideoRef(opts, context);

      if (!baseUrl) {
        loadVideoTimelineState.delete(context.nodeId);
        return { ref: '', ended: false };
      }

      return { ref, ended: computeVideoEnded(opts, context, baseUrl) };
    },
    onDisable: (_inputs, _config, context) => {
      // Reset manager-side timeline state so `Finish` doesn't stay latched across stop/start.
      loadVideoTimelineState.delete(context.nodeId);
    },
  };
}
