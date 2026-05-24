/**
 * Purpose: Audio asset loader node definitions and manager-side playback timeline simulation.
 */
import type { NodeDefinition } from '../../../types.js';
import { normalizeLocalMediaRef } from '../../media-utils.js';
import { clampNumber, coerceBoolean, coerceBooleanOr, coerceNumber } from '../../utils.js';
import { getRecordString } from '../node-definition-utils.js';
import type { ClientObjectDeps } from '../../types.js';

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
      { id: 'asset', label: 'Asset', type: 'asset', defaultValue: '' },
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
      const assetRaw =
        typeof inputs.asset === 'string' && inputs.asset.trim()
          ? inputs.asset.trim()
          : typeof config.assetId === 'string'
            ? config.assetId.trim()
            : '';
      const assetId = assetRaw.startsWith('asset:') ? assetRaw.slice('asset:'.length).trim() : assetRaw;
      const timeline = resolveAudioTimelineInputs(inputs, config);

      if (!assetId) {
        loadAudioTimelineState.delete(context.nodeId);
        return { ref: 0, ended: false };
      }

      // Manager-side simulation: the actual audio playback is implemented on the client runtime.
      const ended = computeLoadAudioFinished({
        nodeId: context.nodeId,
        signature: createAudioTimelineSignature({ asset: assetRaw || assetId, ...timeline }),
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

function normalizeAssetRef(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('asset:')) return trimmed;
  const shuguPrefix = 'shugu://asset/';
  if (trimmed.startsWith(shuguPrefix)) {
    const id = trimmed.slice(shuguPrefix.length).trim().split(/[?#]/)[0]?.trim() ?? '';
    return id ? `asset:${id}` : '';
  }
  const id = trimmed.split(/[?#]/)[0]?.trim() ?? '';
  return id ? `asset:${id}` : '';
}

function buildTtsSignature(input: {
  text: string;
  model: string;
  voice: string;
  languageType: string;
  instructions: string;
  optimizeInstructions: boolean;
}): string {
  return JSON.stringify(input);
}

export function createGenerateTtsAudioAssetNode(deps: ClientObjectDeps): NodeDefinition {
  return {
    type: 'generate-tts-audio-asset',
    label: 'Generate TTS Audio Asset',
    category: 'AI',
    inputs: [
      { id: 'text', label: 'Text', type: 'string', defaultValue: '' },
      { id: 'trigger', label: 'Trigger', type: 'boolean', defaultValue: true },
    ],
    outputs: [
      { id: 'assetId', label: 'Asset ID', type: 'string' },
      { id: 'asset', label: 'Asset', type: 'asset' },
    ],
    configSchema: [
      { key: 'model', label: 'Model', type: 'string', defaultValue: 'qwen3-tts-flash' },
      { key: 'voice', label: 'Voice', type: 'string', defaultValue: 'Cherry' },
      { key: 'languageType', label: 'Language', type: 'string', defaultValue: 'Chinese' },
      { key: 'instructions', label: 'Instructions', type: 'string', defaultValue: '' },
      {
        key: 'optimizeInstructions',
        label: 'Optimize Instructions',
        type: 'boolean',
        defaultValue: false,
      },
    ],
    metadata: {
      version: '1.0.0',
      platformTargets: ['manager', 'server'],
      sideEffectClass: 'network',
      permissions: [],
      compatibility: [
        {
          target: 'load-audio-from-assets',
          rule: 'Produces an asset ref that can feed Load Audio From Assets via the asset input.',
        },
      ],
      examples: [
        {
          title: 'Generate reusable speech asset',
          summary: 'Generate a speech asset once, then feed it into the playback chain.',
          inputs: { text: '你好，世界', trigger: true },
          config: { model: 'qwen3-tts-flash', voice: 'Cherry' },
        },
      ],
      risks: [
        'Requires server-side DashScope credentials and asset write access.',
      ],
      description:
        'Generate a reusable audio asset from text using the server-side TTS asset pipeline.',
      repairHints: [
        'Keep the node on the manager/control plane; its output is an asset reference, not live audio.',
      ],
    },
    process: (inputs, config, context) => {
      const text = typeof inputs.text === 'string' ? inputs.text.trim() : '';
      const trigger = coerceBooleanOr(inputs.trigger, true);
      const model = typeof config.model === 'string' ? config.model.trim() : 'qwen3-tts-flash';
      const voice = typeof config.voice === 'string' ? config.voice.trim() : 'Cherry';
      const languageType = typeof config.languageType === 'string' ? config.languageType.trim() : 'Chinese';
      const instructions = typeof config.instructions === 'string' ? config.instructions.trim() : '';
      const optimizeInstructions = coerceBooleanOr(config.optimizeInstructions, false);
      const signature = buildTtsSignature({
        text,
        model,
        voice,
        languageType,
        instructions,
        optimizeInstructions,
      });

      if (!text || !trigger) {
        return { assetId: '', asset: '' };
      }

      const assetId = deps.audioAssets?.getTtsAudioAsset?.({
        nodeId: context.nodeId,
        signature,
        text,
        model,
        voice,
        languageType,
        instructions,
        optimizeInstructions,
      }) ?? '';
      return { assetId, asset: assetId ? normalizeAssetRef(assetId) : '' };
    },
  };
}

export function createUploadAudioToDropBoxNode(deps: ClientObjectDeps): NodeDefinition {
  return {
    type: 'upload-audio-to-drop-box',
    label: 'Upload to Drop Box for Audio',
    category: 'Assets',
    inputs: [
      { id: 'assetId', label: 'Asset ID', type: 'string', defaultValue: '' },
      { id: 'asset', label: 'Asset', type: 'asset', defaultValue: '' },
    ],
    outputs: [
      { id: 'assetId', label: 'Asset ID', type: 'string' },
      { id: 'asset', label: 'Asset', type: 'asset' },
    ],
    configSchema: [
      { key: 'name', label: 'Name', type: 'string', defaultValue: '' },
    ],
    metadata: {
      version: '1.0.0',
      platformTargets: ['manager', 'server'],
      sideEffectClass: 'network',
      permissions: [],
      compatibility: [
        {
          target: 'reference-audio-from-drop-box',
          rule: 'Stores an audio asset reference in the persistent Drop Box queue.',
        },
      ],
      examples: [
        {
          title: 'Queue reusable speech',
          summary: 'Push a synthesized speech asset into the Drop Box queue.',
        },
      ],
      risks: ['Requires asset write access and a persistent asset store.'],
      description: 'Push an audio asset reference into the persistent Drop Box queue.',
    },
    process: (inputs, config, context) => {
      const assetRaw =
        typeof inputs.asset === 'string' && inputs.asset.trim()
          ? inputs.asset.trim()
          : typeof inputs.assetId === 'string'
            ? inputs.assetId.trim()
            : '';
      const assetId = assetRaw.startsWith('asset:') ? assetRaw.slice('asset:'.length).trim() : assetRaw;
      const name = typeof config.name === 'string' ? config.name.trim() : '';
      if (!assetId) return { assetId: '', asset: '' };
      const nextAssetId =
        deps.audioAssets?.uploadAudioToDropBox?.({
          nodeId: context.nodeId,
          signature: `${assetId}|${name}`,
          assetId,
          ...(name ? { name } : {}),
        }) ?? assetId;
      return { assetId: nextAssetId, asset: nextAssetId ? `asset:${nextAssetId}` : '' };
    },
  };
}

export function createReferenceAudioFromDropBoxNode(deps: ClientObjectDeps): NodeDefinition {
  return {
    type: 'reference-audio-from-drop-box',
    label: 'Reference from Drop Box for Audio',
    category: 'Assets',
    inputs: [],
    outputs: [
      { id: 'assetId', label: 'Asset ID', type: 'string' },
      { id: 'asset', label: 'Asset', type: 'asset' },
    ],
    configSchema: [
      { key: 'assetId', label: 'Asset ID', type: 'string', defaultValue: '' },
      { key: 'name', label: 'Name', type: 'string', defaultValue: '' },
      { key: 'index', label: 'Index', type: 'number', defaultValue: -1, min: -1, step: 1 },
      { key: 'latest', label: 'Latest', type: 'boolean', defaultValue: true },
    ],
    metadata: {
      version: '1.0.0',
      platformTargets: ['manager', 'server'],
      sideEffectClass: 'network',
      permissions: [],
      compatibility: [
        {
          target: 'load-audio-from-assets',
          rule: 'Resolves a queued audio asset ref for playback.',
        },
      ],
      examples: [
        {
          title: 'Read latest queued speech',
          summary: 'Return the newest audio asset reference from the Drop Box.',
        },
      ],
      risks: ['Depends on the persistent Drop Box queue being available on the server.'],
      description: 'Resolve an audio asset reference from the persistent Drop Box queue.',
    },
    process: (_inputs, config, context) => {
      const assetId = typeof config.assetId === 'string' ? config.assetId.trim() : '';
      const name = typeof config.name === 'string' ? config.name.trim() : '';
      const indexRaw = typeof config.index === 'number' ? config.index : Number(config.index);
      const index = Number.isFinite(indexRaw) ? Math.floor(indexRaw) : -1;
      const latest = coerceBooleanOr(config.latest, true);
      const nextAssetId =
        deps.audioAssets?.referenceAudioFromDropBox?.({
          nodeId: context.nodeId,
          signature: `${assetId}|${name}|${index}|${latest ? 1 : 0}`,
          ...(assetId ? { assetId } : {}),
          ...(name ? { name } : {}),
          index,
          latest,
        }) ?? assetId;
      return { assetId: nextAssetId, asset: nextAssetId ? `asset:${nextAssetId}` : '' };
    },
  };
}

export function createLoadAudioFromLocalNode(): NodeDefinition {
  return {
    type: 'load-audio-from-local',
    label: 'Load Audio From Local(Display)',
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
