/**
 * Client visual-layer stores (scene selection, camera stream, post-processing effects).
 *
 * Keep this module free of SDK/runtime wiring so it can be reused by control executors.
 */

import { writable, get } from 'svelte/store';
import type { ConvolutionPreset, VisualEffect, VisualSceneLayerItem } from '@shugu/protocol';
import { clampNumber } from './client-utils';

type AnyRecord = Record<string, unknown>;

const asRecord = (value: unknown): AnyRecord | null =>
  value && typeof value === 'object' ? (value as AnyRecord) : null;

const convolutionPresets: ConvolutionPreset[] = [
  'blur',
  'gaussianBlur',
  'sharpen',
  'edge',
  'emboss',
  'sobelX',
  'sobelY',
  'custom',
];

const isConvolutionPreset = (value: string): value is ConvolutionPreset =>
  convolutionPresets.includes(value as ConvolutionPreset);

// Independent scene enabled states (derived from visualScenes)
export const boxSceneEnabled = writable<boolean>(false);
export const melSceneEnabled = writable<boolean>(false);
export const frontCameraEnabled = writable<boolean>(false);
export const backCameraEnabled = writable<boolean>(false);

// Visual scene layer applied on top of the visual layer (first -> last).
// Default keeps the client visually idle until a Manager explicitly enables scenes.
export const visualScenes = writable<VisualSceneLayerItem[]>([]);

export function normalizeVisualScenesPayload(payload: unknown): VisualSceneLayerItem[] {
  const payloadRecord = asRecord(payload);
  const raw = payloadRecord?.scenes ?? null;
  if (!Array.isArray(raw)) return [];

  const limited = raw.slice(0, 12);
  const out: VisualSceneLayerItem[] = [];

  for (const item of limited) {
    const itemRecord = asRecord(item);
    if (!itemRecord) continue;
    const type = typeof itemRecord.type === 'string' ? String(itemRecord.type) : '';
    if (type === 'box') {
      out.push({ type: 'box' });
      continue;
    }
    if (type === 'mel') {
      out.push({ type: 'mel' });
      continue;
    }
    if (type === 'frontCamera') {
      out.push({ type: 'frontCamera' });
      continue;
    }
    if (type === 'backCamera') {
      out.push({ type: 'backCamera' });
    }
  }

  // De-duplicate scene types, keeping the last occurrence so ordering is preserved.
  const deduped: VisualSceneLayerItem[] = [];
  const seen = new Set<string>();
  for (let i = out.length - 1; i >= 0; i--) {
    const entry = out[i]!;
    if (seen.has(entry.type)) continue;
    seen.add(entry.type);
    deduped.push(entry);
  }
  deduped.reverse();

  // Camera is mutually exclusive; keep only the last camera item if both appear.
  const lastCameraIndex = (() => {
    for (let i = deduped.length - 1; i >= 0; i--) {
      const t = deduped[i]!.type;
      if (t === 'frontCamera' || t === 'backCamera') return i;
    }
    return -1;
  })();

  if (lastCameraIndex >= 0) {
    const keep = deduped[lastCameraIndex]!.type;
    return deduped.filter((s) =>
      s.type === 'frontCamera' || s.type === 'backCamera' ? s.type === keep : true
    );
  }

  return deduped;
}

export function syncVisualScenesToLegacyStores(scenes: VisualSceneLayerItem[]): void {
  const list = Array.isArray(scenes) ? scenes : [];
  const types = new Set(list.map((s) => s.type));

  boxSceneEnabled.set(types.has('box'));
  melSceneEnabled.set(types.has('mel'));

  const lastCamera = (() => {
    for (let i = list.length - 1; i >= 0; i--) {
      const t = list[i]!.type;
      if (t === 'frontCamera' || t === 'backCamera') return t;
    }
    return null;
  })();

  const front = lastCamera === 'frontCamera';
  const back = lastCamera === 'backCamera';
  frontCameraEnabled.set(front);
  backCameraEnabled.set(back);

  if (front) {
    void startCameraStream('user');
  } else if (back) {
    void startCameraStream('environment');
  } else {
    stopCameraStream();
  }
}

// Camera stream state
export type CameraFacing = 'user' | 'environment' | null;
export const cameraStream = writable<MediaStream | null>(null);
export const cameraFacing = writable<CameraFacing>(null);

/**
 * Start camera stream with specified facing mode
 */
export async function startCameraStream(facingMode: 'user' | 'environment'): Promise<void> {
  // Stop any existing stream first
  stopCameraStream();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode } },
      audio: false,
    });
    cameraStream.set(stream);
    cameraFacing.set(facingMode);
    console.log(`[Camera] Started ${facingMode} camera`);
  } catch (error) {
    console.error('[Camera] Failed to start camera:', error);
    cameraStream.set(null);
    cameraFacing.set(null);
  }
}

/**
 * Stop camera stream and release resources
 */
export function stopCameraStream(): void {
  const stream = get(cameraStream);
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    cameraStream.set(null);
    cameraFacing.set(null);
    console.log('[Camera] Stopped camera');
  }
}

// Visual post-processing chain applied on top of the visual layer (first -> last).
// Default keeps the client visually idle until a Manager explicitly enables effects.
export const visualEffects = writable<VisualEffect[]>([]);

export function normalizeVisualEffectsPayload(payload: unknown): VisualEffect[] {
  const payloadRecord = asRecord(payload);
  const raw = payloadRecord?.effects ?? null;
  if (!Array.isArray(raw)) return [];
  const limited = raw.slice(0, 12);
  const out: VisualEffect[] = [];

  for (const item of limited) {
    const itemRecord = asRecord(item);
    if (!itemRecord) continue;
    const type = typeof itemRecord.type === 'string' ? String(itemRecord.type) : '';
    if (type === 'ascii') {
      const cellSize = clampNumber(itemRecord.cellSize, 11, 1, 100);
      out.push({ type: 'ascii', cellSize: Math.round(cellSize) });
      continue;
    }
    if (type === 'convolution') {
      const presetRaw =
        typeof itemRecord.preset === 'string' ? String(itemRecord.preset) : undefined;
      const preset = presetRaw && isConvolutionPreset(presetRaw) ? presetRaw : undefined;
      const kernelRaw = Array.isArray(itemRecord.kernel) ? itemRecord.kernel : undefined;
      const kernel = kernelRaw
        ? kernelRaw
            .map((n: unknown) => (typeof n === 'number' ? n : Number(n)))
            .filter((n: number) => Number.isFinite(n))
            .slice(0, 9)
        : undefined;

      out.push({
        type: 'convolution',
        ...(preset ? { preset } : {}),
        ...(kernel && kernel.length === 9 ? { kernel } : {}),
        mix: clampNumber(itemRecord.mix, 1, 0, 1),
        bias: clampNumber(itemRecord.bias, 0, -1, 1),
        normalize: typeof itemRecord.normalize === 'boolean' ? itemRecord.normalize : true,
        scale: clampNumber(itemRecord.scale, 0.5, 0.1, 1),
      });
    }
  }

  return out;
}
