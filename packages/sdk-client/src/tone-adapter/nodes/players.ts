/**
 * Purpose: Manage Tone granular and player node instances and serialized audio loading.
 */
import type { PlayerOptions } from 'tone';
import type { ToneGainLike, ToneGranularInstance, TonePlayerInstance, TonePlayerLike } from '../types.js';
import { granularInstances, latestDeps, playerInstances, toneModule } from '../state.js';
import { scheduleGraphWiring } from '../engine-host.js';
import { toNonNegativeNumber } from '../utils.js';

export function createGranularInstance(
  nodeId: string,
  url: string,
  params: Record<string, number | boolean>
): ToneGranularInstance {
  const gain = new toneModule!.Gain({ gain: params.volume as number });
  const player = new toneModule!.GrainPlayer({
    url,
    loop: params.loop as boolean,
    grainSize: params.grainSize as number,
    overlap: params.overlap as number,
    playbackRate: params.playbackRate as number,
    detune: params.detune as number,
    onload: () => {
      if (granularInstances.get(nodeId)?.playing) {
        try {
          player.start();
        } catch {
          // ignore
        }
      }
    },
  });

  player.connect(gain);

  const instance: ToneGranularInstance = {
    nodeId,
    player: player as unknown as TonePlayerLike,
    gain: gain as unknown as ToneGainLike,
    playing: Boolean(params.playing),
    lastUrl: url,
    lastParams: { ...params },
  };

  if (instance.playing) {
    try {
      player.start();
    } catch {
      // ignore
    }
  }

  granularInstances.set(nodeId, instance);
  scheduleGraphWiring();
  return instance;
}

function isAbortError(error: unknown): boolean {
  if (!error) return false;
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError';
  }
  if (error instanceof Error) return error.name === 'AbortError' || error.message.includes('AbortError');
  return String(error).includes('AbortError');
}

/**
 * Ensure Tone.Player loads are serialized and cancelable.
 *
 * ToneAudioBuffer.load (used by Tone.Player.load) does `fetch(url)` without AbortSignal support,
 * so rapid URL switching can accumulate concurrent downloads/decodes and stall the main thread.
 *
 * Strategy:
 * - Keep a single in-flight load per nodeId.
 * - Abort the fetch stage when a newer URL arrives (best-effort).
 * - Never apply stale load results (URL/seq checks).
 */
export function requestTonePlayerLoad(instance: TonePlayerInstance): void {
  if (!toneModule) return;
  if (instance.loading) return;
  const url = instance.lastUrl;
  if (!url) return;
  if (instance.loadedUrl === url) return;
  if (instance.failedUrl === url) return;
  void startTonePlayerLoad(instance, url);
}

async function startTonePlayerLoad(instance: TonePlayerInstance, url: string): Promise<void> {
  if (!toneModule) return;

  const seq = instance.loadSeq + 1;
  instance.loadSeq = seq;
  instance.loading = true;
  instance.loadingUrl = url;
  instance.failedUrl = null;

  try {
    instance.loadController?.abort();
  } catch {
    // ignore
  }
  const controller = new AbortController();
  instance.loadController = controller;

  try {
    let arrayBuffer: ArrayBuffer;

    // Use prioritizeFetch if available (checks cache, prioritizes over background preload).
    if (latestDeps.prioritizeFetch) {
      const res = await latestDeps.prioritizeFetch(url);
      if (!res.ok) throw new Error(`GET failed (${res.status})`);
      arrayBuffer = await res.arrayBuffer();
    } else {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`GET failed (${res.status})`);
      arrayBuffer = await res.arrayBuffer();
    }

    if (controller.signal.aborted) return;

    const audioBuffer = await toneModule.getContext().decodeAudioData(arrayBuffer);
    if (controller.signal.aborted) return;

    const current = playerInstances.get(instance.nodeId);
    if (!current || current.loadSeq !== seq) return;
    if (current.lastUrl !== url) return;

    current.player.buffer = audioBuffer;
    current.loadedUrl = url;
    current.failedUrl = null;
  } catch (error: unknown) {
    if (isAbortError(error)) return;
    const current = playerInstances.get(instance.nodeId);
    if (current && current.loadSeq === seq && current.lastUrl === url) {
      current.failedUrl = url;
    }
    console.warn('[tone-adapter] player load failed', { url }, error);
  } finally {
    const current = playerInstances.get(instance.nodeId);
    if (current && current.loadSeq === seq) {
      current.loading = false;
      current.loadingUrl = null;
      current.loadController = null;

      // If URL changed while we were loading, kick the next load (no concurrency).
      requestTonePlayerLoad(current);
    }
  }
}

export function createPlayerInstance(
  nodeId: string,
  params: Record<string, number | boolean>
): TonePlayerInstance {
  const gain = new toneModule!.Gain({ gain: params.volume as number });
  const playbackRate = toNonNegativeNumber(params.playbackRate, 1);
  const playerOptions: Partial<PlayerOptions> = {
    loop: Boolean(params.loop),
    playbackRate,
    autostart: false,
  };
  const player = new toneModule!.Player(playerOptions);

  player.connect(gain);

  const instance: TonePlayerInstance = {
    nodeId,
    player: player as unknown as TonePlayerLike,
    gain: gain as unknown as ToneGainLike,
    playing: Boolean(params.playing),
    started: false,
    startedAt: 0,
    startOffsetSec: 0,
    startDurationSec: null,
    pausedOffsetSec: null,
    autostarted: false,
    lastTrigger: false,
    loading: false,
    loadingUrl: null,
    loadSeq: 0,
    loadController: null,
    ended: false,
    endedReported: false,
    manualStopPending: false,
    lastUrl: null,
    loadedUrl: null,
    failedUrl: null,
    lastClip: null,
    lastCursorSec: null,
    lastParams: { ...params, playbackRate },
  };

  player.onstop = () => {
    const inst = playerInstances.get(nodeId);
    if (!inst) return;
    if (inst.manualStopPending) {
      inst.manualStopPending = false;
      return;
    }
    if (inst.ended) return;
    if (inst.lastParams.loop) return;
    if (!inst.playing) return;

    inst.ended = true;
    inst.started = false;
    inst.startedAt = 0;

    const reverse = Boolean(inst.lastParams.reverse ?? false);
    if (
      typeof inst.startDurationSec === 'number' &&
      Number.isFinite(inst.startDurationSec) &&
      inst.startDurationSec >= 0
    ) {
      const endPos = reverse
        ? inst.startOffsetSec - inst.startDurationSec
        : inst.startOffsetSec + inst.startDurationSec;
      inst.pausedOffsetSec = Number.isFinite(endPos) ? Math.max(0, endPos) : inst.pausedOffsetSec;
    }

    inst.startOffsetSec = 0;
    inst.startDurationSec = null;
  };

  playerInstances.set(nodeId, instance);
  scheduleGraphWiring();
  return instance;
}
