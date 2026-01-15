<!--
Purpose: Shared video overlay player used by Client and Display apps.
-->

<script lang="ts">
  import { onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';
  import { reportNodeMediaFinish, toneAudioEngine } from '@shugu/multimedia-core';
  import {
    asPromiseLike,
    getAudioContextCtor,
    resolveToneRawContext,
    toErrorName,
    unwrapDefaultExport,
  } from './video-player-audio';

  export let url: string;
  export let playing = true;
  export let muted = true;
  export let loop = false;
  export let volume = 1;
  export let startSec = 0;
  export let endSec = -1; // -1 means "to end"
  export let cursorSec = -1; // -1 means "unset"
  export let reverse = false;
  export let fit: 'contain' | 'fit-screen' | 'cover' | 'fill' = 'contain';
  // Optional node graph source id (e.g. load-video-from-assets nodeId) for UI telemetry.
  export let sourceNodeId: string | null = null;
  export let onEnded: (() => void) | undefined = undefined;
  export let onStarted: ((nodeId: string) => void) | undefined = undefined;

  let videoElement: HTMLVideoElement;
  let visible = false;
  let loaded = false;
  let durationSec: number | null = null;

  let lastUrl = '';
  let lastCursorApplied: number | null = null;
  let rafId: number | null = null;
  let rafLastTs = 0;
  let startedReportKey = '';
  let finishReportKey = '';
  let autoplayForcedMute = false;
  let lastPlayIntent = false;

  let webAudioSource: MediaElementAudioSourceNode | null = null;
  let webAudioGain: GainNode | null = null;
  let webAudioTarget: HTMLVideoElement | null = null;
  let ownedAudioContext: AudioContext | null = null;

  const clamp = (value: number, min: number, max: number): number =>
    Math.max(min, Math.min(max, value));

  const resetWebAudio = () => {
    try {
      webAudioSource?.disconnect();
    } catch {
      // ignore
    }
    try {
      webAudioGain?.disconnect();
    } catch {
      // ignore
    }
    webAudioSource = null;
    webAudioGain = null;
    webAudioTarget = null;
  };

  const disposeOwnedAudioContext = () => {
    if (!ownedAudioContext) return;
    try {
      ownedAudioContext.close();
    } catch {
      // ignore
    }
    ownedAudioContext = null;
  };

  onDestroy(() => {
    resetWebAudio();
    disposeOwnedAudioContext();
  });

  const getRange = () => {
    const start = Math.max(0, Number(startSec) || 0);
    const effectiveEnd =
      typeof endSec === 'number' && Number.isFinite(endSec) && endSec >= 0
        ? Math.max(start, endSec)
        : durationSec;
    return { start, end: effectiveEnd };
  };

  const getEffectiveVolume = (): number => {
    const raw =
      typeof volume === 'number' && Number.isFinite(volume) ? volume : Number(volume) || 0;
    return clamp(raw, 0, 100);
  };

  const getWebAudioContext = async (): Promise<AudioContext | null> => {
    if (toneAudioEngine.isEnabled()) {
      try {
        const mod = await toneAudioEngine.ensureLoaded();
        const toneModule = unwrapDefaultExport(mod);
        return resolveToneRawContext(toneModule);
      } catch {
        return null;
      }
    }

    if (typeof window === 'undefined') return null;
    const Ctor = getAudioContextCtor(window);
    if (!Ctor) return null;

    let ctx = ownedAudioContext;
    if (!ctx) {
      try {
        ctx = new Ctor();
      } catch {
        ownedAudioContext = null;
        return null;
      }
      ownedAudioContext = ctx;
    }

    if (!ctx) return null;

    try {
      if (ctx.state === 'suspended') await ctx.resume();
    } catch {
      // ignore
    }

    return ctx.state === 'running' ? ctx : null;
  };

  const ensureWebAudio = async (): Promise<boolean> => {
    if (!videoElement) return false;
    if (webAudioGain && webAudioTarget === videoElement) return true;

    if (webAudioTarget && webAudioTarget !== videoElement) resetWebAudio();

    const ctx = await getWebAudioContext();
    if (!ctx) return false;

    try {
      const source = ctx.createMediaElementSource(videoElement);
      const gain = ctx.createGain();
      source.connect(gain);
      gain.connect(ctx.destination);
      webAudioSource = source;
      webAudioGain = gain;
      webAudioTarget = videoElement;
      return true;
    } catch {
      resetWebAudio();
      return false;
    }
  };

  const applyAudioParams = () => {
    if (!videoElement) return;
    const vol = getEffectiveVolume();
    const mute = muted || vol <= 0 || autoplayForcedMute;
    const gain = mute ? 0 : vol;
    videoElement.muted = mute;

    if (webAudioGain && webAudioTarget === videoElement) {
      webAudioGain.gain.value = gain;
      videoElement.volume = 1;
      return;
    }

    videoElement.volume = clamp(gain, 0, 1);
    if (!mute && vol > 1) {
      void ensureWebAudio().then((ok) => {
        if (!ok) return;
        applyAudioParams();
      });
    }
  };

  $: if (videoElement && loaded) {
    applyAudioParams();
  }

  function stopRaf() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    rafLastTs = 0;
  }

  function startRaf() {
    if (rafId !== null) return;
    const tick = (ts: number) => {
      if (!videoElement || !loaded || !playing || !url) {
        rafId = null;
        rafLastTs = 0;
        return;
      }

      const { start, end } = getRange();
      const hasEnd = typeof end === 'number' && Number.isFinite(end) && end > start;
      const endValue = hasEnd ? end! : null;
      // Looser epsilon to avoid missing Finish due to tiny clock/float drift.
      const epsilon = 0.1;

      if (reverse) {
        // Manual reverse stepping: keep video paused and move `currentTime` backwards.
        try {
          if (!videoElement.paused) videoElement.pause();
        } catch {
          // ignore
        }

        const dt = rafLastTs > 0 ? Math.min(0.1, Math.max(0, (ts - rafLastTs) / 1000)) : 0;
        rafLastTs = ts;

        if (endValue !== null && videoElement.currentTime > endValue) {
          videoElement.currentTime = endValue;
        }

        const next = videoElement.currentTime - dt;
        if (next <= start + epsilon) {
          if (loop && endValue !== null) {
            videoElement.currentTime = endValue;
          } else {
            try {
              videoElement.pause();
            } catch {
              // ignore
            }
            handleFinish();
            stopRaf();
          }
        } else {
          videoElement.currentTime = next;
        }

        return;
      }

      // Forward playback: let the browser play, enforce clip range/loop.
      if (endValue !== null && videoElement.currentTime >= endValue - epsilon) {
        if (loop) {
          videoElement.currentTime = start;
        } else {
          try {
            videoElement.pause();
          } catch {
            // ignore
          }
          handleFinish();
          stopRaf();
        }
      } else if (videoElement.currentTime < start) {
        videoElement.currentTime = start;
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  function maybeReportStarted(): void {
    const nodeId = typeof sourceNodeId === 'string' ? sourceNodeId.trim() : '';
    if (!nodeId) return;
    if (!playing || !url) return;
    const key = `${nodeId}|${url}`;
    if (startedReportKey === key) return;
    startedReportKey = key;
    finishReportKey = '';
    onStarted?.(nodeId);
  }

  function handlePlaying(): void {
    maybeReportStarted();
  }

  function reportFinishOnce(): void {
    const nodeId = typeof sourceNodeId === 'string' ? sourceNodeId.trim() : '';
    if (!nodeId) return;
    const key = `${nodeId}|${url}`;
    if (finishReportKey === key) return;
    finishReportKey = key;
    reportNodeMediaFinish(nodeId);
  }

  function handleFinish(): void {
    reportFinishOnce();
    onEnded?.();
  }

  function handleNativeEnded(): void {
    if (loop) return;
    stopRaf();
    handleFinish();
  }

  export function stop() {
    if (videoElement) {
      videoElement.pause();
      videoElement.currentTime = 0;
    }
    visible = false;
    stopRaf();
  }

  export function play() {
    visible = true;
    if (!reverse) videoElement?.play().catch(console.error);
  }

  function handleLoadedMetadata() {
    loaded = true;
    const dur = videoElement?.duration;
    durationSec = typeof dur === 'number' && Number.isFinite(dur) && dur > 0 ? dur : null;
  }

  $: if (url && url !== lastUrl) {
    lastUrl = url;
    loaded = false;
    durationSec = null;
    lastCursorApplied = null;
    startedReportKey = '';
    finishReportKey = '';
    autoplayForcedMute = false;
    visible = Boolean(playing);
    stopRaf();
  }

  $: if (videoElement && loaded) {
    const { start, end } = getRange();
    const endValue = typeof end === 'number' && Number.isFinite(end) ? end : null;

    // Apply cursor seek (one-shot; won't re-seek unless cursor changes).
    const cursor =
      typeof cursorSec === 'number' && Number.isFinite(cursorSec) && cursorSec >= 0
        ? cursorSec
        : null;
    if (cursor === null) {
      lastCursorApplied = null;
    } else {
      const clampedCursor =
        endValue !== null ? clamp(cursor, start, endValue) : Math.max(start, cursor);
      if (lastCursorApplied === null || Math.abs(clampedCursor - lastCursorApplied) > 0.01) {
        videoElement.currentTime = clampedCursor;
        lastCursorApplied = clampedCursor;
      }
    }

    // Keep currentTime inside the clip range when clip changes.
    if (reverse) {
      const desiredEnd = endValue ?? durationSec ?? start;
      if (endValue !== null && videoElement.currentTime > endValue)
        videoElement.currentTime = endValue;
      if (videoElement.currentTime < start) videoElement.currentTime = desiredEnd;
    } else {
      if (videoElement.currentTime < start) videoElement.currentTime = start;
      if (endValue !== null && videoElement.currentTime > endValue)
        videoElement.currentTime = start;
    }
  }

  $: if (videoElement && loaded) {
    const playRising = playing && !lastPlayIntent;
    lastPlayIntent = playing;

    if (playing && url) {
      // When re-triggering after reaching the clip edge, `video.play()` can no-op because we're still at the end.
      // Reset to the clip start/end depending on direction so MIDI (or any toggle) can reliably restart playback.
      const cursor =
        typeof cursorSec === 'number' && Number.isFinite(cursorSec) && cursorSec >= 0
          ? cursorSec
          : null;
      if (playRising && cursor === null) {
        const { start, end } = getRange();
        const endValue = typeof end === 'number' && Number.isFinite(end) ? end : null;
        const epsilon = 0.1;

        if (reverse) {
          const desiredEnd = endValue ?? durationSec ?? start;
          if (videoElement.currentTime <= start + epsilon) {
            videoElement.currentTime = desiredEnd;
            lastCursorApplied = null;
          }
        } else {
          const effectiveEnd = endValue ?? durationSec;
          const atEnd =
            videoElement.ended ||
            (typeof effectiveEnd === 'number' &&
              Number.isFinite(effectiveEnd) &&
              videoElement.currentTime >= effectiveEnd - epsilon);
          if (atEnd) {
            videoElement.currentTime = start;
            lastCursorApplied = null;
          }
        }
      }

      visible = true;
      if (!reverse) {
        const attempt = videoElement.play();
        const promise = asPromiseLike<void>(attempt);
        if (promise) {
          promise.catch((err) => {
            const name = toErrorName(err);
            if (!autoplayForcedMute && (name === 'NotAllowedError' || name === 'SecurityError')) {
              autoplayForcedMute = true;
              applyAudioParams();
              videoElement.play().catch(() => undefined);
            }
          });
        }
      }
      startRaf();
      if (reverse) maybeReportStarted();
    } else {
      try {
        videoElement.pause();
      } catch {
        // ignore
      }
      visible = false;
      stopRaf();
      startedReportKey = '';
      finishReportKey = '';
      autoplayForcedMute = false;
    }
  }
</script>

{#if url}
  <div
    class="video-overlay"
    class:visible
    class:fit-screen={fit === 'fit-screen'}
    class:fit-cover={fit === 'cover'}
    class:fit-fill={fit === 'fill'}
    transition:fade={{ duration: 500 }}
  >
    <video
      bind:this={videoElement}
      src={url}
      preload="auto"
      {loop}
      {muted}
      crossorigin="anonymous"
      playsinline
      on:playing={handlePlaying}
      on:ended={handleNativeEnded}
      on:loadedmetadata={handleLoadedMetadata}
    />
  </div>
{/if}

<style>
  .video-overlay {
    position: fixed;
    inset: 0;
    z-index: 0; /* Below effect output so post-processing can cover */
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    padding: 24px; /* Margin from screen edges */
    opacity: 0;
    pointer-events: none;
    transition: opacity 280ms ease;
  }

  .video-overlay.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .video-overlay.fit-cover,
  .video-overlay.fit-fill,
  .video-overlay.fit-screen {
    padding: 0;
  }

  video {
    max-width: calc(100% - 48px);
    max-height: calc(100% - 48px);
    width: auto;
    height: auto;
    border-radius: 16px;
    box-shadow: 0 0 40px rgba(0, 0, 0, 0.8);
    object-fit: contain;
    background: #000;
  }

  .video-overlay.fit-cover video,
  .video-overlay.fit-fill video,
  .video-overlay.fit-screen video {
    max-width: 100%;
    max-height: 100%;
    width: 100%;
    height: 100%;
    border-radius: 0;
    box-shadow: none;
  }

  .video-overlay.fit-screen video {
    object-fit: contain;
  }

  .video-overlay.fit-cover video {
    object-fit: cover;
  }

  .video-overlay.fit-fill video {
    object-fit: fill;
  }
</style>
