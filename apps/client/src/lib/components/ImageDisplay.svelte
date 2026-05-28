<script lang="ts">
  import { fade } from 'svelte/transition';
  import { onDestroy } from 'svelte';

  export let url: string;
  export let duration: number | undefined = undefined;
  export let fit: 'contain' | 'fit-screen' | 'cover' | 'fill' = 'contain';
  export let scale: number = 1;
  export let offsetX: number = 0;
  export let offsetY: number = 0;
  export let opacity: number = 1;
  export let onHide: (() => void) | undefined = undefined;

  let visible = false;
  let currentUrl: string | null = null;
  let dismissedUrl: string | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

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

  function clearHideTimer() {
    if (!timeoutId) return;
    clearTimeout(timeoutId);
    timeoutId = null;
  }

  function scheduleHide() {
    clearHideTimer();
    if (!duration || duration <= 0) return;
    timeoutId = setTimeout(() => {
      dismissedUrl = currentUrl;
      visible = false;
      onHide?.();
    }, duration);
  }

  $: if (!url) {
    clearHideTimer();
    currentUrl = null;
    dismissedUrl = null;
    visible = false;
  } else if (url === dismissedUrl) {
    // Keep duration-based local hides stable until the upstream command changes URL or clears it.
    visible = false;
  } else if (url !== currentUrl) {
    clearHideTimer();
    currentUrl = url;
    dismissedUrl = null;
    visible = true;
  }

  function handleActiveLoad() {
    scheduleHide();
  }

  function handleActiveError() {
    console.error('[ImageDisplay] Failed to load image:', url);
  }

  export function hide() {
    clearHideTimer();
    dismissedUrl = currentUrl;
    visible = false;
    onHide?.();
  }

  onDestroy(() => {
    clearHideTimer();
  });
</script>

{#if url && visible}
  <div
    class="image-overlay"
    class:fit-screen={fit === 'fit-screen'}
    class:fit-cover={fit === 'cover'}
    class:fit-fill={fit === 'fill'}
    transition:fade={{ duration: 500 }}
  >
    {#key url}
      <img
        src={url}
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
    z-index: var(--layer-image);
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    padding: 24px; /* Margin from screen edges */
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
