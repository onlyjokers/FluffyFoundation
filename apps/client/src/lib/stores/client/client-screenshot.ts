/**
 * Client screenshot capture + upload helper (used by the `custom: push-image-upload` control).
 */

import { get } from 'svelte/store';
import type { ClientSDK } from '@shugu/sdk-client';
import type { MediaFit } from '@shugu/multimedia-core';
import {
  visualEffects,
  cameraStream,
  frontCameraEnabled,
  backCameraEnabled,
} from './client-visual';
import { videoState, imageState } from './client-media';
import { clampNumber } from './client-utils';

type ScreenshotFormat = 'image/jpeg' | 'image/png' | 'image/webp';

export type PushImageUploadPayload = {
  kind: 'push-image-upload';
  format?: string;
  quality?: number;
  maxWidth?: number;
  // Manager-side scheduling metadata (optional).
  speed?: number;
  seq?: number;
};

let screenshotUploadInFlight = false;

function normalizeScreenshotFormat(value: unknown): ScreenshotFormat {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === 'image/png') return 'image/png';
  if (raw === 'image/webp') return 'image/webp';
  return 'image/jpeg';
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
    const sx = (srcW - sw) / 2;
    const sy = (srcH - sh) / 2;
    return { sx, sy, sw, sh, dx: 0, dy: 0, dw: dstW, dh: dstH };
  }

  const scale =
    fit === 'fit-screen'
      ? Math.min(dstW / srcW, dstH / srcH)
      : Math.min(1, dstW / srcW, dstH / srcH);
  const dw = srcW * scale;
  const dh = srcH * scale;
  const dx = (dstW - dw) / 2;
  const dy = (dstH - dh) / 2;
  return { sx: 0, sy: 0, sw: srcW, sh: srcH, dx, dy, dw, dh };
}

async function captureScreenshotDataUrl(opts: {
  format: ScreenshotFormat;
  quality: number;
  maxWidth: number;
}): Promise<
  | {
      ok: true;
      shot: {
        dataUrl: string;
        mime: ScreenshotFormat;
        width: number;
        height: number;
        createdAt: number;
      };
    }
  | { ok: false; reason: string }
> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { ok: false, reason: 'missing-window-or-document' };
  }

  const container = document.querySelector('.visual-container') as HTMLElement | null;
  if (!container) return { ok: false, reason: 'missing-visual-container' };

  const viewW = container.clientWidth ?? 0;
  const viewH = container.clientHeight ?? 0;
  if (viewW <= 0 || viewH <= 0) return { ok: false, reason: 'visual-container-size-0' };

  const maxWidth = Math.max(128, Math.floor(opts.maxWidth));
  const scale = viewW > maxWidth ? maxWidth / viewW : 1;
  const outW = Math.max(1, Math.floor(viewW * scale));
  const outH = Math.max(1, Math.floor(viewH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { ok: false, reason: 'missing-2d-context' };

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, outW, outH);

  const effectsActive = (get(visualEffects) ?? []).length > 0;
  const overlay = effectsActive
    ? (container.querySelector('canvas.effect-output') as HTMLCanvasElement | null)
    : null;

  // If a full-frame overlay is active, it already represents what the user sees (effect pipeline).
  if (overlay && overlay.width > 0 && overlay.height > 0) {
    ctx.drawImage(overlay, 0, 0, outW, outH);
  } else {
    const video = container.querySelector('video') as HTMLVideoElement | null;
    const img = container.querySelector('img') as HTMLImageElement | null;

    const drawMedia = () => {
      if (video && get(videoState).url && video.readyState >= 2) {
        const srcW = video.videoWidth || 0;
        const srcH = video.videoHeight || 0;
        if (srcW <= 0 || srcH <= 0) return false;

        const fit = (get(videoState).fit ?? 'contain') as MediaFit;
        const padding = fit === 'contain' ? 24 * scale : 0;
        const dstW = Math.max(0, outW - padding * 2);
        const dstH = Math.max(0, outH - padding * 2);
        if (dstW <= 0 || dstH <= 0) return false;

        const { sx, sy, sw, sh, dx, dy, dw, dh } = getFittedDrawParams(srcW, srcH, dstW, dstH, fit);
        try {
          ctx.drawImage(video, sx, sy, sw, sh, padding + dx, padding + dy, dw, dh);
          return true;
        } catch {
          return false;
        }
      }

      if (img && get(imageState).visible && get(imageState).url) {
        const srcW = img.naturalWidth || img.clientWidth || 0;
        const srcH = img.naturalHeight || img.clientHeight || 0;
        if (srcW <= 0 || srcH <= 0) return false;

        const fit = (get(imageState).fit ?? 'contain') as MediaFit;
        const padding = fit === 'contain' ? 24 * scale : 0;
        const dstW = Math.max(0, outW - padding * 2);
        const dstH = Math.max(0, outH - padding * 2);
        if (dstW <= 0 || dstH <= 0) return false;

        const { sx, sy, sw, sh, dx, dy, dw, dh } = getFittedDrawParams(srcW, srcH, dstW, dstH, fit);
        try {
          const stateNow = get(imageState);
          const imgScale = clampNumber(stateNow.scale, 1, 0.1, 10);
          const offsetX = clampNumber(stateNow.offsetX, 0, -10_000, 10_000) * scale;
          const offsetY = clampNumber(stateNow.offsetY, 0, -10_000, 10_000) * scale;
          const opacity = clampNumber(stateNow.opacity, 1, 0, 1);

          const centerX = padding + dx + dw / 2;
          const centerY = padding + dy + dh / 2;
          const scaledW = dw * imgScale;
          const scaledH = dh * imgScale;
          const drawX = centerX - scaledW / 2 + offsetX;
          const drawY = centerY - scaledH / 2 + offsetY;

          ctx.save();
          ctx.globalAlpha = opacity;
          ctx.drawImage(img, sx, sy, sw, sh, drawX, drawY, scaledW, scaledH);
          ctx.restore();
          return true;
        } catch {
          return false;
        }
      }

      // Camera video stream
      const cameraVideo = container.querySelector(
        'video.camera-display'
      ) as HTMLVideoElement | null;
      const camStream = get(cameraStream);
      const frontEnabled = get(frontCameraEnabled);
      const backEnabled = get(backCameraEnabled);
      if (
        cameraVideo &&
        camStream &&
        (frontEnabled || backEnabled) &&
        cameraVideo.readyState >= 2
      ) {
        const srcW = cameraVideo.videoWidth || 0;
        const srcH = cameraVideo.videoHeight || 0;
        if (srcW <= 0 || srcH <= 0) return false;

        const { sx, sy, sw, sh, dx, dy, dw, dh } = getFittedDrawParams(
          srcW,
          srcH,
          outW,
          outH,
          'cover'
        );
        try {
          ctx.save();
          // Apply mirror transform for front camera
          if (frontEnabled) {
            ctx.translate(outW, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(cameraVideo, sx, sy, sw, sh, dx, dy, dw, dh);
          ctx.restore();
          return true;
        } catch {
          return false;
        }
      }

      return false;
    };

    const drewMedia = drawMedia();
    if (!drewMedia) {
      const baseCanvas = Array.from(container.querySelectorAll('canvas')).find(
        (c) => !c.classList.contains('effect-output')
      ) as HTMLCanvasElement | undefined;
      if (baseCanvas && baseCanvas.width > 0 && baseCanvas.height > 0) {
        try {
          ctx.drawImage(baseCanvas, 0, 0, outW, outH);
        } catch {
          // ignore
        }
      }
    }
  }

  const quality = clampNumber(opts.quality, 0.85, 0.1, 1);
  const mime = opts.format;
  const dataUrl = (() => {
    try {
      return mime === 'image/png' ? canvas.toDataURL(mime) : canvas.toDataURL(mime, quality);
    } catch {
      // Fallback: default to PNG if the requested format fails.
      try {
        return canvas.toDataURL('image/png');
      } catch {
        return '';
      }
    }
  })();

  if (!dataUrl) return { ok: false, reason: 'toDataURL-failed' };
  return { ok: true, shot: { dataUrl, mime, width: outW, height: outH, createdAt: Date.now() } };
}

export async function handlePushImageUpload(
  sdk: ClientSDK | null,
  payload: PushImageUploadPayload
): Promise<void> {
  const seq = typeof payload?.seq === 'number' && Number.isFinite(payload.seq) ? payload.seq : null;

  if (screenshotUploadInFlight) {
    console.debug('[Client] push-image-upload skipped (inFlight)', { seq });
    return;
  }
  const sdkNow = sdk;
  if (!sdkNow) {
    console.warn('[Client] push-image-upload skipped (missing sdk)', { seq });
    return;
  }

  screenshotUploadInFlight = true;
  try {
    const format = normalizeScreenshotFormat(payload?.format);
    const quality = clampNumber(payload?.quality, 0.85, 0.1, 1);
    const maxWidth = clampNumber(payload?.maxWidth, 960, 128, 4096);

    console.info('[Client] push-image-upload capture start', {
      seq,
      format,
      quality,
      maxWidth,
      speed:
        typeof payload?.speed === 'number' && Number.isFinite(payload.speed) ? payload.speed : null,
    });

    const captured = await captureScreenshotDataUrl({ format, quality, maxWidth });
    if (!captured.ok) {
      console.warn('[Client] push-image-upload capture failed', { seq, reason: captured.reason });
      return;
    }

    const shot = captured.shot;

    const sensorPayload: Record<string, unknown> = {
      kind: 'client-screenshot',
      dataUrl: shot.dataUrl,
      mime: shot.mime,
      width: shot.width,
      height: shot.height,
      createdAt: shot.createdAt,
    };
    sdkNow.sendSensorData(
      'custom',
      sensorPayload,
      { trackLatest: false }
    );

    console.info('[Client] push-image-upload sent', {
      seq,
      mime: shot.mime,
      width: shot.width,
      height: shot.height,
      dataUrlChars: shot.dataUrl.length,
      createdAt: shot.createdAt,
    });
  } catch (err) {
    console.warn('[Client] push-image-upload failed:', err);
  } finally {
    screenshotUploadInFlight = false;
  }
}
