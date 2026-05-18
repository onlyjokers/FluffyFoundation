<!--
Purpose: Full-screen Display visual scene layer driven by visualScenes control payloads.
-->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { subscribePlaybackAudioTap, toneAudioEngine } from '@shugu/multimedia-core';
  import {
    BoxScene,
    DefaultSceneManager,
    FctTrackScene,
    MelSpectrogramScene,
    sceneLayersFromItems,
    type VisualContext,
  } from '@shugu/visual-plugins';
  import { createAudioAnalysisPipeline, type AudioAnalysisPipeline } from '@shugu/audio-plugins';
  import type { FctTrackAudioSource, VisualSceneLayerItem } from '@shugu/protocol';

  export let scenes: VisualSceneLayerItem[] = [];

  let container: HTMLElement;
  let manager: DefaultSceneManager | null = null;
  let animationFrame: number | null = null;
  let lastTime = 0;
  let context: VisualContext = {};
  let microphonePipeline: AudioAnalysisPipeline | null = null;
  let playbackPipeline: AudioAnalysisPipeline | null = null;
  let microphoneStream: MediaStream | null = null;
  let playbackUnsub: (() => void) | null = null;
  let microphoneRequested = false;

  onMount(() => {
    manager = new DefaultSceneManager(container);
    manager.registerFactory('box-scene', () => new BoxScene());
    manager.registerFactory('mel-scene', () => new MelSpectrogramScene());
    manager.registerFactory('fct-track-scene', () => new FctTrackScene());
    playbackUnsub = subscribePlaybackAudioTap((source, sourceContext) => {
      void setupPlaybackAudioPipeline(source, sourceContext);
    });

    lastTime = performance.now();
    animate(lastTime);
  });

  onDestroy(() => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    playbackUnsub?.();
    playbackUnsub = null;
    microphonePipeline?.destroy();
    playbackPipeline?.destroy();
    microphonePipeline = null;
    playbackPipeline = null;
    microphoneStream?.getTracks().forEach((track) => track.stop());
    microphoneStream = null;
    manager?.destroy();
    manager = null;
  });

  $: if (manager) {
    applySceneLayer(scenes);
  }

  $: if (sceneNeedsMicrophone(scenes)) {
    void setupMicrophoneAudioPipeline();
  }

  function animate(now: number): void {
    const dt = Math.max(0, (now - lastTime) / 1000);
    lastTime = now;
    manager?.update(dt, context);
    animationFrame = requestAnimationFrame(animate);
  }

  async function setupMicrophoneAudioPipeline(): Promise<void> {
    if (microphoneRequested || microphonePipeline) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    microphoneRequested = true;
    try {
      microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mod = await toneAudioEngine.ensureLoaded();
      type ToneContextLike = { rawContext?: AudioContext };
      type ToneModuleLike = { getContext?: () => ToneContextLike };
      const toneCandidate =
        mod && typeof mod === 'object' && 'default' in mod
          ? (mod as { default?: unknown }).default ?? mod
          : mod;
      const tone = toneCandidate && typeof toneCandidate === 'object'
        ? (toneCandidate as ToneModuleLike)
        : null;
      const audioContext = tone?.getContext?.().rawContext ?? null;
      if (!audioContext) return;
      if (audioContext.state === 'suspended') await audioContext.resume();
      const source = audioContext.createMediaStreamSource(microphoneStream);
      microphonePipeline = await createAudioAnalysisPipeline({
        audioContext,
        source,
        onFeatures: (partial) => {
          context.microphoneAudioFeatures = { ...(context.microphoneAudioFeatures ?? {}), ...partial };
          context.audioFeatures = context.microphoneAudioFeatures;
        },
      });
    } catch {
      microphonePipeline?.destroy();
      microphonePipeline = null;
    }
  }

  async function setupPlaybackAudioPipeline(source: AudioNode | null, sourceContext: AudioContext | null): Promise<void> {
    playbackPipeline?.destroy();
    playbackPipeline = null;
    context.playbackAudioFeatures = undefined;
    if (!source || !sourceContext) return;
    try {
      if (sourceContext.state === 'suspended') await sourceContext.resume();
      playbackPipeline = await createAudioAnalysisPipeline({
        audioContext: sourceContext,
        source,
        onFeatures: (partial) => {
          context.playbackAudioFeatures = { ...(context.playbackAudioFeatures ?? {}), ...partial };
        },
      });
    } catch {
      playbackPipeline?.destroy();
      playbackPipeline = null;
    }
  }

  function applySceneLayer(nextScenes: VisualSceneLayerItem[] | unknown[]): void {
    if (!manager) return;
    const list = Array.isArray(nextScenes) ? nextScenes : [];
    manager.setLayerScenes(sceneLayersFromItems(list));
  }

  function sceneNeedsMicrophone(nextScenes: VisualSceneLayerItem[] | unknown[]): boolean {
    if (!Array.isArray(nextScenes)) return false;
    return nextScenes.some((scene) => {
      if (!scene || typeof scene !== 'object') return false;
      const item = scene as { type?: unknown; audioSource?: unknown };
      if (item.type === 'mel') return true;
      if (item.type !== 'fctTrack') return false;
      const source = normalizeFctAudioSource(item.audioSource);
      return source === 'microphone' || source === 'both';
    });
  }

  function normalizeFctAudioSource(value: unknown): FctTrackAudioSource {
    return value === 'playback' || value === 'both' ? value : 'microphone';
  }
</script>

<div class="display-visual-scenes" bind:this={container}></div>

<style>
  .display-visual-scenes {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
  }

  :global(.display-visual-scenes .shugu-scene-canvas) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
</style>
