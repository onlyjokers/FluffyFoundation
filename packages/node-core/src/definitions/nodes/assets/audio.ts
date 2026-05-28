/**
 * Purpose: Audio asset loader node definitions and manager-side playback timeline simulation.
 */
import type { NodeDefinition } from '../../../types.js';
import { normalizeLocalMediaRef } from '../../media-utils.js';
import { clampNumber, coerceBoolean, coerceBooleanOr, coerceNumber } from '../../utils.js';
import { getRecordString, getStringValue } from '../node-definition-utils.js';
import type { ClientObjectDeps } from '../../types.js';

type LoadAudioTimelineState = {
  signature: string;
  lastPlay: boolean;
  lastCursorSec: number | null;
  startedFromSec: number | null;
  progressedSec: number;
  ended: boolean;
};

type GenerateTtsAudioAssetState = {
  lastTrigger: boolean;
  currentSignature: string;
  currentAssetId: string;
  assetIdBySignature: Map<string, string>;
  requestedSignatures: Set<string>;
};

type SpeechToTextState = {
  lastTrigger: boolean;
  currentSignature: string;
  currentText: string;
  textBySignature: Map<string, string>;
  requestedSignatures: Set<string>;
};

const loadAudioTimelineState = new Map<string, LoadAudioTimelineState>();
const generateTtsAudioAssetStateByNodeId = new Map<string, GenerateTtsAudioAssetState>();
const speechToTextStateByNodeId = new Map<string, SpeechToTextState>();

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
      const assetId = assetRaw.startsWith('asset:')
        ? assetRaw.slice('asset:'.length).trim()
        : assetRaw;
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
      return { ref: assetId ? normalizeAssetRef(assetId) : '' };
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

function buildSpeechToTextSignature(input: { assetId: string; model: string }): string {
  return JSON.stringify(input);
}

function getGenerateTtsAudioAssetState(nodeId: string): GenerateTtsAudioAssetState {
  const existing = generateTtsAudioAssetStateByNodeId.get(nodeId);
  if (existing) return existing;
  const next: GenerateTtsAudioAssetState = {
    lastTrigger: false,
    currentSignature: '',
    currentAssetId: '',
    assetIdBySignature: new Map(),
    requestedSignatures: new Set(),
  };
  generateTtsAudioAssetStateByNodeId.set(nodeId, next);
  return next;
}

function getSpeechToTextState(nodeId: string): SpeechToTextState {
  const existing = speechToTextStateByNodeId.get(nodeId);
  if (existing) return existing;
  const next: SpeechToTextState = {
    lastTrigger: false,
    currentSignature: '',
    currentText: '',
    textBySignature: new Map(),
    requestedSignatures: new Set(),
  };
  speechToTextStateByNodeId.set(nodeId, next);
  return next;
}

function normalizeTtsAssetId(raw: string | null | undefined): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return '';
  return value.startsWith('asset:') ? value.slice('asset:'.length).trim() : value;
}

function normalizeAssetIdFromRef(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const value = raw.trim();
  if (!value) return '';
  if (value.startsWith('asset:'))
    return value.slice('asset:'.length).trim().split(/[?#]/)[0]?.trim() ?? '';
  const shuguPrefix = 'shugu://asset/';
  if (value.startsWith(shuguPrefix))
    return value.slice(shuguPrefix.length).trim().split(/[?#]/)[0]?.trim() ?? '';
  return value.split(/[?#]/)[0]?.trim() ?? '';
}

function outputForTtsAsset(assetId: string): Record<string, unknown> {
  return assetId ? { assetId, asset: normalizeAssetRef(assetId) } : { assetId: '', asset: '' };
}

const TTS_MODEL_OPTIONS = [{ value: 'qwen3-tts-flash', label: 'Qwen3 TTS Flash' }];
const TTS_VOICE_OPTIONS = [
  { value: 'Cherry', label: 'Cherry' },
  { value: 'Chelsie', label: 'Chelsie' },
  { value: 'Serena', label: 'Serena' },
  { value: 'Ethan', label: 'Ethan' },
];
const TTS_LANGUAGE_OPTIONS = [
  { value: 'Chinese', label: 'Chinese' },
  { value: 'English', label: 'English' },
  { value: 'Japanese', label: 'Japanese' },
  { value: 'Korean', label: 'Korean' },
];

export function createGenerateTtsAudioAssetNode(deps: ClientObjectDeps): NodeDefinition {
  return {
    type: 'generate-tts-audio',
    label: 'Generate TTS Audio',
    category: 'AI',
    inputs: [
      { id: 'text', label: 'Text', type: 'string', defaultValue: '' },
      {
        id: 'trigger',
        label: 'Trigger',
        type: 'pulse',
        defaultValue: false,
        buttonLabel: 'Generate',
      },
      {
        id: 'model',
        label: 'Model',
        type: 'string',
        defaultValue: 'qwen3-tts-flash',
        options: TTS_MODEL_OPTIONS,
      },
      {
        id: 'voice',
        label: 'Voice',
        type: 'string',
        defaultValue: 'Cherry',
        options: TTS_VOICE_OPTIONS,
      },
      {
        id: 'languageType',
        label: 'Language',
        type: 'string',
        defaultValue: 'Chinese',
        options: TTS_LANGUAGE_OPTIONS,
      },
      { id: 'instructions', label: 'Instructions', type: 'string', defaultValue: '' },
      {
        id: 'optimizeInstructions',
        label: 'Optimize Instructions',
        type: 'boolean',
        defaultValue: false,
      },
    ],
    outputs: [
      { id: 'assetId', label: 'Asset ID', type: 'string' },
      { id: 'asset', label: 'Asset', type: 'asset' },
    ],
    configSchema: [
      {
        key: 'model',
        label: 'Model',
        type: 'select',
        defaultValue: 'qwen3-tts-flash',
        connectable: true,
        options: TTS_MODEL_OPTIONS,
      },
      {
        key: 'voice',
        label: 'Voice',
        type: 'select',
        defaultValue: 'Cherry',
        connectable: true,
        options: TTS_VOICE_OPTIONS,
      },
      {
        key: 'languageType',
        label: 'Language',
        type: 'select',
        defaultValue: 'Chinese',
        connectable: true,
        options: TTS_LANGUAGE_OPTIONS,
      },
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
          rule: 'Connect the asset output into Load Audio From Remote before audio processors or Audio Out.',
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
      risks: ['Requires server-side DashScope credentials and asset write access.'],
      description: 'Generate reusable audio from text using the server-side TTS asset pipeline.',
      repairHints: [
        'Connect the Asset output to Load Audio From Remote, then connect that audio output through Tone or Audio Out.',
      ],
    },
    process: (inputs, config, context) => {
      const state = getGenerateTtsAudioAssetState(context.nodeId);
      const text = typeof inputs.text === 'string' ? inputs.text.trim() : '';
      const trigger = coerceBooleanOr(inputs.trigger, false);
      const model =
        getStringValue(inputs.model) || getStringValue(config.model) || 'qwen3-tts-flash';
      const voice = getStringValue(inputs.voice) || getStringValue(config.voice) || 'Cherry';
      const languageType =
        getStringValue(inputs.languageType) || getStringValue(config.languageType) || 'Chinese';
      const instructions =
        getStringValue(inputs.instructions) || getStringValue(config.instructions) || '';
      const optimizeInstructions = coerceBooleanOr(
        inputs.optimizeInstructions ?? config.optimizeInstructions,
        false
      );
      const signature = buildTtsSignature({
        text,
        model,
        voice,
        languageType,
        instructions,
        optimizeInstructions,
      });

      if (state.currentSignature !== signature) {
        state.currentSignature = signature;
        state.currentAssetId = state.assetIdBySignature.get(signature) ?? state.currentAssetId;
      }

      if (!text) {
        state.lastTrigger = trigger;
        return outputForTtsAsset(state.currentAssetId);
      }

      const request = {
        nodeId: context.nodeId,
        signature,
        text,
        model,
        voice,
        languageType,
        instructions,
        optimizeInstructions,
      };
      const rising = trigger && !state.lastTrigger;
      if (rising) {
        state.requestedSignatures.add(signature);
        const nextAssetId = normalizeTtsAssetId(deps.audioAssets?.getTtsAudioAsset?.(request));
        if (nextAssetId) {
          state.assetIdBySignature.set(signature, nextAssetId);
          state.currentAssetId = nextAssetId;
        }
        state.lastTrigger = trigger;
        return outputForTtsAsset(state.currentAssetId);
      }

      const cached =
        state.assetIdBySignature.get(signature) ??
        (state.requestedSignatures.has(signature)
          ? normalizeTtsAssetId(
              deps.audioAssets?.peekTtsAudioAsset?.(request) ??
                deps.audioAssets?.getTtsAudioAsset?.(request)
            )
          : '');
      if (cached) {
        state.assetIdBySignature.set(signature, cached);
        state.currentAssetId = cached;
        state.lastTrigger = trigger;
        return outputForTtsAsset(cached);
      }

      state.lastTrigger = trigger;
      return outputForTtsAsset(state.currentAssetId);
    },
    onDisable: (_inputs, _config, context) => {
      generateTtsAudioAssetStateByNodeId.delete(context.nodeId);
    },
  };
}

export function createSpeechToTextNode(deps: ClientObjectDeps): NodeDefinition {
  return {
    type: 'speech-to-text',
    label: 'Speech to Text',
    category: 'AI',
    inputs: [
      { id: 'asset', label: 'Asset', type: 'asset', defaultValue: '' },
      {
        id: 'trigger',
        label: 'Trigger',
        type: 'pulse',
        defaultValue: false,
        buttonLabel: 'Transcribe',
      },
      {
        id: 'model',
        label: 'Model',
        type: 'string',
        defaultValue: 'qwen3-asr-flash',
        options: [{ value: 'qwen3-asr-flash', label: 'Qwen3 ASR Flash' }],
      },
    ],
    outputs: [
      { id: 'text', label: 'Text', type: 'string' },
      { id: 'done', label: 'Done', type: 'pulse' },
    ],
    configSchema: [
      {
        key: 'model',
        label: 'Model',
        type: 'string',
        defaultValue: 'qwen3-asr-flash',
        options: [{ value: 'qwen3-asr-flash', label: 'Qwen3 ASR Flash' }],
        connectable: true,
      },
    ],
    metadata: {
      version: '1.0.0',
      platformTargets: ['manager', 'server'],
      sideEffectClass: 'network',
      permissions: [],
      description: 'Transcribe an audio asset with the server-side STT pipeline.',
      compatibility: [
        {
          target: 'record-sound-button',
          rule: 'Connect a recorded audio Asset into Speech to Text before triggering transcription.',
          repairHint: 'Use Record Sound Button or another audio asset source as the Asset input.',
        },
      ],
      examples: [
        {
          title: 'Transcribe Client recording',
          summary: 'Record audio on a Client, then trigger Speech to Text to produce a String.',
        },
      ],
      repairHints: [
        'Connect an audio Asset from Record Sound Button before triggering transcription.',
      ],
      risks: ['Requires server-side DashScope credentials.'],
    },
    process: (inputs, config, context) => {
      const state = getSpeechToTextState(context.nodeId);
      const assetId = normalizeAssetIdFromRef(inputs.asset);
      const trigger = coerceBooleanOr(inputs.trigger, false);
      const model =
        getStringValue(inputs.model) || getStringValue(config.model) || 'qwen3-asr-flash';
      const signature = buildSpeechToTextSignature({ assetId, model });

      if (state.currentSignature !== signature) {
        state.currentSignature = signature;
        state.currentText = state.textBySignature.get(signature) ?? state.currentText;
      }

      if (!assetId) {
        state.lastTrigger = trigger;
        return { text: state.currentText, done: false };
      }

      const request = { nodeId: context.nodeId, signature, assetId, model };
      const rising = trigger && !state.lastTrigger;
      let done = false;
      if (rising) {
        state.requestedSignatures.add(signature);
        const text = deps.audioAssets?.getSpeechToText?.(request)?.trim() ?? '';
        if (text) {
          state.textBySignature.set(signature, text);
          state.currentText = text;
          done = true;
        }
      } else {
        const text =
          state.textBySignature.get(signature) ??
          (state.requestedSignatures.has(signature)
            ? (deps.audioAssets?.peekSpeechToText?.(request)?.trim() ??
              deps.audioAssets?.getSpeechToText?.(request)?.trim() ??
              '')
            : '');
        if (text) {
          done = text !== state.currentText;
          state.textBySignature.set(signature, text);
          state.currentText = text;
        }
      }

      state.lastTrigger = trigger;
      return { text: state.currentText, done };
    },
    onDisable: (_inputs, _config, context) => {
      speechToTextStateByNodeId.delete(context.nodeId);
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
    configSchema: [{ key: 'name', label: 'Name', type: 'string', defaultValue: '' }],
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
      const assetId = assetRaw.startsWith('asset:')
        ? assetRaw.slice('asset:'.length).trim()
        : assetRaw;
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
          : (getRecordString(config, 'assetPath') ?? '');
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
