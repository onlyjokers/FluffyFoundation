/**
 * Purpose: Shared browser audio analysis pipeline for visual scene audio reactivity.
 */

import { AudioSplitPlugin } from './audio-split.js';
import { MelSpectrogramPlugin } from './mel-spectrogram.js';
import type { AudioSplitFeature, MelSpectrogramFeature } from './types.js';

export type VisualAudioFeatures = {
  rms?: number;
  lowEnergy?: number;
  midEnergy?: number;
  highEnergy?: number;
  bpm?: number | null;
  beatDetected?: boolean;
  melBands?: number[];
  spectralCentroid?: number;
};

export type AudioAnalysisPipeline = {
  destroy: () => void;
};

export async function createAudioAnalysisPipeline(options: {
  audioContext: AudioContext;
  source: AudioNode;
  onFeatures: (features: Partial<VisualAudioFeatures>, splitFeature?: AudioSplitFeature) => void;
}): Promise<AudioAnalysisPipeline> {
  const splitPlugin = new AudioSplitPlugin();
  const melPlugin = new MelSpectrogramPlugin({ melBands: 64, frameRate: 30 });

  await Promise.all([
    splitPlugin.init(options.audioContext, options.source),
    melPlugin.init(options.audioContext, options.source, { melBands: 64, frameRate: 30 }),
  ]);

  splitPlugin.onFeature((feature: AudioSplitFeature) => {
    options.onFeatures(
      {
        rms: feature.rms,
        lowEnergy: feature.lowEnergy,
        midEnergy: feature.midEnergy,
        highEnergy: feature.highEnergy,
        bpm: feature.bpm,
        beatDetected: feature.beatDetected,
      },
      feature
    );
  });

  melPlugin.onFeature((feature: MelSpectrogramFeature) => {
    options.onFeatures({
      melBands: feature.melBands,
      rms: feature.rms,
      spectralCentroid: feature.spectralCentroid,
    });
  });

  splitPlugin.start();
  melPlugin.start();

  return {
    destroy: () => {
      splitPlugin.destroy();
      melPlugin.destroy();
    },
  };
}
