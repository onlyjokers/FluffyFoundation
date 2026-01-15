<!--
Purpose: Display image overlay (full-screen) for the Display app.
-->

<script lang="ts">
  import { onDestroy } from 'svelte';

  export let url: string;
  export let duration: number | undefined = undefined;
  export let fit: 'contain' | 'fit-screen' | 'cover' | 'fill' = 'contain';
  export let scale: number = 1;
  export let offsetX: number = 0;
  export let offsetY: number = 0;
  export let opacity: number = 1;
  export let onHide: (() => void) | undefined = undefined;

  let activeUrl: string | null = null;
  let preloadSeq = 0;
  let hideTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Compute transform style from scale and offset
  $: transformStyle = (() => {
    const parts: string[] = [];
    if (scale !== 1 && Number.isFinite(scale) && scale > 0) {
      parts.push(`scale(${scale})`);
    }
    if ((offsetX !== 0 || offsetY !== 0) && Number.isFinite(offsetX) && Number.isFinite(offsetY)) {
      parts.push(`translate(${offsetX}px, ${offsetY}px)`);
    }
    return parts.length > 0 ? parts.join(' ') : undefined;
  })();

  // Compute opacity style
  $: opacityStyle =
    opacity !== 1 && Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : undefined;

  const clearHideTimer = () => {
    if (!hideTimeoutId) return;
    clearTimeout(hideTimeoutId);
    hideTimeoutId = null;
  };

  const scheduleHide = () => {
    clearHideTimer();
    if (!duration || duration <= 0) return;
    hideTimeoutId = setTimeout(() => {
      onHide?.();
    }, duration);
  };

  $: if (url) {
    if (!activeUrl) {
      clearHideTimer();
      activeUrl = url;
    } else if (url !== activeUrl) {
      clearHideTimer();
      // Preload via JS Image() to avoid missing `on:load` when the src is a fast blob/data URL.
      const currentSeq = (preloadSeq += 1);
      const nextUrl = url;
      const preloader = new Image();
      preloader.crossOrigin = 'anonymous';
      preloader.onload = () => {
        if (currentSeq !== preloadSeq) return;
        activeUrl = nextUrl;
        scheduleHide();
      };
      preloader.onerror = () => {
        if (currentSeq !== preloadSeq) return;
        console.error('[ImageDisplay] Failed to preload image:', nextUrl);
      };
      preloader.src = nextUrl;
    }
  }

  function handleActiveLoad() {
    scheduleHide();
  }

  function handleActiveError() {
    console.error('[ImageDisplay] Failed to load image:', activeUrl);
  }

  export function hide() {
    clearHideTimer();
    preloadSeq += 1;
    onHide?.();
  }

  onDestroy(() => {
    clearHideTimer();
  });
</script>

{#if activeUrl}
  <div
    class="image-overlay"
    class:fit-screen={fit === 'fit-screen'}
    class:fit-cover={fit === 'cover'}
    class:fit-fill={fit === 'fill'}
  >
    {#key activeUrl}
      <img
        src={activeUrl}
        alt=""
        on:load={handleActiveLoad}
        on:error={handleActiveError}
        crossorigin="anonymous"
        style:transform={transformStyle}
        style:opacity={opacityStyle}
      />
    {/key}
  </div>
{/if}

<style>
  .image-overlay {
    position: fixed;
    inset: 0;
    z-index: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    padding: 24px;
    overflow: hidden; /* Prevent scaled images from causing scroll */
  }

  .image-overlay.fit-cover,
  .image-overlay.fit-fill,
  .image-overlay.fit-screen {
    padding: 0;
  }

  img {
    max-width: calc(100% - 48px);
    max-height: calc(100% - 48px);
    width: auto;
    height: auto;
    border-radius: 16px;
    box-shadow: 0 0 40px rgba(0, 0, 0, 0.8);
    object-fit: contain;
    background: #000;
    transition:
      transform 0.3s ease,
      opacity 0.3s ease;
  }

  .image-overlay.fit-cover img,
  .image-overlay.fit-fill img,
  .image-overlay.fit-screen img {
    max-width: 100%;
    max-height: 100%;
    width: 100%;
    height: 100%;
    border-radius: 0;
    box-shadow: none;
  }

  .image-overlay.fit-screen img {
    object-fit: contain;
  }

  .image-overlay.fit-cover img {
    object-fit: cover;
  }

  .image-overlay.fit-fill img {
    object-fit: fill;
  }
</style>
