<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    melSceneEnabled,
    cameraStream,
    audioStream,
    visualScenes,
    visualEffects,
    videoState,
    imageState,
    getSDK,
    connectionStatus,
  } from '$lib/stores/client';
  import { subscribePlaybackAudioTap } from '@shugu/multimedia-core';
  import { VideoPlayer } from '@shugu/ui-kit';
  import ImageDisplay from '$lib/components/ImageDisplay.svelte';
  import {
    BoxScene,
    CameraScene,
    FctTrackScene,
    MelSpectrogramScene,
    DefaultSceneManager,
    type VisualContext,
    sceneLayersFromItems,
  } from '@shugu/visual-plugins';
  import type { VisualSceneLayerItem } from '@shugu/protocol';
  import { toneAudioEngine } from '@shugu/multimedia-core';
  import {
    createVisualEffectPipeline,
    drawAsciiBorder,
    renderVisualEffects,
    resetVisualEffectPipeline,
    type VisualEffectPipeline,
  } from '@shugu/visual-effects';
  import { drawBaseFrame as renderBaseFrame } from '$lib/features/visual-layer/base-frame';
  import { createAudioAnalysisPipeline, type AudioAnalysisPipeline } from '@shugu/audio-plugins';
  import { createMicSensorPayload } from './audio-sensor-payload';

  let container: HTMLElement;
  let sceneManager: DefaultSceneManager | null = null;
  let effectCanvas: HTMLCanvasElement;
  let microphonePipeline: AudioAnalysisPipeline | null = null;
  let playbackPipeline: AudioAnalysisPipeline | null = null;
  let audioContext: AudioContext | null = null;
  let playbackUnsub: (() => void) | null = null;
  let animationId: number;
  let effectCtx: CanvasRenderingContext2D | null = null;
  let effectPipeline: VisualEffectPipeline | null = null;
  let baseVisible = true;
  let lastTime = 0;

  // Current context data for scene updates
  let context: VisualContext = {};

  // Device orientation data
  let orientationData = { alpha: 0, beta: 0, gamma: 0, screen: 0 };

  function reportVideoStarted(nodeId: string): void {
    const sdk = getSDK();
    if (!sdk) return;
    if (!nodeId) return;
    try {
      const payload: Record<string, unknown> = {
        kind: 'node-media',
        event: 'started',
        nodeId,
        nodeType: 'load-video-from-assets',
      };
      sdk.sendSensorData(
        'custom',
        payload,
        { trackLatest: false }
      );
    } catch {
      // ignore
    }
  }

  onMount(() => {
    // Create scene manager
    sceneManager = new DefaultSceneManager(container);

    // Register scenes (base visuals)
    sceneManager.registerFactory('box-scene', () => new BoxScene());
    sceneManager.registerFactory('mel-scene', () => new MelSpectrogramScene());
    sceneManager.registerFactory('front-camera-scene', () => new CameraScene({ facing: 'user' }));
    sceneManager.registerFactory('back-camera-scene', () => new CameraScene({ facing: 'environment' }));
    sceneManager.registerFactory('fct-track-scene', () => new FctTrackScene());

    // Effect pipeline setup (shared visual-effects package)
    effectCtx = effectCanvas.getContext('2d');
    effectPipeline = createVisualEffectPipeline();
    handleResize();

    // Set up device orientation listener
    window.addEventListener('deviceorientation', handleOrientation);
    window.addEventListener('resize', handleResize);
    playbackUnsub = subscribePlaybackAudioTap((source, sourceContext) => {
      void setupPlaybackAudioPipeline(source, sourceContext);
    });

    // Start animation loop
    lastTime = performance.now();
    animate();
  });

  onDestroy(() => {
    cancelAnimationFrame(animationId);
    window.removeEventListener('deviceorientation', handleOrientation);
    window.removeEventListener('resize', handleResize);
    playbackUnsub?.();
    playbackUnsub = null;
    sceneManager?.destroy();
    microphonePipeline?.destroy();
    playbackPipeline?.destroy();
    microphonePipeline = null;
    playbackPipeline = null;
    audioContext = null;
  });

  // React to visual scene layer changes
  $: if (sceneManager) {
    applySceneLayer($visualScenes);
  }

  $: context.cameraStream = $cameraStream;

  // React to audio stream changes
  $: if ($audioStream && !audioContext) {
    setupAudioPipeline($audioStream);
  }

  async function setupAudioPipeline(stream: MediaStream) {
    try {
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
      const raw: AudioContext | null = tone?.getContext?.().rawContext ?? null;
      if (!raw) {
        console.warn(
          '[VisualCanvas] Tone context not available; skipping audio analysis pipeline.'
        );
        return;
      }

      audioContext = raw;
      try {
        if (audioContext.state === 'suspended') await audioContext.resume();
      } catch {
        // ignore
      }
      const source = audioContext.createMediaStreamSource(stream);

      microphonePipeline = await createAudioAnalysisPipeline({
        audioContext,
        source,
        onFeatures: (partial, splitFeature) => {
          context.microphoneAudioFeatures = { ...(context.microphoneAudioFeatures ?? {}), ...partial };
          context.audioFeatures = context.microphoneAudioFeatures;
          if (!splitFeature) return;
          const sdk = getSDK();
          if (sdk) {
            sdk.sendSensorData('mic', createMicSensorPayload(splitFeature));
          }
        },
      });
    } catch (error) {
      console.error('[VisualCanvas] Failed to setup audio pipeline:', error);
      microphonePipeline?.destroy();
      microphonePipeline = null;
      audioContext?.close();
      audioContext = null;
    }
  }

  async function setupPlaybackAudioPipeline(source: AudioNode | null, sourceContext: AudioContext | null) {
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
    } catch (error) {
      console.warn('[VisualCanvas] Failed to setup playback audio analysis:', error);
      playbackPipeline?.destroy();
      playbackPipeline = null;
    }
  }

  function handleOrientation(event: DeviceOrientationEvent) {
    const screen =
      typeof window.orientation === 'number'
        ? (window.orientation as number)
        : (window.screen.orientation?.angle ?? 0);

    orientationData = {
      alpha: event.alpha ?? 0,
      beta: event.beta ?? 0,
      gamma: event.gamma ?? 0,
      screen,
    };
    context.orientation = orientationData;
  }

  function animate() {
    const now = performance.now();
    const dt = (now - lastTime) / 1000; // Convert to seconds
    lastTime = now;

    sceneManager?.update(dt, context);

    const effects = Array.isArray($visualEffects) ? $visualEffects : [];
    if (effects.length > 0 && effectPipeline) {
      const ok = renderVisualEffects(effectPipeline, {
        effects,
        nowMs: now,
        container,
        outputCanvas: effectCanvas,
        outputCtx: effectCtx,
        drawBaseFrame,
        melSceneEnabled: $melSceneEnabled,
        asciiOverlay: renderAsciiBorder,
      });
      setBaseLayerVisibility(!ok);
      if (effectCanvas) effectCanvas.style.visibility = ok ? 'visible' : 'hidden';
    } else {
      setBaseLayerVisibility(true);
      if (effectCanvas) effectCanvas.style.visibility = 'hidden';
    }

    animationId = requestAnimationFrame(animate);
  }

  function applySceneLayer(scenes: VisualSceneLayerItem[] | unknown[]): void {
    if (!sceneManager) return;

    const list = Array.isArray(scenes) ? scenes : [];
    const layers = sceneLayersFromItems(list);
    sceneManager.setLayerScenes(layers);

    // Best-effort: keep DOM canvas order in sync with the scene chain.
    reorderSceneCanvases(layers.map((layer) => layer.key));
  }

  function reorderSceneCanvases(layerKeys: string[]): void {
    if (!container || !effectCanvas) return;

    for (const key of layerKeys) {
      const canvas = container.querySelector(
        `canvas[data-shugu-layer-key="${key}"]`
      ) as HTMLCanvasElement | null;
      if (!canvas) continue;

      try {
        container.insertBefore(canvas, effectCanvas);
      } catch {
        // ignore
      }
    }
  }

  function setBaseLayerVisibility(show: boolean) {
    if (!container) return;
    if (baseVisible === show) return;
    baseVisible = show;

    const canvases = Array.from(container.querySelectorAll('canvas')) as HTMLCanvasElement[];
    for (const c of canvases) {
      if (c === effectCanvas) continue;
      c.style.visibility = show ? 'visible' : 'hidden';
    }

    const overlays = Array.from(
      container.querySelectorAll('.video-overlay, .image-overlay')
    ) as HTMLElement[];
    for (const el of overlays) {
      el.style.visibility = show ? 'visible' : 'hidden';
    }
  }

  function drawBaseFrame(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dpr: number
  ): void {
    renderBaseFrame(ctx, width, height, dpr, {
      container,
      effectCanvas,
      videoState: $videoState,
      imageState: $imageState,
    });
  }

  function renderAsciiBorder(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    cols: number,
    rows: number
  ) {
    let edgeColor = 'rgba(255, 228, 210, 0.55)';

    if ($connectionStatus !== 'connected') {
      const t = performance.now() / 1000;
      // Pulsing red effect: alpha oscillates between 0.3 and 1.0
      const alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 3));
      edgeColor = `rgba(239, 68, 68, ${alpha})`;
    }

    drawAsciiBorder(ctx, width, height, cols, rows, edgeColor);
  }

  function handleResize() {
    if (effectPipeline) resetVisualEffectPipeline(effectPipeline);
  }
</script>

<div class="visual-container" bind:this={container}>
  <!-- Video Player (base visual layer) -->
  {#if $videoState.url}
    <VideoPlayer
      url={$videoState.url}
      playing={$videoState.playing}
      muted={$videoState.muted}
      loop={$videoState.loop}
      volume={$videoState.volume}
      startSec={$videoState.startSec}
      endSec={$videoState.endSec}
      cursorSec={$videoState.cursorSec}
      reverse={$videoState.reverse}
      fit={$videoState.fit}
      sourceNodeId={$videoState.sourceNodeId}
      onStarted={reportVideoStarted}
    />
  {/if}

  <!-- Image Display (base visual layer) -->
  {#if $imageState.url && $imageState.visible}
    <ImageDisplay
      url={$imageState.url}
      duration={$imageState.duration}
      fit={$imageState.fit}
      scale={$imageState.scale}
      offsetX={$imageState.offsetX}
      offsetY={$imageState.offsetY}
      opacity={$imageState.opacity}
    />
  {/if}

  <canvas class="effect-output" bind:this={effectCanvas}></canvas>
</div>

<style>
  .visual-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
    background: #0a0a0f;
  }

  .visual-container :global(canvas) {
    display: block;
  }

  .effect-output {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 3;
    pointer-events: none;
    visibility: hidden;
  }

</style>
