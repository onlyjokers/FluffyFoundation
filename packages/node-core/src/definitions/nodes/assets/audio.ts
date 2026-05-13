/**
 * Purpose: Audio asset loader node definitions and manager-side playback timeline simulation.
 */
import type { NodeDefinition } from '../../../types.js';
import { normalizeLocalMediaRef } from '../../media-utils.js';
import { clampNumber, coerceBoolean, coerceNumber } from '../../utils.js';
import { getRecordString } from '../node-definition-utils.js';

type LoadAudioTimelineState = {
  signature: string;
  lastPlay: boolean;
  lastCursorSec: number | null;
  startedFromSec: number | null;
  progressedSec: number;
  ended: boolean;
};

const loadAudioTimelineState = new Map<string, LoadAudioTimelineState>();

function computeLoadAudioFinished(opts: {
  nodeId: string;
  signature: string;
  play: boolean;
  loop: boolean;
  reverse: boolean;
  playbackRate: number;
  clipStart: number;
  clipEnd: number;
  cursorSec: number | null;
  deltaTimeMs: number;
}): boolean {
  const state: LoadAudioTimelineState = loadAudioTimelineState.get(opts.nodeId) ?? {
    signature: '',
    lastPlay: false,
    lastCursorSec: null,
    startedFromSec: null,
    progressedSec: 0,
    ended: false,
  };

  const settingsChanged = opts.signature !== state.signature;
  if (settingsChanged) {
    state.signature = opts.signature;
    state.lastCursorSec = null;
    state.startedFromSec = null;
    state.progressedSec = 0;
    state.ended = false;
  }

  const playActive = Boolean(opts.play);
  const playRising = playActive && !state.lastPlay;

  if (!playActive) {
    // Match client runtime: Play=false clears Finish, but keep playhead progress for resume.
    state.ended = false;
    state.lastPlay = false;
    loadAudioTimelineState.set(opts.nodeId, state);
    return false;
  }

  const resolvedClipEnd = opts.clipEnd >= 0 ? Math.max(opts.clipStart, opts.clipEnd) : null;
  const cursorClamped = (() => {
    if (opts.cursorSec === null) return null;
    const base = Math.max(opts.clipStart, opts.cursorSec);
    if (resolvedClipEnd !== null) return Math.min(resolvedClipEnd, base);
    return base;
  })();

  const cursorChanged = (() => {
    if (cursorClamped === null) {
      return state.lastCursorSec !== null;
    }
    if (state.lastCursorSec === null) return true;
    return Math.abs(cursorClamped - state.lastCursorSec) > 0.005;
  })();

  if (cursorChanged) {
    state.lastCursorSec = cursorClamped;
    state.startedFromSec = cursorClamped;
    state.progressedSec = 0;
    state.ended = false;
  } else {
    state.lastCursorSec = cursorClamped;
  }

  if (state.ended && playRising) {
    state.startedFromSec = cursorClamped;
    state.progressedSec = 0;
    state.ended = false;
  }

  if (opts.loop) {
    state.ended = false;
    state.lastPlay = true;
    loadAudioTimelineState.set(opts.nodeId, state);
    return false;
  }

  if (state.startedFromSec === null) {
    const fallbackStart =
      opts.reverse && resolvedClipEnd !== null ? resolvedClipEnd : Math.max(0, opts.clipStart);
    state.startedFromSec = cursorClamped ?? fallbackStart;
    state.progressedSec = 0;
    state.ended = false;
  }

  if (resolvedClipEnd === null) {
    // Without an explicit end, we cannot infer the full media duration on the manager.
    state.ended = false;
    state.lastPlay = true;
    loadAudioTimelineState.set(opts.nodeId, state);
    return false;
  }

  const startPos = clampNumber(state.startedFromSec, opts.clipStart, resolvedClipEnd);
  const durationSec = opts.reverse
    ? Math.max(0, startPos - opts.clipStart)
    : Math.max(0, resolvedClipEnd - startPos);

  const rateRaw = opts.playbackRate;
  const rate = Number.isFinite(rateRaw) ? Math.max(0, rateRaw) : 1;
  const dtSec = Number.isFinite(opts.deltaTimeMs) ? Math.max(0, opts.deltaTimeMs) / 1000 : 0;

  if (durationSec <= 0) {
    state.ended = true;
  } else if (state.lastPlay) {
    state.progressedSec = Math.min(durationSec, state.progressedSec + dtSec * rate);
    if (state.progressedSec >= durationSec) {
      state.ended = true;
    }
  }

  state.lastPlay = true;
  loadAudioTimelineState.set(opts.nodeId, state);
  return state.ended;
}

function resolveAudioTimelineInputs(
  inputs: Record<string, unknown>,
  config: Record<string, unknown>
): {
  play: boolean;
  loop: boolean;
  reverse: boolean;
  playbackRate: number;
  clipStart: number;
  clipEnd: number;
  cursorSec: number | null;
} {
  const play = coerceBoolean(inputs.play);
  const loop = coerceBoolean(inputs.loop);
  const reverse = coerceBoolean(inputs.reverse);
  const playbackRate = Math.max(0, coerceNumber(inputs.playbackRate ?? config.playbackRate, 1));

  const clipStart = Math.max(0, coerceNumber(inputs.startSec, 0));
  const clipEndRaw = coerceNumber(inputs.endSec, -1);
  const clipEnd =
    Number.isFinite(clipEndRaw) && clipEndRaw >= 0 ? Math.max(clipStart, clipEndRaw) : -1;

  const cursorRaw = coerceNumber(inputs.cursorSec, -1);
  const cursorSec = Number.isFinite(cursorRaw) && cursorRaw >= 0 ? Math.max(0, cursorRaw) : null;

  return { play, loop, reverse, playbackRate, clipStart, clipEnd, cursorSec };
}

function createAudioTimelineSignature(opts: {
  asset: string;
  clipStart: number;
  clipEnd: number;
  loop: boolean;
  reverse: boolean;
}): string {
  return [
    opts.asset,
    Math.round(opts.clipStart * 1000) / 1000,
    Math.round(opts.clipEnd * 1000) / 1000,
    opts.loop ? 1 : 0,
    opts.reverse ? 1 : 0,
  ].join('|');
}

export function createLoadAudioFromAssetsNode(): NodeDefinition {
  return {
    type: 'load-audio-from-assets',
    label: 'Load Audio From Remote',
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
      { id: 'playbackRate', label: 'Rate', type: 'number', defaultValue: 1, min: 0 },
      { id: 'detune', label: 'Detune', type: 'number', defaultValue: 0 },
      {
        id: 'volume',
        label: 'Volume',
        type: 'number',
        defaultValue: 0,
        min: -1,
        max: 100,
        step: 0.01,
      },
    ],
    outputs: [
      { id: 'ref', label: 'Audio Out', type: 'audio', kind: 'sink' },
      { id: 'ended', label: 'Finish', type: 'boolean' },
    ],
    configSchema: [
      {
        key: 'assetId',
        label: 'Audio Asset',
        type: 'asset-picker',
        assetKind: 'audio',
        defaultValue: '',
      },
      { key: 'playbackRate', label: 'Rate', type: 'number', defaultValue: 1, min: 0 },
      { key: 'detune', label: 'Detune', type: 'number', defaultValue: 0 },
      {
        key: 'volume',
        label: 'Volume',
        type: 'number',
        defaultValue: 0,
        min: -1,
        max: 100,
        step: 0.01,
      },
      {
        key: 'timeline',
        label: 'Timeline',
        type: 'time-range',
        defaultValue: { startSec: 0, endSec: -1, cursorSec: -1 },
        min: 0,
        step: 0.01,
      },
    ],
    process: (inputs, config, context) => {
      const assetId = typeof config.assetId === 'string' ? config.assetId.trim() : '';
      const timeline = resolveAudioTimelineInputs(inputs, config);

      if (!assetId) {
        loadAudioTimelineState.delete(context.nodeId);
        return { ref: 0, ended: false };
      }

      // Manager-side simulation: the actual audio playback is implemented on the client runtime.
      const ended = computeLoadAudioFinished({
        nodeId: context.nodeId,
        signature: createAudioTimelineSignature({ asset: assetId, ...timeline }),
        deltaTimeMs: context.deltaTime,
        ...timeline,
      });

      return { ref: timeline.play ? 1 : 0, ended };
    },
  };
}

export function createLoadAudioAssetFromAssetsNode(): NodeDefinition {
  return {
    type: 'load-audio-asset-from-assets',
    label: 'Load Audio Asset From Remote',
    category: 'Assets',
    inputs: [],
    outputs: [{ id: 'ref', label: 'Audio Asset', type: 'asset' }],
    configSchema: [
      {
        key: 'assetId',
        label: 'Audio Asset',
        type: 'asset-picker',
        assetKind: 'audio',
        defaultValue: '',
      },
    ],
    process: (_inputs, config) => {
      const assetId = typeof config.assetId === 'string' ? config.assetId.trim() : '';
      return { ref: assetId ? `asset:${assetId}` : '' };
    },
  };
}

export function createLoadAudioFromLocalNode(): NodeDefinition {
  return {
    type: 'load-audio-from-local',
    label: 'Load Audio From Local(Display only)',
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
      { id: 'playbackRate', label: 'Rate', type: 'number', defaultValue: 1, min: 0 },
      { id: 'detune', label: 'Detune', type: 'number', defaultValue: 0 },
      {
        id: 'volume',
        label: 'Volume',
        type: 'number',
        defaultValue: 0,
        min: -1,
        max: 100,
        step: 0.01,
      },
    ],
    outputs: [
      { id: 'ref', label: 'Audio Out', type: 'audio', kind: 'sink' },
      { id: 'ended', label: 'Finish', type: 'boolean' },
    ],
    configSchema: [
      {
        key: 'assetPath',
        label: 'Audio Asset',
        type: 'local-asset-picker',
        assetKind: 'audio',
        defaultValue: '',
      },
      { key: 'playbackRate', label: 'Rate', type: 'number', defaultValue: 1, min: 0 },
      { key: 'detune', label: 'Detune', type: 'number', defaultValue: 0 },
      {
        key: 'volume',
        label: 'Volume',
        type: 'number',
        defaultValue: 0,
        min: -1,
        max: 100,
        step: 0.01,
      },
      {
        key: 'timeline',
        label: 'Timeline',
        type: 'time-range',
        defaultValue: { startSec: 0, endSec: -1, cursorSec: -1 },
        min: 0,
        step: 0.01,
      },
    ],
    process: (inputs, config, context) => {
      const asset =
        typeof inputs.asset === 'string' && inputs.asset.trim()
          ? inputs.asset.trim()
          : getRecordString(config, 'assetPath') ?? '';
      const timeline = resolveAudioTimelineInputs(inputs, config);

      if (!asset) {
        loadAudioTimelineState.delete(context.nodeId);
        return { ref: 0, ended: false };
      }

      const ended = computeLoadAudioFinished({
        nodeId: context.nodeId,
        signature: createAudioTimelineSignature({ asset, ...timeline }),
        deltaTimeMs: context.deltaTime,
        ...timeline,
      });

      // Client runtime may override this for real playback. Manager-side stays as a best-effort sim.
      return { ref: timeline.play ? 1 : 0, ended };
    },
  };
}
