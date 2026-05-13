/**
 * Purpose: Manage Tone audio analysis tap instances.
 */
import type { AudioDataInstance } from '../types.js';
import { audioDataInstances, toneModule } from '../state.js';
import { scheduleGraphWiring } from '../engine-host.js';
import { clamp, toBoolean, toNumber } from '../utils.js';
import { getToneRawContext } from '../tone-guards.js';

// Audio analysis tap for patch audio connections (rms/peak/bands/centroid/bpm).
const AUDIO_DATA_FFT_SIZES = [512, 1024, 2048, 4096, 8192] as const;

export function normalizeAudioDataConfig(
  config: Record<string, unknown>
): AudioDataInstance['lastConfig'] {
  const enabled = toBoolean(config.enabled, true);
  const requestedFftSize = toNumber(config.fftSize, 2048);
  const fftSize = (() => {
    let best: number = AUDIO_DATA_FFT_SIZES[0];
    let bestDiff = Math.abs(best - requestedFftSize);
    for (const size of AUDIO_DATA_FFT_SIZES) {
      const diff = Math.abs(size - requestedFftSize);
      if (diff < bestDiff) {
        best = size;
        bestDiff = diff;
      }
    }
    return best;
  })();
  const smoothing = clamp(toNumber(config.smoothing, 0.2), 0, 0.99);
  const lowRaw = clamp(toNumber(config.lowCutoffHz, 300), 20, 20000);
  const highRaw = clamp(toNumber(config.highCutoffHz, 3000), 20, 20000);
  const lowCutoffHz = Math.min(lowRaw, highRaw);
  const highCutoffHz = Math.max(lowRaw, highRaw);
  const detectBPM = toBoolean(config.detectBPM, true);
  return { enabled, fftSize, smoothing, lowCutoffHz, highCutoffHz, detectBPM };
}

export function createAudioDataInstance(
  nodeId: string,
  config: AudioDataInstance['lastConfig']
): AudioDataInstance | null {
  if (!toneModule) return null;
  const raw: AudioContext | null = getToneRawContext(toneModule);
  if (!raw) return null;

  const input = new toneModule.Gain({ gain: 1 });
  const output = new toneModule.Gain({ gain: 1 });
  input.connect(output);

  const analyser = raw.createAnalyser();
  analyser.fftSize = config.fftSize;
  analyser.smoothingTimeConstant = config.smoothing;
  try {
    input.connect?.(analyser as AudioNode);
  } catch {
    // ignore
  }

  const instance: AudioDataInstance = {
    nodeId,
    input,
    output,
    analyser,
    timeData: new Float32Array(analyser.fftSize) as unknown as Float32Array<ArrayBuffer>,
    freqData: new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>,
    energyHistory: [],
    lastBeatAt: 0,
    beatIntervals: [],
    bpm: 0,
    lastConfig: { ...config },
  };

  audioDataInstances.set(nodeId, instance);
  scheduleGraphWiring();
  return instance;
}

export function updateAudioDataInstance(
  instance: AudioDataInstance,
  config: AudioDataInstance['lastConfig']
): void {
  const prev = instance.lastConfig;
  instance.lastConfig = { ...config };

  if (prev.fftSize !== config.fftSize) {
    try {
      instance.analyser.fftSize = config.fftSize;
      instance.timeData = new Float32Array(instance.analyser.fftSize) as unknown as Float32Array<ArrayBuffer>;
      instance.freqData = new Uint8Array(instance.analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    } catch {
      // ignore
    }
  }

  if (prev.smoothing !== config.smoothing) {
    try {
      instance.analyser.smoothingTimeConstant = config.smoothing;
    } catch {
      // ignore
    }
  }

  if (prev.detectBPM !== config.detectBPM || (!prev.enabled && config.enabled)) {
    instance.energyHistory = [];
    instance.beatIntervals = [];
    instance.lastBeatAt = 0;
    instance.bpm = 0;
  }

  if (!config.enabled) {
    instance.energyHistory = [];
    instance.beatIntervals = [];
    instance.lastBeatAt = 0;
    instance.bpm = 0;
  }
}

export function analyzeAudioDataInstance(
  instance: AudioDataInstance,
  nowMs: number
): {
  rms: number;
  peak: number;
  low: number;
  mid: number;
  high: number;
  centroidHz: number;
  bpm: number;
  beat: boolean;
} {
  let rms = 0;
  let peak = 0;

  try {
    instance.analyser.getFloatTimeDomainData(instance.timeData);
    let sumSquares = 0;
    for (let i = 0; i < instance.timeData.length; i += 1) {
      const v = instance.timeData[i] ?? 0;
      sumSquares += v * v;
      const abs = Math.abs(v);
      if (abs > peak) peak = abs;
    }
    rms = instance.timeData.length > 0 ? Math.sqrt(sumSquares / instance.timeData.length) : 0;
  } catch {
    // ignore
  }

  let low = 0;
  let mid = 0;
  let high = 0;
  let centroidHz = 0;

  try {
    instance.analyser.getByteFrequencyData(instance.freqData);
    const binCount = instance.freqData.length;
    const sampleRate = instance.analyser.context?.sampleRate ?? 44100;
    const nyquist = sampleRate / 2;
    const binWidth = binCount > 0 ? nyquist / binCount : 0;

    const lowBinEnd = binWidth > 0 ? Math.floor(instance.lastConfig.lowCutoffHz / binWidth) : 0;
    const highBinStart =
      binWidth > 0 ? Math.floor(instance.lastConfig.highCutoffHz / binWidth) : binCount;

    const lowEnd = Math.max(0, Math.min(binCount, lowBinEnd));
    const highStart = Math.max(0, Math.min(binCount, highBinStart));

    let lowSum = 0;
    let midSum = 0;
    let highSum = 0;
    let lowCount = 0;
    let midCount = 0;
    let highCount = 0;

    let weightedSum = 0;
    let totalMag = 0;

    for (let i = 0; i < binCount; i += 1) {
      const mag = (instance.freqData[i] ?? 0) / 255;
      const freq = i * binWidth;
      weightedSum += freq * mag;
      totalMag += mag;

      if (i < lowEnd) {
        lowSum += mag;
        lowCount += 1;
      } else if (i >= highStart) {
        highSum += mag;
        highCount += 1;
      } else {
        midSum += mag;
        midCount += 1;
      }
    }

    low = lowCount > 0 ? lowSum / lowCount : 0;
    mid = midCount > 0 ? midSum / midCount : 0;
    high = highCount > 0 ? highSum / highCount : 0;
    centroidHz = totalMag > 0 ? weightedSum / totalMag : 0;
  } catch {
    // ignore
  }

  let beat = false;
  let bpm = instance.lastConfig.detectBPM ? instance.bpm : 0;

  if (instance.lastConfig.enabled && instance.lastConfig.detectBPM) {
    const windowMs = 1000;
    instance.energyHistory.push({ t: nowMs, e: low });
    while (instance.energyHistory.length > 0 && instance.energyHistory[0]!.t < nowMs - windowMs) {
      instance.energyHistory.shift();
    }

    if (instance.energyHistory.length >= 10) {
      const avg =
        instance.energyHistory.reduce((sum, item) => sum + item.e, 0) / instance.energyHistory.length;
      const variance =
        instance.energyHistory.reduce((sum, item) => sum + (item.e - avg) ** 2, 0) /
        instance.energyHistory.length;
      const std = Math.sqrt(variance);

      const threshold = avg + 1.3 * std;
      const minBeatInterval = 250; // Max 240 BPM.

      if (low > threshold && nowMs - instance.lastBeatAt > minBeatInterval) {
        beat = true;
        const interval = instance.lastBeatAt > 0 ? nowMs - instance.lastBeatAt : 0;
        instance.lastBeatAt = nowMs;

        if (interval > 0 && interval < 2000) {
          instance.beatIntervals.push(interval);
          if (instance.beatIntervals.length > 8) instance.beatIntervals.shift();

          if (instance.beatIntervals.length >= 3) {
            const avgInterval =
              instance.beatIntervals.reduce((sum, v) => sum + v, 0) / instance.beatIntervals.length;
            let nextBpm = Math.round(60000 / avgInterval);
            if (nextBpm < 60) nextBpm *= 2;
            if (nextBpm > 180) nextBpm = Math.round(nextBpm / 2);
            instance.bpm = nextBpm;
          }
        }
      }
    }

    bpm = instance.bpm;
  }

  return { rms, peak, low, mid, high, centroidHz, bpm, beat };
}
