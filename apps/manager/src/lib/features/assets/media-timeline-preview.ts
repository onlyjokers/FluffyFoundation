/**
 * Purpose: Build timeline previews (duration + optional audio spectrogram) for asset-backed media.
 *
 * This is manager-only UI support. It downloads/decodes media for visualization and is NOT used
 * for realtime client playback (which must remain lightweight).
 */

type MediaKind = 'audio' | 'video';

const durationCache = new Map<string, number>();
const durationInFlight = new Map<string, Promise<number | null>>();

const spectrogramCache = new Map<string, string>();
const spectrogramInFlight = new Map<string, Promise<string | null>>();

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function makeMediaElement(kind: MediaKind): HTMLMediaElement {
  if (kind === 'video') return document.createElement('video');
  return document.createElement('audio');
}

export async function getMediaDurationSec(url: string, kind: MediaKind): Promise<number | null> {
  const key = url.trim();
  if (!key) return null;
  const cached = durationCache.get(key);
  if (cached !== undefined) return cached;
  const inFlight = durationInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const el = makeMediaElement(kind);
      el.preload = 'metadata';
      el.crossOrigin = 'anonymous';
      el.src = key;

      const duration = await new Promise<number>((resolve, reject) => {
        const cleanup = () => {
          el.removeAttribute('src');
          try {
            el.load();
          } catch {
            // ignore
          }
        };

        const handleLoaded = () => {
          const d = Number(el.duration);
          cleanup();
          resolve(d);
        };
        const handleError = () => {
          cleanup();
          reject(new Error('metadata load failed'));
        };

        el.addEventListener('loadedmetadata', handleLoaded, { once: true });
        el.addEventListener('error', handleError, { once: true });
      });

      if (!Number.isFinite(duration) || duration <= 0) return null;
      durationCache.set(key, duration);
      return duration;
    } catch {
      return null;
    } finally {
      durationInFlight.delete(key);
    }
  })();

  durationInFlight.set(key, promise);
  return promise;
}

type FFTFrame = {
  mags: Float32Array;
};

function hannWindow(n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    out[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  }
  return out;
}

// In-place radix-2 FFT (Cooley–Tukey). Real/imag arrays length must be power-of-two.
function fftRadix2(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < n; i += 1) {
    if (i < j) {
      const tr = re[i];
      const ti = im[i];
      re[i] = re[j];
      im[i] = im[j];
      re[j] = tr;
      im[j] = ti;
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }

  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const theta = (-2 * Math.PI) / size;
    const wStepRe = Math.cos(theta);
    const wStepIm = Math.sin(theta);

    for (let start = 0; start < n; start += size) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < half; k += 1) {
        const i0 = start + k;
        const i1 = i0 + half;

        const tRe = wRe * re[i1] - wIm * im[i1];
        const tIm = wRe * im[i1] + wIm * re[i1];

        re[i1] = re[i0] - tRe;
        im[i1] = im[i0] - tIm;
        re[i0] = re[i0] + tRe;
        im[i0] = im[i0] + tIm;

        const nextWRe = wRe * wStepRe - wIm * wStepIm;
        const nextWIm = wRe * wStepIm + wIm * wStepRe;
        wRe = nextWRe;
        wIm = nextWIm;
      }
    }
  }
}

function magnitudeSpectrum(re: Float32Array, im: Float32Array): Float32Array {
  const n = re.length;
  const bins = n >> 1;
  const mags = new Float32Array(bins);
  for (let i = 0; i < bins; i += 1) {
    const r = re[i];
    const ii = im[i];
    mags[i] = Math.sqrt(r * r + ii * ii);
  }
  return mags;
}

async function decodeAudio(url: string): Promise<{ buffer: AudioBuffer; ctx: AudioContext } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    type WebkitAudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextCtor =
      window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext;
    if (!AudioContextCtor) return null;
    const ctx = new AudioContextCtor();
    const buffer = await ctx.decodeAudioData(ab.slice(0));
    return { buffer, ctx };
  } catch {
    return null;
  }
}

function colorRamp(t: number): [number, number, number] {
  const x = clamp(t, 0, 1);
  // black -> indigo -> cyan -> white
  if (x < 0.5) {
    const k = x / 0.5;
    const r = Math.round(10 + 40 * k);
    const g = Math.round(10 + 50 * k);
    const b = Math.round(30 + 190 * k);
    return [r, g, b];
  }
  const k = (x - 0.5) / 0.5;
  const r = Math.round(50 + 205 * k);
  const g = Math.round(60 + 195 * k);
  const b = Math.round(220 + 35 * k);
  return [r, g, b];
}

export async function getAudioSpectrogramDataUrl(
  url: string,
  opts: { width?: number; height?: number; fftSize?: number } = {}
): Promise<string | null> {
  const key = url.trim();
  if (!key) return null;
  const cached = spectrogramCache.get(key);
  if (cached !== undefined) return cached;
  const inFlight = spectrogramInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    let audioCtx: AudioContext | null = null;
    try {
      const decoded = await decodeAudio(key);
      if (!decoded) return null;
      const { buffer, ctx } = decoded;
      audioCtx = ctx;

      const width = Math.max(64, Math.floor(opts.width ?? 360));
      const height = Math.max(24, Math.floor(opts.height ?? 72));
      const fftSize = Math.max(256, Math.min(4096, Math.floor(opts.fftSize ?? 1024)));

      const samples = buffer.getChannelData(0);
      const durationSec = buffer.duration;
      const sampleRate = buffer.sampleRate;

      const hop = Math.max(1, Math.floor((samples.length - fftSize) / Math.max(1, width - 1)));
      const window = hannWindow(fftSize);

      const frames: FFTFrame[] = new Array(width);
      const re = new Float32Array(fftSize);
      const im = new Float32Array(fftSize);

      for (let x = 0; x < width; x += 1) {
        const start = x * hop;
        for (let i = 0; i < fftSize; i += 1) {
          const s = samples[start + i] ?? 0;
          re[i] = s * window[i];
          im[i] = 0;
        }
        fftRadix2(re, im);
        frames[x] = { mags: magnitudeSpectrum(re, im) };
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx2d = canvas.getContext('2d');
      if (!ctx2d) return null;
      const image = ctx2d.createImageData(width, height);

      const minDb = -96;
      const maxDb = -24;

      const nyquist = sampleRate / 2;
      const minFreq = 40;
      const maxFreq = Math.min(12_000, nyquist);

      const binForFreq = (freq: number) => {
        const f = clamp(freq, 0, nyquist);
        const bins = fftSize / 2;
        return clamp(Math.round((f / nyquist) * bins), 0, bins - 1);
      };

      for (let x = 0; x < width; x += 1) {
        const mags = frames[x].mags;
        for (let y = 0; y < height; y += 1) {
          const frac = 1 - y / Math.max(1, height - 1);
          const freq = minFreq * Math.pow(maxFreq / minFreq, frac);
          const bin = binForFreq(freq);
          const mag = mags[bin] ?? 0;
          const db = 20 * Math.log10(mag + 1e-12);
          const t = (db - minDb) / (maxDb - minDb);
          const [r, g, b] = colorRamp(t);
          const idx = (y * width + x) * 4;
          image.data[idx] = r;
          image.data[idx + 1] = g;
          image.data[idx + 2] = b;
          image.data[idx + 3] = 255;
        }
      }

      // Slight vignetting for readability of handles.
      for (let x = 0; x < width; x += 1) {
        const edge = Math.min(x, width - 1 - x) / Math.max(1, width / 2);
        const alpha = 0.6 + 0.4 * edge;
        for (let y = 0; y < height; y += 1) {
          const idx = (y * width + x) * 4;
          image.data[idx] = Math.round(image.data[idx] * alpha);
          image.data[idx + 1] = Math.round(image.data[idx + 1] * alpha);
          image.data[idx + 2] = Math.round(image.data[idx + 2] * alpha);
        }
      }

      ctx2d.putImageData(image, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');

      // Prefer duration cache from decoded buffer.
      if (Number.isFinite(durationSec) && durationSec > 0) {
        durationCache.set(key, durationSec);
      }

      spectrogramCache.set(key, dataUrl);
      return dataUrl;
    } finally {
      if (audioCtx) {
        try {
          void audioCtx.close?.();
        } catch {
          // ignore
        }
      }
      spectrogramInFlight.delete(key);
    }
  })();

  spectrogramInFlight.set(key, promise);
  return promise;
}
