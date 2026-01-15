/**
 * Purpose: Effect chain pipeline for visual post-processing.
 */

import type { VisualEffect } from '@shugu/protocol';

import type { AsciiEffectRuntime } from './ascii.js';
import { applyAsciiEffect } from './ascii.js';
import type { ConvolutionEffectRuntime } from './convolution.js';
import { applyConvolutionEffect } from './convolution.js';
import {
  asVisualEffect,
  getAsciiCellSize,
  getConvolutionScale,
  getEffectType,
} from './effect-guards.js';

export type VisualEffectPipeline = AsciiEffectRuntime &
  ConvolutionEffectRuntime & {
    frameA: HTMLCanvasElement;
    frameACtx: CanvasRenderingContext2D | null;
    frameB: HTMLCanvasElement;
    frameBCtx: CanvasRenderingContext2D | null;
    lastEffectDraw: number;
    lastEffectsSignature: string;
  };

export type VisualEffectRenderParams = {
  effects: VisualEffect[] | unknown[];
  nowMs: number;
  container: HTMLElement | null;
  outputCanvas: HTMLCanvasElement | null;
  outputCtx: CanvasRenderingContext2D | null;
  drawBaseFrame: (ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number) => void;
  melSceneEnabled?: boolean;
  asciiOverlay?: (ctx: CanvasRenderingContext2D, width: number, height: number, cols: number, rows: number) => void;
  devicePixelRatio?: number;
};

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function createVisualEffectPipeline(): VisualEffectPipeline {
  const frameA = document.createElement('canvas');
  const frameB = document.createElement('canvas');
  const tinyCanvas = document.createElement('canvas');
  const convWorkCanvas = document.createElement('canvas');

  return {
    frameA,
    frameACtx: frameA.getContext('2d'),
    frameB,
    frameBCtx: frameB.getContext('2d'),
    tinyCanvas,
    tinyCtx: tinyCanvas.getContext('2d', { willReadFrequently: true }),
    convWorkCanvas,
    convWorkCtx: convWorkCanvas.getContext('2d', { willReadFrequently: true }),
    convOutput: null,
    convWorkW: 0,
    convWorkH: 0,
    lastEffectDraw: 0,
    lastEffectsSignature: '',
  };
}

export function resetVisualEffectPipeline(pipeline: VisualEffectPipeline): void {
  pipeline.lastEffectDraw = 0;
  pipeline.lastEffectsSignature = '';
  pipeline.convWorkW = 0;
  pipeline.convWorkH = 0;
  pipeline.convOutput = null;
}

function computeEffectTargetFps(
  effects: VisualEffect[] | unknown[],
  width: number,
  height: number,
  melSceneEnabled: boolean
): number {
  let fps = 30;

  for (const effect of effects) {
    if (!effect || typeof effect !== 'object') continue;
    const type = getEffectType(effect);

    if (type === 'convolution') {
      const scale = clampNumber(getConvolutionScale(effect) ?? 0.5, 0.1, 1);
      let procW = Math.max(48, Math.floor(width * scale));
      let procH = Math.max(48, Math.floor(height * scale));

      const maxPixels = 260_000;
      const pixels = procW * procH;
      if (pixels > maxPixels) {
        const ratio = Math.sqrt(maxPixels / pixels);
        procW = Math.max(48, Math.floor(procW * ratio));
        procH = Math.max(48, Math.floor(procH * ratio));
      }

      const convFps = procW * procH > 180_000 ? 15 : 30;
      fps = Math.min(fps, convFps);
      continue;
    }

    if (type === 'ascii') {
      const cellSize = Math.max(1, Math.min(100, Math.round(getAsciiCellSize(effect) ?? 11)));
      const cols = Math.max(24, Math.floor(width / cellSize));
      const rows = Math.max(18, Math.floor(height / (cellSize * 1.05)));

      const cellCount = cols * rows;
      const asciiFps = (() => {
        if (melSceneEnabled) return cellCount >= 12_000 ? 10 : 15;
        return cellCount >= 18_000 ? 15 : 30;
      })();
      fps = Math.min(fps, asciiFps);
    }
  }

  return Math.max(5, Math.min(60, fps));
}

export function renderVisualEffects(
  pipeline: VisualEffectPipeline,
  params: VisualEffectRenderParams
): boolean {
  const {
    effects,
    nowMs,
    container,
    outputCanvas,
    outputCtx,
    drawBaseFrame,
    melSceneEnabled = false,
    asciiOverlay,
  } = params;

  if (!container || !outputCanvas || !outputCtx) return false;
  if (!pipeline.frameACtx || !pipeline.frameBCtx) return false;
  if (!pipeline.tinyCanvas || !pipeline.tinyCtx) return false;
  if (!pipeline.convWorkCanvas || !pipeline.convWorkCtx) return false;

  const width = container.clientWidth ?? 0;
  const height = container.clientHeight ?? 0;
  if (width === 0 || height === 0) return false;

  const signature = (() => {
    try {
      return JSON.stringify(effects);
    } catch {
      return '';
    }
  })();
  if (signature !== pipeline.lastEffectsSignature) {
    pipeline.lastEffectsSignature = signature;
    pipeline.lastEffectDraw = 0;
  }

  const targetFps = computeEffectTargetFps(effects, width, height, melSceneEnabled);
  if (nowMs - pipeline.lastEffectDraw < 1000 / targetFps) return true;
  pipeline.lastEffectDraw = nowMs;

  const rawDpr =
    typeof params.devicePixelRatio === 'number' && Number.isFinite(params.devicePixelRatio)
      ? params.devicePixelRatio
      : typeof window !== 'undefined'
        ? window.devicePixelRatio || 1
        : 1;
  const dpr = Math.min(rawDpr, 2);

  const targetW = Math.floor(width * dpr);
  const targetH = Math.floor(height * dpr);
  if (targetW === 0 || targetH === 0) return false;

  if (outputCanvas.width !== targetW) outputCanvas.width = targetW;
  if (outputCanvas.height !== targetH) outputCanvas.height = targetH;
  if (outputCanvas.style.width !== `${width}px`) outputCanvas.style.width = `${width}px`;
  if (outputCanvas.style.height !== `${height}px`) outputCanvas.style.height = `${height}px`;

  if (pipeline.frameA.width !== targetW) pipeline.frameA.width = targetW;
  if (pipeline.frameA.height !== targetH) pipeline.frameA.height = targetH;
  if (pipeline.frameB.width !== targetW) pipeline.frameB.width = targetW;
  if (pipeline.frameB.height !== targetH) pipeline.frameB.height = targetH;

  drawBaseFrame(pipeline.frameACtx, width, height, dpr);

  let srcCanvas: HTMLCanvasElement = pipeline.frameA;
  let srcCtx: CanvasRenderingContext2D = pipeline.frameACtx;
  let dstCanvas: HTMLCanvasElement = pipeline.frameB;
  let dstCtx: CanvasRenderingContext2D = pipeline.frameBCtx;

  for (const effect of Array.isArray(effects) ? effects : []) {
    if (!effect || typeof effect !== 'object') continue;
    const type = getEffectType(effect);
    const visualEffect = asVisualEffect(effect);
    if (!visualEffect) continue;

    const applied = (() => {
      if (type === 'convolution') {
        return applyConvolutionEffect(
          pipeline,
          srcCanvas,
          dstCtx,
          width,
          height,
          dpr,
          visualEffect
        );
      }
      if (type === 'ascii') {
        const result = applyAsciiEffect(
          pipeline,
          srcCanvas,
          dstCtx,
          width,
          height,
          dpr,
          visualEffect
        );
        if (result && asciiOverlay) {
          asciiOverlay(dstCtx, width, height, result.cols, result.rows);
        }
        return Boolean(result);
      }
      return false;
    })();

    if (!applied) {
      // Best-effort fallback: pass-through when the effect can't run (e.g. canvas tainted by CORS).
      dstCtx.setTransform(1, 0, 0, 1, 0, 0);
      dstCtx.clearRect(0, 0, targetW, targetH);
      dstCtx.drawImage(srcCanvas, 0, 0, targetW, targetH);
    }

    // Swap buffers for the next pass.
    [srcCanvas, dstCanvas] = [dstCanvas, srcCanvas];
    [srcCtx, dstCtx] = [dstCtx, srcCtx];
  }

  outputCtx.setTransform(1, 0, 0, 1, 0, 0);
  outputCtx.clearRect(0, 0, targetW, targetH);
  outputCtx.drawImage(srcCanvas, 0, 0, targetW, targetH);

  return true;
}
