/**
 * Purpose: Asset loader node definitions (audio/image/video).
 */
import type { NodeDefinition } from '../../types.js';
import { normalizeLocalMediaRef } from '../media-utils.js';
import { clampNumber, coerceAssetVolumeGain, coerceBoolean, coerceNumber } from '../utils.js';
import { getRecordString } from './node-definition-utils.js';

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
  clipEnd: number; // -1 means open-ended (unknown duration).
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
      const play = coerceBoolean(inputs.play);
      const loop = coerceBoolean(inputs.loop);
      const reverse = coerceBoolean(inputs.reverse);
      const playbackRate = Math.max(0, coerceNumber(inputs.playbackRate ?? config.playbackRate, 1));

      const clipStart = Math.max(0, coerceNumber(inputs.startSec, 0));
      const clipEndRaw = coerceNumber(inputs.endSec, -1);
      const clipEnd =
        Number.isFinite(clipEndRaw) && clipEndRaw >= 0 ? Math.max(clipStart, clipEndRaw) : -1;

      const cursorRaw = coerceNumber(inputs.cursorSec, -1);
      const cursorSec =
        Number.isFinite(cursorRaw) && cursorRaw >= 0 ? Math.max(0, cursorRaw) : null;

      if (!assetId) {
        loadAudioTimelineState.delete(context.nodeId);
        return { ref: 0, ended: false };
      }

      // Manager-side simulation: the actual audio playback is implemented on the client runtime.
      // Emit a best-effort Finish state based on the configured clip and playback controls.
      const signature = [
        assetId,
        Math.round(clipStart * 1000) / 1000,
        Math.round(clipEnd * 1000) / 1000,
        loop ? 1 : 0,
        reverse ? 1 : 0,
      ].join('|');

      const ended = computeLoadAudioFinished({
        nodeId: context.nodeId,
        signature,
        play,
        loop,
        reverse,
        playbackRate,
        clipStart,
        clipEnd,
        cursorSec,
        deltaTimeMs: context.deltaTime,
      });

      return { ref: play ? 1 : 0, ended };
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
      const play = coerceBoolean(inputs.play);
      const loop = coerceBoolean(inputs.loop);
      const reverse = coerceBoolean(inputs.reverse);
      const playbackRate = Math.max(0, coerceNumber(inputs.playbackRate ?? config.playbackRate, 1));

      const clipStart = Math.max(0, coerceNumber(inputs.startSec, 0));
      const clipEndRaw = coerceNumber(inputs.endSec, -1);
      const clipEnd =
        Number.isFinite(clipEndRaw) && clipEndRaw >= 0 ? Math.max(clipStart, clipEndRaw) : -1;

      const cursorRaw = coerceNumber(inputs.cursorSec, -1);
      const cursorSec =
        Number.isFinite(cursorRaw) && cursorRaw >= 0 ? Math.max(0, cursorRaw) : null;

      if (!asset) {
        loadAudioTimelineState.delete(context.nodeId);
        return { ref: 0, ended: false };
      }

      const signature = [
        asset,
        Math.round(clipStart * 1000) / 1000,
        Math.round(clipEnd * 1000) / 1000,
        loop ? 1 : 0,
        reverse ? 1 : 0,
      ].join('|');

      const ended = computeLoadAudioFinished({
        nodeId: context.nodeId,
        signature,
        play,
        loop,
        reverse,
        playbackRate,
        clipStart,
        clipEnd,
        cursorSec,
        deltaTimeMs: context.deltaTime,
      });

      // Client runtime may override this for real playback. Manager-side stays as a best-effort sim.
      return { ref: play ? 1 : 0, ended };
    },
  };
}

export function createLoadImageFromAssetsNode(): NodeDefinition {
  return {
    type: 'load-image-from-assets',
    label: 'Load Image From Remote',
    category: 'Assets',
    inputs: [],
    outputs: [{ id: 'ref', label: 'Image Out', type: 'image', kind: 'sink' }],
    configSchema: [
      {
        key: 'assetId',
        label: 'Image Asset',
        type: 'asset-picker',
        assetKind: 'image',
        defaultValue: '',
      },
    ],
    process: (_inputs, config) => {
      const assetId = typeof config.assetId === 'string' ? config.assetId.trim() : '';
      return { ref: assetId ? `asset:${assetId}` : '' };
    },
  };
}

export function createLoadImageFromLocalNode(): NodeDefinition {
  return {
    type: 'load-image-from-local',
    label: 'Load Image From Local(Display only)',
    category: 'Assets',
    inputs: [{ id: 'asset', label: 'Asset', type: 'string', defaultValue: '' }],
    outputs: [{ id: 'ref', label: 'Image Out', type: 'image', kind: 'sink' }],
    configSchema: [
      {
        key: 'assetPath',
        label: 'Image Asset',
        type: 'local-asset-picker',
        assetKind: 'image',
        defaultValue: '',
      },
    ],
    process: (inputs, config) => {
      const baseUrl =
        typeof inputs.asset === 'string' && inputs.asset.trim()
          ? inputs.asset.trim()
          : getRecordString(config, 'assetPath') ?? '';
      return { ref: baseUrl ? normalizeLocalMediaRef(baseUrl, 'image') : '' };
    },
  };
}

type LoadVideoTimelineState = {
  signature: string;
  lastPlay: boolean;
  accumulatedMs: number;
};

const loadVideoTimelineState = new Map<string, LoadVideoTimelineState>();

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

      const loopRaw = inputs.loop;
      const loop = typeof loopRaw === 'number' ? loopRaw >= 0.5 : Boolean(loopRaw);
      const playRaw = inputs.play;
      const play = typeof playRaw === 'number' ? playRaw >= 0.5 : Boolean(playRaw);
      const reverseRaw = inputs.reverse;
      const reverse = typeof reverseRaw === 'number' ? reverseRaw >= 0.5 : Boolean(reverseRaw);
      const mutedRaw = inputs.muted;
      const muted = typeof mutedRaw === 'number' ? mutedRaw >= 0.5 : Boolean(mutedRaw);
      const volumeGain = Math.round(coerceAssetVolumeGain(inputs.volume) * 100) / 100;
      const mutedEffective = muted || volumeGain <= 0;

      const startClamped = Math.max(0, startSec);
      const endClamped = endSec >= 0 ? Math.max(startClamped, endSec) : -1;
      const tValue = endClamped >= 0 ? `${startClamped},${endClamped}` : `${startClamped},`;

      const cursorClamped = cursorSec >= 0 ? Math.max(startClamped, cursorSec) : -1;
      const cursorForPlayback =
        cursorClamped >= 0
          ? endClamped >= 0
            ? Math.min(endClamped, cursorClamped)
            : cursorClamped
          : null;
      const positionParam = cursorForPlayback !== null ? `&p=${cursorForPlayback}` : '';
      const nodeParam = context?.nodeId
        ? `&node=${encodeURIComponent(String(context.nodeId))}`
        : '';
      const fitParam = fit !== 'contain' ? `&fit=${fit}` : '';

      const refBase = assetId
        ? `asset:${assetId}#t=${tValue}&loop=${loop ? 1 : 0}&play=${play ? 1 : 0}&rev=${reverse ? 1 : 0}&vol=${volumeGain}&muted=${mutedEffective ? 1 : 0}${positionParam}${nodeParam}`
        : '';

      const refWithFit = fitParam ? `${refBase}${fitParam}` : refBase;

      if (!assetId) {
        loadVideoTimelineState.delete(context.nodeId);
        return { ref: '', ended: false };
      }

      const qSec = (value: number): number => Math.round(value * 100) / 100;
      const signature = [
        assetId,
        qSec(startClamped),
        qSec(endClamped),
        qSec(cursorForPlayback ?? -1),
        loop ? 1 : 0,
        reverse ? 1 : 0,
      ].join('|');

      const prevState = loadVideoTimelineState.get(context.nodeId);
      const state: LoadVideoTimelineState = prevState ?? {
        signature: '',
        lastPlay: false,
        accumulatedMs: 0,
      };

      const settingsChanged = signature !== state.signature;
      if (settingsChanged) {
        state.signature = signature;
        state.accumulatedMs = 0;
      }

      const playActive = play;
      const playRising = playActive && !state.lastPlay;

      let durationSec: number | null = null;
      if (!loop) {
        if (reverse) {
          const startPos = cursorForPlayback ?? (endClamped >= 0 ? endClamped : startClamped);
          durationSec = Math.max(0, startPos - startClamped);
        } else if (endClamped >= 0) {
          const startPos = cursorForPlayback ?? startClamped;
          durationSec = Math.max(0, endClamped - startPos);
        }
      }

      const durationMs = durationSec !== null ? durationSec * 1000 : null;
      const atEdgeBefore = !loop && durationMs !== null && state.accumulatedMs >= durationMs;

      if (atEdgeBefore && playRising) {
        state.accumulatedMs = 0;
      }

      const dtMs =
        typeof context.deltaTime === 'number' && Number.isFinite(context.deltaTime)
          ? Math.max(0, context.deltaTime)
          : 0;

      if (!loop && durationMs !== null && playActive) {
        if (durationMs <= 0) {
          state.accumulatedMs = durationMs;
        } else if (state.lastPlay) {
          state.accumulatedMs += dtMs;
          if (state.accumulatedMs >= durationMs) {
            state.accumulatedMs = durationMs;
          }
        }
      }

      state.lastPlay = playActive;
      loadVideoTimelineState.set(context.nodeId, state);

      const ended = (() => {
        if (loop || durationMs === null) return false;
        const finishThresholdMs = Math.max(0, durationMs - 100);
        return state.accumulatedMs >= finishThresholdMs;
      })();
      return { ref: refWithFit, ended };
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

      const loopRaw = inputs.loop;
      const loop = typeof loopRaw === 'number' ? loopRaw >= 0.5 : Boolean(loopRaw);
      const playRaw = inputs.play;
      const play = typeof playRaw === 'number' ? playRaw >= 0.5 : Boolean(playRaw);
      const reverseRaw = inputs.reverse;
      const reverse = typeof reverseRaw === 'number' ? reverseRaw >= 0.5 : Boolean(reverseRaw);
      const mutedRaw = inputs.muted;
      const muted = typeof mutedRaw === 'number' ? mutedRaw >= 0.5 : Boolean(mutedRaw);
      const volumeGain = Math.round(coerceAssetVolumeGain(inputs.volume) * 100) / 100;
      const mutedEffective = muted || volumeGain <= 0;

      const startClamped = Math.max(0, startSec);
      const endClamped = endSec >= 0 ? Math.max(startClamped, endSec) : -1;
      const tValue = endClamped >= 0 ? `${startClamped},${endClamped}` : `${startClamped},`;

      const cursorClamped = cursorSec >= 0 ? Math.max(startClamped, cursorSec) : -1;
      const cursorForPlayback =
        cursorClamped >= 0
          ? endClamped >= 0
            ? Math.min(endClamped, cursorClamped)
            : cursorClamped
          : null;
      const positionParam = cursorForPlayback !== null ? `&p=${cursorForPlayback}` : '';
      const nodeParam = context?.nodeId
        ? `&node=${encodeURIComponent(String(context.nodeId))}`
        : '';
      const fitParam = fit !== 'contain' ? `&fit=${fit}` : '';

      const baseUrl = (() => {
        if (!localRef) return '';
        const hashIndex = localRef.indexOf('#');
        return hashIndex >= 0 ? localRef.slice(0, hashIndex) : localRef;
      })();

      const refBase = baseUrl
        ? `${baseUrl}#t=${tValue}&loop=${loop ? 1 : 0}&play=${play ? 1 : 0}&rev=${reverse ? 1 : 0}&vol=${volumeGain}&muted=${mutedEffective ? 1 : 0}${positionParam}${nodeParam}`
        : '';

      const refWithFit = fitParam ? `${refBase}${fitParam}` : refBase;

      if (!baseUrl) {
        loadVideoTimelineState.delete(context.nodeId);
        return { ref: '', ended: false };
      }

      const qSec = (value: number): number => Math.round(value * 100) / 100;
      const signature = [
        baseUrl,
        qSec(startClamped),
        qSec(endClamped),
        qSec(cursorForPlayback ?? -1),
        loop ? 1 : 0,
        reverse ? 1 : 0,
      ].join('|');

      const prevState = loadVideoTimelineState.get(context.nodeId);
      const state: LoadVideoTimelineState = prevState ?? {
        signature: '',
        lastPlay: false,
        accumulatedMs: 0,
      };

      const settingsChanged = signature !== state.signature;
      if (settingsChanged) {
        state.signature = signature;
        state.accumulatedMs = 0;
      }

      const playActive = play;
      const playRising = playActive && !state.lastPlay;

      let durationSec: number | null = null;
      if (!loop) {
        if (reverse) {
          const startPos = cursorForPlayback ?? (endClamped >= 0 ? endClamped : startClamped);
          durationSec = Math.max(0, startPos - startClamped);
        } else if (endClamped >= 0) {
          const startPos = cursorForPlayback ?? startClamped;
          durationSec = Math.max(0, endClamped - startPos);
        }
      }

      const durationMs = durationSec !== null ? durationSec * 1000 : null;
      const atEdgeBefore = !loop && durationMs !== null && state.accumulatedMs >= durationMs;

      if (atEdgeBefore && playRising) {
        state.accumulatedMs = 0;
      }

      const dtMs =
        typeof context.deltaTime === 'number' && Number.isFinite(context.deltaTime)
          ? Math.max(0, context.deltaTime)
          : 0;

      if (!loop && durationMs !== null && playActive) {
        if (durationMs <= 0) {
          state.accumulatedMs = durationMs;
        } else if (state.lastPlay) {
          state.accumulatedMs += dtMs;
          if (state.accumulatedMs >= durationMs) {
            state.accumulatedMs = durationMs;
          }
        }
      }

      state.lastPlay = playActive;
      loadVideoTimelineState.set(context.nodeId, state);

      const ended = (() => {
        if (loop || durationMs === null) return false;
        const finishThresholdMs = Math.max(0, durationMs - 100);
        return state.accumulatedMs >= finishThresholdMs;
      })();
      return { ref: refWithFit, ended };
    },
    onDisable: (_inputs, _config, context) => {
      // Reset manager-side timeline state so `Finish` doesn't stay latched across stop/start.
      loadVideoTimelineState.delete(context.nodeId);
    },
  };
}
