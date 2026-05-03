/**
 * Client multimedia state (microphone stream + media clip parsing + playback state stores).
 */

import { writable } from 'svelte/store';
import type { MediaFit } from '@shugu/multimedia-core';

// Audio stream for plugins
export const audioStream = writable<MediaStream | null>(null);

export type MediaClipParams = {
  baseUrl: string;
  startSec: number;
  endSec: number;
  loop: boolean | null;
  play: boolean | null;
  reverse: boolean | null;
  cursorSec: number | null;
  sourceNodeId: string | null;
  fit: MediaFit | null;
  // Image modulation parameters
  scale: number | null;
  offsetX: number | null;
  offsetY: number | null;
  opacity: number | null;
};

export function parseMediaClipParams(raw: string): MediaClipParams {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      baseUrl: '',
      startSec: 0,
      endSec: -1,
      loop: null,
      play: null,
      reverse: null,
      cursorSec: null,
      sourceNodeId: null,
      fit: null,
      scale: null,
      offsetX: null,
      offsetY: null,
      opacity: null,
    };
  }

  const hashIndex = trimmed.indexOf('#');
  if (hashIndex < 0) {
    return {
      baseUrl: trimmed,
      startSec: 0,
      endSec: -1,
      loop: null,
      play: null,
      reverse: null,
      cursorSec: null,
      sourceNodeId: null,
      fit: null,
      scale: null,
      offsetX: null,
      offsetY: null,
      opacity: null,
    };
  }

  const baseUrl = trimmed.slice(0, hashIndex).trim();
  const hash = trimmed.slice(hashIndex + 1);
  const params = new URLSearchParams(hash);

  const toNumber = (value: string | null, fallback: number): number => {
    if (value == null) return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const toBoolean = (value: string | null, fallback: boolean): boolean => {
    if (value == null) return fallback;
    const normalized = value.trim().toLowerCase();
    if (!normalized) return fallback;
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    const n = Number(normalized);
    if (Number.isFinite(n)) return n >= 0.5;
    return fallback;
  };

  const tRaw = params.get('t');
  let startSec = 0;
  let endSec = -1;
  if (tRaw !== null) {
    const parts = tRaw.split(',');
    const startCandidate = parts[0]?.trim() ?? '';
    const endCandidate = parts[1]?.trim() ?? '';
    startSec = toNumber(startCandidate || null, 0);
    if (parts.length > 1) {
      endSec = endCandidate ? toNumber(endCandidate, -1) : -1;
    }
  }

  const loopRaw = params.get('loop');
  const playRaw = params.get('play');
  const reverseRaw = params.get('rev');
  const cursorRaw = params.get('p');
  const nodeRaw = params.get('node');
  const fitRaw = params.get('fit');

  const cursorParsed = cursorRaw === null ? null : toNumber(cursorRaw, -1);
  const cursorSec =
    cursorParsed !== null && Number.isFinite(cursorParsed) && cursorParsed >= 0
      ? cursorParsed
      : null;

  const fit = (() => {
    if (fitRaw === null) return null;
    const normalized = fitRaw.trim().toLowerCase();
    if (normalized === 'fit-screen' || normalized === 'fitscreen' || normalized === 'fullscreen')
      return 'fit-screen';
    if (normalized === 'cover') return 'cover';
    if (normalized === 'fill' || normalized === 'stretch') return 'fill';
    if (normalized === 'contain') return 'contain';
    return null;
  })();

  // Parse image modulation parameters
  const scaleRaw = params.get('scale');
  const offsetXRaw = params.get('offsetX');
  const offsetYRaw = params.get('offsetY');
  const opacityRaw = params.get('opacity');

  const scale = scaleRaw === null ? null : toNumber(scaleRaw, 1);
  const offsetX = offsetXRaw === null ? null : toNumber(offsetXRaw, 0);
  const offsetY = offsetYRaw === null ? null : toNumber(offsetYRaw, 0);
  const opacity = opacityRaw === null ? null : toNumber(opacityRaw, 1);

  return {
    baseUrl,
    startSec: Number.isFinite(startSec) ? startSec : 0,
    endSec: Number.isFinite(endSec) ? endSec : -1,
    loop: loopRaw === null ? null : toBoolean(loopRaw, false),
    play: playRaw === null ? null : toBoolean(playRaw, true),
    reverse: reverseRaw === null ? null : toBoolean(reverseRaw, false),
    cursorSec,
    sourceNodeId: typeof nodeRaw === 'string' && nodeRaw.trim() ? nodeRaw.trim() : null,
    fit,
    scale,
    offsetX,
    offsetY,
    opacity,
  };
}

// Video playback state
export const videoState = writable<{
  url: string | null;
  sourceNodeId: string | null;
  playing: boolean;
  muted: boolean;
  loop: boolean;
  volume: number;
  startSec: number;
  endSec: number;
  cursorSec: number;
  reverse: boolean;
  fit: MediaFit;
}>({
  url: null,
  sourceNodeId: null,
  playing: false,
  muted: true,
  loop: false,
  volume: 1,
  startSec: 0,
  endSec: -1,
  cursorSec: -1,
  reverse: false,
  fit: 'contain',
});

// Image display state
export const imageState = writable<{
  url: string | null;
  visible: boolean;
  duration: number | undefined;
  fit: MediaFit;
  scale: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
}>({
  url: null,
  visible: false,
  duration: undefined,
  fit: 'contain',
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  opacity: 1,
});

export const audioPlaybackState = writable<{
  url: string | null;
  playing: boolean;
  loop: boolean;
  volume: number;
}>({
  url: null,
  playing: false,
  loop: false,
  volume: 1,
});
