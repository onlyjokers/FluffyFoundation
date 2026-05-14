/**
 * Purpose: Parse media playback parameters encoded in display media refs.
 */
import type { MediaFit } from '@shugu/multimedia-core';

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
};

function createDefaultMediaClipParams(baseUrl = ''): MediaClipParams {
  return {
    baseUrl,
    startSec: 0,
    endSec: -1,
    loop: null,
    play: null,
    reverse: null,
    cursorSec: null,
    sourceNodeId: null,
    fit: null,
  };
}

function toNumber(value: string | null, fallback: number): number {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBoolean(value: string | null, fallback: boolean): boolean {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  const n = Number(normalized);
  if (Number.isFinite(n)) return n >= 0.5;
  return fallback;
}

function parseMediaFit(value: string | null): MediaFit | null {
  if (value === null) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'fit-screen' || normalized === 'fitscreen' || normalized === 'fullscreen') {
    return 'fit-screen';
  }
  if (normalized === 'cover') return 'cover';
  if (normalized === 'fill' || normalized === 'stretch') return 'fill';
  if (normalized === 'contain') return 'contain';
  return null;
}

export function parseMediaClipParams(raw: string): MediaClipParams {
  const trimmed = raw.trim();
  if (!trimmed) return createDefaultMediaClipParams();

  const hashIndex = trimmed.indexOf('#');
  if (hashIndex < 0) return createDefaultMediaClipParams(trimmed);

  const baseUrl = trimmed.slice(0, hashIndex).trim();
  const params = new URLSearchParams(trimmed.slice(hashIndex + 1));

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

  const cursorRaw = params.get('p');
  const cursorParsed = cursorRaw === null ? null : toNumber(cursorRaw, -1);
  const cursorSec =
    cursorParsed !== null && Number.isFinite(cursorParsed) && cursorParsed >= 0
      ? cursorParsed
      : null;
  const nodeRaw = params.get('node');

  return {
    baseUrl,
    startSec: Number.isFinite(startSec) ? startSec : 0,
    endSec: Number.isFinite(endSec) ? endSec : -1,
    loop: params.get('loop') === null ? null : toBoolean(params.get('loop'), false),
    play: params.get('play') === null ? null : toBoolean(params.get('play'), true),
    reverse: params.get('rev') === null ? null : toBoolean(params.get('rev'), false),
    cursorSec,
    sourceNodeId: typeof nodeRaw === 'string' && nodeRaw.trim() ? nodeRaw.trim() : null,
    fit: parseMediaFit(params.get('fit')),
  };
}
