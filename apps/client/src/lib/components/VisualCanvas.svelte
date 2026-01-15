<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    melSceneEnabled,
    cameraStream,
    frontCameraEnabled,
    backCameraEnabled,
    audioStream,
    visualScenes,
    visualEffects,
    videoState,
    imageState,
    getSDK,
    connectionStatus,
  } from '$lib/stores/client';
  import { VideoPlayer } from '@shugu/ui-kit';
  import ImageDisplay from '$lib/components/ImageDisplay.svelte';
  import {
    BoxScene,
    MelSpectrogramScene,
    DefaultSceneManager,
    type VisualContext,
    sceneIdsFromLayer,
  } from '@shugu/visual-plugins';
  import { toneAudioEngine } from '@shugu/multimedia-core';
  import {
    AudioSplitPlugin,
    MelSpectrogramPlugin,
    type AudioSplitFeature,
    type MelSpectrogramFeature,
  } from '@shugu/audio-plugins';
  import {
    createVisualEffectPipeline,
    drawAsciiBorder,
    renderVisualEffects,
    resetVisualEffectPipeline,
    type VisualEffectPipeline,
  } from '@shugu/visual-effects';
  import { drawBaseFrame as renderBaseFrame } from '$lib/features/visual-layer/base-frame';

  let container: HTMLElement;
  let sceneManager: DefaultSceneManager | null = null;
  let effectCanvas: HTMLCanvasElement;
  let splitPlugin: AudioSplitPlugin | null = null;
  let melPlugin: MelSpectrogramPlugin | null = null;
  let audioContext: AudioContext | null = null;
  let animationId: number;
  let effectCtx: CanvasRenderingContext2D | null = null;
  let effectPipeline: VisualEffectPipeline | null = null;
  let baseVisible = true;
  let lastTime = 0;
  let cameraVideoElement: HTMLVideoElement;

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
    sceneManager.register(new BoxScene());
    sceneManager.register(new MelSpectrogramScene());

    // Effect pipeline setup (shared visual-effects package)
    effectCtx = effectCanvas.getContext('2d');
    effectPipeline = createVisualEffectPipeline();
    handleResize();

    // Set up device orientation listener
    window.addEventListener('deviceorientation', handleOrientation);
    window.addEventListener('resize', handleResize);

    // Start animation loop
    lastTime = performance.now();
    animate();
  });

  onDestroy(() => {
    cancelAnimationFrame(animationId);
    window.removeEventListener('deviceorientation', handleOrientation);
    window.removeEventListener('resize', handleResize);
    sceneManager?.destroy();
    splitPlugin?.destroy();
    melPlugin?.destroy();
    splitPlugin = null;
    melPlugin = null;
    audioContext = null;
  });

  // React to visual scene layer changes
  $: if (sceneManager) {
    applySceneLayer($visualScenes);
  }

  // Bind camera stream to video element
  $: if (cameraVideoElement && $cameraStream) {
    cameraVideoElement.srcObject = $cameraStream;
  } else if (cameraVideoElement && !$cameraStream) {
    cameraVideoElement.srcObject = null;
  }

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

      splitPlugin = new AudioSplitPlugin();
      melPlugin = new MelSpectrogramPlugin({ melBands: 64, frameRate: 30 });

      await Promise.all([
        splitPlugin.init(audioContext, source),
        melPlugin.init(audioContext, source, { melBands: 64, frameRate: 30 }),
      ]);

      const updateAudioFeatures = (partial: Partial<VisualContext['audioFeatures']>) => {
        context.audioFeatures = { ...(context.audioFeatures ?? {}), ...partial };
      };

      splitPlugin.onFeature((feature: AudioSplitFeature) => {
        updateAudioFeatures({
          rms: feature.rms,
          lowEnergy: feature.lowEnergy,
          midEnergy: feature.midEnergy,
          highEnergy: feature.highEnergy,
          bpm: feature.bpm,
          beatDetected: feature.beatDetected,
        });

        // Send audio features to server
        const sdk = getSDK();
        if (sdk) {
          sdk.sendSensorData('mic', {
            volume: feature.rms,
            lowEnergy: feature.lowEnergy,
            highEnergy: feature.highEnergy,
            bpm: feature.bpm,
          });
        }
      });

      melPlugin.onFeature((feature: MelSpectrogramFeature) => {
        updateAudioFeatures({
          melBands: feature.melBands,
          rms: feature.rms,
          spectralCentroid: feature.spectralCentroid,
        });
      });

      splitPlugin.start();
      melPlugin.start();
    } catch (error) {
      console.error('[VisualCanvas] Failed to setup audio pipeline:', error);
      splitPlugin?.destroy();
      melPlugin?.destroy();
      splitPlugin = null;
      melPlugin = null;
      audioContext?.close();
      audioContext = null;
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

  function applySceneLayer(scenes: unknown[]): void {
    if (!sceneManager) return;

    const list = Array.isArray(scenes) ? scenes : [];
    const desiredSceneIdsRaw = sceneIdsFromLayer(list);
    const desiredSceneIds: string[] = [];
    const desired = new Set<string>();

    for (const sceneId of desiredSceneIdsRaw) {
      if (!desired.has(sceneId)) {
        desired.add(sceneId);
        desiredSceneIds.push(sceneId);
      }
    }

    // Disable scenes no longer desired.
    for (const scene of sceneManager.getActiveScenes()) {
      if (!desired.has(scene.id)) {
        sceneManager.setSceneEnabled(scene.id, false);
      }
    }

    // Enable desired scenes.
    for (const sceneId of desiredSceneIds) {
      sceneManager.setSceneEnabled(sceneId, true);
    }

    // Best-effort: keep DOM canvas order in sync with the scene chain.
    reorderSceneCanvases(desiredSceneIds);
  }

  function reorderSceneCanvases(sceneIds: string[]): void {
    if (!container || !effectCanvas) return;

    for (const id of sceneIds) {
      const canvas = container.querySelector(
        `canvas[data-shugu-scene-id="${id}"]`
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
      container.querySelectorAll('.video-overlay, .image-overlay, video.camera-display')
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
      cameraVideoElement,
      videoState: $videoState,
      imageState: $imageState,
      cameraStream: $cameraStream,
      frontCameraEnabled: $frontCameraEnabled,
      backCameraEnabled: $backCameraEnabled,
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

  <!-- Camera Display -->
  {#if $cameraStream && ($frontCameraEnabled || $backCameraEnabled)}
    <video
      class="camera-display"
      autoplay
      playsinline
      muted
      bind:this={cameraVideoElement}
      class:mirror={$frontCameraEnabled}
    ></video>
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

  .camera-display {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    z-index: 1;
  }

  .camera-display.mirror {
    transform: scaleX(-1);
  }
</style>
