/**
 * Purpose: Register the Aliyun TTS source node for client-side Tone audio playback.
 */
import type { NodeRegistry, ProcessContext } from '@shugu/node-core';
import { toneAudioEngine } from '@shugu/multimedia-core';
import type { ToneAdapterDeps, TonePlayerInstance } from '../types.js';
import {
  DEFAULT_RAMP_SECONDS,
  ensureTone,
  latestAudioConnections,
  playerInstances,
  toneModule,
} from '../state.js';
import { createPlayerInstance, disposePlayerInstance, requestTonePlayerLoad } from '../nodes.js';
import { toAssetVolumeGain, toBoolean, toString } from '../utils.js';

type TtsState = {
  signature: string;
  url: string;
  inFlight: boolean;
  errorSignature: string | null;
};

type TtsResponse = {
  url?: unknown;
  mimeType?: unknown;
  usage?: unknown;
};

const ttsStates = new Map<string, TtsState>();

function buildServerEndpoint(serverUrl: string | undefined): string {
  const base = typeof serverUrl === 'string' && serverUrl.trim() ? serverUrl.trim() : '';
  if (!base) return '';
  return `${base.replace(/\/+$/, '')}/api/tts/synthesize`;
}

function buildSignature(input: {
  text: string;
  model: string;
  voice: string;
  languageType: string;
  instructions: string;
}): string {
  return JSON.stringify(input);
}

function stopPlayer(instance: TonePlayerInstance): void {
  if (!instance.started) return;
  try {
    instance.manualStopPending = true;
    instance.player.stop();
  } catch {
    instance.manualStopPending = false;
  }
  instance.started = false;
  instance.startedAt = 0;
  instance.startOffsetSec = 0;
  instance.startDurationSec = null;
}

function resetPlayerForUrl(instance: TonePlayerInstance, url: string): void {
  if (instance.lastUrl === url) return;
  const wasStarted = instance.started;
  instance.lastUrl = url;
  instance.loadedUrl = null;
  instance.failedUrl = null;
  instance.autostarted = false;
  instance.started = false;
  instance.startedAt = 0;
  instance.startOffsetSec = 0;
  instance.startDurationSec = null;
  instance.pausedOffsetSec = null;
  instance.lastClip = null;
  instance.lastCursorSec = null;
  instance.ended = false;
  instance.endedReported = false;
  instance.manualStopPending = false;
  try {
    instance.loadController?.abort();
  } catch {
    // ignore
  }
  instance.loadController = null;
  instance.loadingUrl = null;
  try {
    if (wasStarted) instance.manualStopPending = true;
    instance.player.stop();
  } catch {
    instance.manualStopPending = false;
  }
}

function startPlayer(instance: TonePlayerInstance): void {
  if (!toneModule || instance.started || instance.loading) return;
  if (!instance.lastUrl || instance.loadedUrl !== instance.lastUrl) return;
  if (instance.ended) return;

  try {
    instance.player.start(undefined, 0);
    instance.started = true;
    instance.startedAt = toneModule.now();
    instance.startOffsetSec = 0;
    instance.startDurationSec = null;
    instance.pausedOffsetSec = null;
    instance.ended = false;
    instance.endedReported = false;
  } catch (error) {
    console.warn('[tone-adapter] aliyun-tts player start failed', error);
  }
}

async function requestTtsAudio(
  nodeId: string,
  endpoint: string,
  signature: string,
  payload: Record<string, unknown>
): Promise<void> {
  const state = ttsStates.get(nodeId);
  if (!state || state.signature !== signature || state.inFlight) return;
  state.inFlight = true;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`TTS request failed (${response.status}): ${body || response.statusText}`);
    }

    const json = (await response.json()) as TtsResponse;
    const url = typeof json.url === 'string' ? json.url.trim() : '';
    if (!url) throw new Error('TTS response missing audio URL');

    const current = ttsStates.get(nodeId);
    if (!current || current.signature !== signature) return;
    current.url = url;
    current.errorSignature = null;
  } catch (error) {
    const current = ttsStates.get(nodeId);
    if (current && current.signature === signature) current.errorSignature = signature;
    console.warn('[tone-adapter] aliyun-tts synthesize failed', error);
  } finally {
    const current = ttsStates.get(nodeId);
    if (current && current.signature === signature) current.inFlight = false;
  }
}

function disposeAliyunTtsNode(nodeId: string): void {
  ttsStates.delete(nodeId);
  disposePlayerInstance(nodeId);
}

export function disposeAliyunTtsNodesExcept(activeNodeIds: Set<string>): void {
  for (const nodeId of Array.from(ttsStates.keys())) {
    if (!activeNodeIds.has(nodeId)) disposeAliyunTtsNode(nodeId);
  }
}

export function disposeAllAliyunTtsNodes(): void {
  for (const nodeId of Array.from(ttsStates.keys())) {
    disposeAliyunTtsNode(nodeId);
  }
}

export function disposeAliyunTtsNodeById(nodeId: string): void {
  disposeAliyunTtsNode(nodeId);
}

export function registerAliyunTtsNode(registry: NodeRegistry, deps: ToneAdapterDeps): void {
  registry.register({
    type: 'aliyun-tts',
    label: 'Aliyun TTS',
    category: 'AI',
    inputs: [
      { id: 'text', label: 'Text', type: 'string', defaultValue: '' },
      { id: 'play', label: 'Play', type: 'boolean', defaultValue: true },
      { id: 'volume', label: 'Volume', type: 'number', defaultValue: 0, min: -1, max: 100, step: 0.01 },
    ],
    outputs: [{ id: 'ref', label: 'Audio Out', type: 'audio', kind: 'sink' }],
    configSchema: [
      { key: 'model', label: 'Model', type: 'string', defaultValue: 'qwen3-tts-flash' },
      { key: 'voice', label: 'Voice', type: 'string', defaultValue: 'Cherry' },
      { key: 'languageType', label: 'Language', type: 'string', defaultValue: 'Chinese' },
      { key: 'instructions', label: 'Instructions', type: 'string', defaultValue: '' },
    ],
    process: (
      inputs: Record<string, unknown>,
      config: Record<string, unknown>,
      context: ProcessContext
    ): Record<string, unknown> => {
      const text = toString(inputs.text ?? config.text, '');
      const play = toBoolean(inputs.play ?? config.play, true);
      const volume = toAssetVolumeGain(inputs.volume ?? config.volume);
      const model = toString(config.model, 'qwen3-tts-flash');
      const voice = toString(config.voice, 'Cherry');
      const languageType = toString(config.languageType, 'Chinese');
      const instructions = toString(config.instructions, '');
      const outValue = text && play ? 1 : 0;

      if (!text) {
        disposeAliyunTtsNode(context.nodeId);
        return { ref: 0 };
      }

      if (!toneAudioEngine.isEnabled()) {
        return { ref: outValue };
      }

      if (!toneModule) {
        void ensureTone().catch((error) =>
          console.warn('[tone-adapter] Tone.js load failed', error)
        );
        return { ref: outValue };
      }

      const hasAudioConnections = latestAudioConnections.some(
        (conn) => conn.sourceNodeId === context.nodeId || conn.targetNodeId === context.nodeId
      );
      if (!hasAudioConnections) {
        if (playerInstances.has(context.nodeId)) disposePlayerInstance(context.nodeId);
        return { ref: outValue };
      }

      const endpoint = buildServerEndpoint(deps.serverUrl);
      if (!endpoint) {
        console.warn('[tone-adapter] aliyun-tts requires serverUrl');
        return { ref: 0 };
      }

      const signature = buildSignature({ text, model, voice, languageType, instructions });
      let state = ttsStates.get(context.nodeId);
      if (!state || state.signature !== signature) {
        state = { signature, url: '', inFlight: false, errorSignature: null };
        ttsStates.set(context.nodeId, state);
        if (playerInstances.has(context.nodeId)) disposePlayerInstance(context.nodeId);
      }

      if (!state.url && !state.inFlight && state.errorSignature !== signature) {
        void requestTtsAudio(context.nodeId, endpoint, signature, {
          text,
          model,
          voice,
          languageType,
          instructions,
        });
      }

      if (!state.url) {
        return { ref: 0 };
      }

      let instance = playerInstances.get(context.nodeId);
      if (!instance) {
        instance = createPlayerInstance(context.nodeId, {
          playbackRate: 1,
          detune: 0,
          volume,
          loop: false,
          playing: play,
        });
      }

      resetPlayerForUrl(instance, state.url);
      requestTonePlayerLoad(instance);

      if (instance.lastParams.volume !== volume) {
        instance.gain.gain.rampTo(volume, DEFAULT_RAMP_SECONDS);
      }
      instance.lastParams = { ...instance.lastParams, volume, playing: play, loop: false };
      instance.playing = play;

      if (!play) {
        stopPlayer(instance);
        instance.ended = false;
        instance.endedReported = false;
        return { ref: 0 };
      }

      if (instance.ended) {
        return { ref: 0 };
      }

      startPlayer(instance);
      return { ref: instance.started || instance.loading ? 1 : 0 };
    },
    onDisable: (_inputs, _config, context) => {
      disposeAliyunTtsNode(context.nodeId);
    },
  });
}
