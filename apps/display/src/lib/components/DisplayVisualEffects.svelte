<!--
Purpose: Render Display post-processing effects from the current scene/media frame.
-->

<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { MediaEngineState, MediaFit } from '@shugu/multimedia-core';
  import type { VisualEffect } from '@shugu/protocol';
  import {
    createVisualEffectPipeline,
    drawAsciiBorder,
    renderVisualEffects,
    resetVisualEffectPipeline,
    type VisualEffectPipeline,
  } from '@shugu/visual-effects';

  export let effects: VisualEffect[] = [];
  export let videoState: MediaEngineState['video'];
  export let imageState: MediaEngineState['image'];

  let container: HTMLElement;
  let effectCanvas: HTMLCanvasElement;
  let effectCtx: CanvasRenderingContext2D | null = null;
  let effectPipeline: VisualEffectPipeline | null = null;
  let animationFrame: number | null = null;
  let baseVisible = true;

  onMount(() => {
    effectCtx = effectCanvas.getContext('2d');
    effectPipeline = createVisualEffectPipeline();
    window.addEventListener('resize', handleResize);
    animate(performance.now());
  });

  onDestroy(() => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    window.removeEventListener('resize', handleResize);
    setBaseLayerVisibility(true);
  });

  function animate(now: number): void {
    const activeEffects = Array.isArray(effects) ? effects : [];
    if (activeEffects.length > 0 && effectPipeline) {
      const ok = renderVisualEffects(effectPipeline, {
        effects: activeEffects,
        nowMs: now,
        container,
        outputCanvas: effectCanvas,
        outputCtx: effectCtx,
        drawBaseFrame,
        melSceneEnabled: hasMelScene(),
        asciiOverlay: renderAsciiOverlay,
      });
      setBaseLayerVisibility(!ok);
      if (effectCanvas) effectCanvas.style.visibility = ok ? 'visible' : 'hidden';
    } else {
      setBaseLayerVisibility(true);
      if (effectCanvas) effectCanvas.style.visibility = 'hidden';
    }

    animationFrame = requestAnimationFrame(animate);
  }

  function handleResize(): void {
    if (effectPipeline) resetVisualEffectPipeline(effectPipeline);
  }

  function drawBaseFrame(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dpr: number
  ): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    drawSceneCanvases(ctx, width, height);
    drawVideo(ctx, width, height);
    drawImage(ctx, width, height);
  }

  function drawSceneCanvases(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const canvases = Array.from(
      document.querySelectorAll('.display-visual-scenes canvas')
    ) as HTMLCanvasElement[];
    for (const canvas of canvases) {
      if (!canvas.width || !canvas.height) continue;
      try {
        ctx.save();
        const background = canvas.style.background?.trim();
        if (background && background !== 'transparent') {
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = background;
          ctx.fillRect(0, 0, width, height);
        }
        ctx.globalCompositeOperation = normalizeBlendMode(canvas.style.mixBlendMode);
        ctx.drawImage(canvas, 0, 0, width, height);
        ctx.restore();
      } catch {
        // Cross-origin or transient canvas state; continue with other layers.
      }
    }
  }

  function drawVideo(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const video = document.querySelector('.video-overlay video') as HTMLVideoElement | null;
    if (!video || !videoState?.url || video.readyState < 2) return;
    const srcW = video.videoWidth || 0;
    const srcH = video.videoHeight || 0;
    if (srcW <= 0 || srcH <= 0) return;
    const fit = (videoState.fit ?? 'contain') as MediaFit;
    const { sx, sy, sw, sh, dx, dy, dw, dh } = getFittedDrawParams(srcW, srcH, width, height, fit);
    try {
      ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);
    } catch {
      // Cross-origin media without CORS cannot be sampled into the effect canvas.
    }
  }

  function drawImage(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const img = document.querySelector('.image-overlay img') as HTMLImageElement | null;
    if (!img || !imageState?.visible || !imageState.url) return;
    const srcW = img.naturalWidth || img.clientWidth || 0;
    const srcH = img.naturalHeight || img.clientHeight || 0;
    if (srcW <= 0 || srcH <= 0) return;
    const fit = (imageState.fit ?? 'contain') as MediaFit;
    const { sx, sy, sw, sh, dx, dy, dw, dh } = getFittedDrawParams(srcW, srcH, width, height, fit);
    const scale = clampNumber(imageState.scale, 1, 0.1, 10);
    const offsetX = Number.isFinite(imageState.offsetX) ? imageState.offsetX : 0;
    const offsetY = Number.isFinite(imageState.offsetY) ? imageState.offsetY : 0;
    const opacity = clampNumber(imageState.opacity, 1, 0, 1);
    const centerX = dx + dw / 2;
    const centerY = dy + dh / 2;
    const scaledW = dw * scale;
    const scaledH = dh * scale;
    try {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.drawImage(
        img,
        sx,
        sy,
        sw,
        sh,
        centerX - scaledW / 2 + offsetX,
        centerY - scaledH / 2 + offsetY,
        scaledW,
        scaledH
      );
      ctx.restore();
    } catch {
      // Cross-origin images without CORS cannot be sampled into the effect canvas.
    }
  }

  function setBaseLayerVisibility(show: boolean): void {
    if (baseVisible === show) return;
    baseVisible = show;
    const baseLayers = Array.from(
      document.querySelectorAll('.display-visual-scenes, .video-overlay, .image-overlay')
    ) as HTMLElement[];
    for (const layer of baseLayers) {
      layer.style.visibility = show ? 'visible' : 'hidden';
    }
  }

  function renderAsciiOverlay(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    cols: number,
    rows: number
  ): void {
    drawAsciiBorder(ctx, width, height, cols, rows, 'rgba(255, 228, 210, 0.55)');
  }

  function hasMelScene(): boolean {
    return Boolean(document.querySelector('.display-visual-scenes canvas[data-shugu-layer-key="mel-scene"]'));
  }

  function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function normalizeBlendMode(value: string | undefined): GlobalCompositeOperation {
    switch (value?.trim()) {
      case 'screen':
        return 'screen';
      case 'multiply':
        return 'multiply';
      case 'overlay':
        return 'overlay';
      case 'darken':
        return 'darken';
      case 'lighten':
        return 'lighten';
      case 'difference':
        return 'difference';
      case 'plus-lighter':
        return 'lighter';
      case 'normal':
      case '':
      default:
        return 'source-over';
    }
  }

  function getFittedDrawParams(
    srcW: number,
    srcH: number,
    dstW: number,
    dstH: number,
    fit: MediaFit
  ): {
    sx: number;
    sy: number;
    sw: number;
    sh: number;
    dx: number;
    dy: number;
    dw: number;
    dh: number;
  } {
    if (fit === 'fill') {
      return { sx: 0, sy: 0, sw: srcW, sh: srcH, dx: 0, dy: 0, dw: dstW, dh: dstH };
    }
    if (fit === 'cover') {
      const scale = Math.max(dstW / srcW, dstH / srcH);
      const sw = dstW / scale;
      const sh = dstH / scale;
      return {
        sx: (srcW - sw) / 2,
        sy: (srcH - sh) / 2,
        sw,
        sh,
        dx: 0,
        dy: 0,
        dw: dstW,
        dh: dstH,
      };
    }

    const scale = fit === 'contain' ? Math.min(1, dstW / srcW, dstH / srcH) : Math.min(dstW / srcW, dstH / srcH);
    const dw = srcW * scale;
    const dh = srcH * scale;
    return {
      sx: 0,
      sy: 0,
      sw: srcW,
      sh: srcH,
      dx: (dstW - dw) / 2,
      dy: (dstH - dh) / 2,
      dw,
      dh,
    };
  }
</script>

<div class="display-visual-effects" bind:this={container} aria-hidden="true">
  <canvas bind:this={effectCanvas}></canvas>
</div>

<style>
  .display-visual-effects {
    position: fixed;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    overflow: hidden;
  }

  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    visibility: hidden;
  }
</style>
