/**
 * Purpose: Scene chain nodes.
 */
import {
  FCT_TRACK_AUDIO_SOURCES,
  FCT_TRACK_PALETTES,
  FCT_TRACK_VARIANTS,
  type FctTrackAudioSource,
  type FctTrackBlend,
  type FctTrackPalette,
  type FctTrackVariant,
  type VisualSceneLayerItem,
} from '@shugu/protocol';

import type { NodeDefinition } from '../../types.js';
import { clampNumber, coerceNumber } from '../utils.js';
import { getRecordString } from './node-definition-utils.js';

const coerceSceneChain = (raw: unknown): VisualSceneLayerItem[] =>
  (Array.isArray(raw) ? raw : []).filter(
    (v): v is VisualSceneLayerItem =>
      Boolean(v) && getRecordString(v, 'type') !== null
  );

const fctVariantOptions = FCT_TRACK_VARIANTS.map((value) => ({
  value,
  label: value,
}));

const fctPaletteOptions = FCT_TRACK_PALETTES.map((value) => ({
  value,
  label: value,
}));

const coerceFctVariant = (value: unknown): FctTrackVariant =>
  typeof value === 'string' && FCT_TRACK_VARIANTS.includes(value as FctTrackVariant)
    ? (value as FctTrackVariant)
    : 'shattered-reality';

const coerceFctPalette = (value: unknown): FctTrackPalette =>
  typeof value === 'string' && FCT_TRACK_PALETTES.includes(value as FctTrackPalette)
    ? (value as FctTrackPalette)
    : 'red-black';

const coerceFctBlend = (value: unknown): FctTrackBlend =>
  value === 'over' ? 'over' : 'replace';

const coerceFctAudioSource = (value: unknown): FctTrackAudioSource =>
  typeof value === 'string' && FCT_TRACK_AUDIO_SOURCES.includes(value as FctTrackAudioSource)
    ? (value as FctTrackAudioSource)
    : 'microphone';

const coerceSceneShowBackground = (inputValue: unknown, configValue: unknown, fallback = 1): number => {
  const raw = inputValue !== undefined && inputValue !== null ? inputValue : configValue;
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return clampNumber(raw, 0, 1);
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'false' || normalized === 'off' || normalized === 'no') return 0;
    if (normalized === 'true' || normalized === 'on' || normalized === 'yes') return 1;
    const numeric = Number(normalized);
    if (Number.isFinite(numeric)) return clampNumber(numeric, 0, 1);
  }
  return fallback;
};

const coerceCssColor = (inputValue: unknown, configValue: unknown, fallback: string): string => {
  const raw = inputValue !== undefined && inputValue !== null ? inputValue : configValue;
  if (typeof raw !== 'string') return fallback;
  const value = raw.trim();
  if (!value) return fallback;
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)) return value;
  if (/^[a-zA-Z][a-zA-Z0-9-]*$/.test(value)) return value;
  if (/^rgba?\(/i.test(value) || /^hsla?\(/i.test(value)) return value;
  return fallback;
};

const coerceFctNumberParam = (
  inputValue: unknown,
  configValue: unknown,
  fallback: number,
  min: number,
  max: number
): number => {
  const raw = inputValue !== undefined && inputValue !== null ? inputValue : configValue;
  return clampNumber(coerceNumber(raw, fallback), min, max);
};

export function createSceneBoxNode(): NodeDefinition {
  return {
    type: 'scene-box',
    label: 'Scene Box',
    category: 'Scene',
    inputs: [
      { id: 'in', label: 'In', type: 'scene' },
      { id: 'color', label: 'Color', type: 'color' },
      { id: 'showBackground', label: 'Show Background', type: 'number', min: 0, max: 1, step: 0.01 },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'scene' }],
    configSchema: [
      { key: 'color', label: 'Color', type: 'color', defaultValue: '#4a90d9' },
      {
        key: 'audioSource',
        label: 'Audio Source',
        type: 'select',
        defaultValue: 'microphone',
        options: [
          { value: 'microphone', label: 'Microphone' },
          { value: 'playback', label: 'Playback' },
          { value: 'both', label: 'Microphone + Playback' },
        ],
      },
      { key: 'showBackground', label: 'Show Background', type: 'number', defaultValue: 0, min: 0, max: 1, step: 0.01 },
    ],
    process: (inputs, config) => {
      const chain = coerceSceneChain(inputs.in);
      const scene: VisualSceneLayerItem = {
        type: 'box',
        color: coerceCssColor(inputs.color, config.color, '#4a90d9'),
        showBackground: coerceSceneShowBackground(inputs.showBackground, config.showBackground, 0),
        audioSource: coerceFctAudioSource(config.audioSource),
      };
      return { out: [...chain, scene] };
    },
  };
}

export function createSceneMelNode(): NodeDefinition {
  return {
    type: 'scene-mel',
    label: 'Scene Mel Spectrogram',
    category: 'Scene',
    inputs: [
      { id: 'in', label: 'In', type: 'scene' },
      { id: 'showBackground', label: 'Show Background', type: 'number', min: 0, max: 1, step: 0.01 },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'scene' }],
    configSchema: [
      {
        key: 'audioSource',
        label: 'Audio Source',
        type: 'select',
        defaultValue: 'microphone',
        options: [
          { value: 'microphone', label: 'Microphone' },
          { value: 'playback', label: 'Playback' },
          { value: 'both', label: 'Microphone + Playback' },
        ],
      },
      { key: 'showBackground', label: 'Show Background', type: 'number', defaultValue: 0, min: 0, max: 1, step: 0.01 },
    ],
    process: (inputs, config) => {
      const chain = coerceSceneChain(inputs.in);
      const scene: VisualSceneLayerItem = {
        type: 'mel',
        showBackground: coerceSceneShowBackground(inputs.showBackground, config.showBackground, 0),
        audioSource: coerceFctAudioSource(config.audioSource),
      };
      return { out: [...chain, scene] };
    },
  };
}

export function createSceneFrontCameraNode(): NodeDefinition {
  return {
    type: 'scene-front-camera',
    label: 'Scene Front Camera',
    category: 'Scene',
    inputs: [{ id: 'in', label: 'In', type: 'scene' }],
    outputs: [{ id: 'out', label: 'Out', type: 'scene' }],
    configSchema: [],
    process: (inputs) => {
      const chain = coerceSceneChain(inputs.in);
      const scene: VisualSceneLayerItem = {
        type: 'frontCamera',
      };
      return { out: [...chain, scene] };
    },
  };
}

export function createSceneBackCameraNode(): NodeDefinition {
  return {
    type: 'scene-back-camera',
    label: 'Scene Back Camera',
    category: 'Scene',
    inputs: [{ id: 'in', label: 'In', type: 'scene' }],
    outputs: [{ id: 'out', label: 'Out', type: 'scene' }],
    configSchema: [],
    process: (inputs) => {
      const chain = coerceSceneChain(inputs.in);
      const scene: VisualSceneLayerItem = {
        type: 'backCamera',
      };
      return { out: [...chain, scene] };
    },
  };
}

export function createSceneFctTrackNode(): NodeDefinition {
  return {
    type: 'scene-fct-track',
    label: 'Scene FCT Track',
    category: 'Scene',
    metadata: {
      version: '1.0.0',
      platformTargets: ['client', 'display'],
      sideEffectClass: 'remote-control',
      permissions: [],
      compatibility: [
        {
          target: 'visualScenes',
          rule: 'Serializes only through the scene chain and scene-out visualScenes payload.',
        },
      ],
      examples: [
        {
          title: 'Red/black shattered reality',
          summary: 'Append the default FCT audio-reactive visual scene to the scene chain.',
          config: { variant: 'shattered-reality', palette: 'red-black' },
        },
      ],
      risks: [
        'This node renders a visual scene only; it is not an audio player or media transport.',
      ],
      description:
        'Audio-reactive FCT track visual Scene. It projects semantic scene configuration to Client and Display via scene-out, server routing, and protocol validation.',
      repairHints: [
        'Connect this node to scene-out; do not send visual commands directly from the node.',
      ],
    },
    inputs: [
      { id: 'in', label: 'In', type: 'scene' },
      { id: 'sensitivity', label: 'Sensitivity', type: 'number', min: 0, max: 2, step: 0.01 },
      { id: 'brightness', label: 'Brightness', type: 'number', min: 0, max: 2, step: 0.01 },
      { id: 'contrast', label: 'Contrast', type: 'number', min: 0, max: 2, step: 0.01 },
      { id: 'showBackground', label: 'Show Background', type: 'number', min: 0, max: 1, step: 0.01 },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'scene' }],
    configSchema: [
      {
        key: 'variant',
        label: 'Variant',
        type: 'select',
        defaultValue: 'shattered-reality',
        options: fctVariantOptions,
        connectable: true,
      },
      {
        key: 'palette',
        label: 'Palette',
        type: 'select',
        defaultValue: 'red-black',
        options: fctPaletteOptions,
        connectable: true,
      },
      { key: 'sensitivity', label: 'Sensitivity', type: 'number', defaultValue: 1, min: 0, max: 2, step: 0.01 },
      { key: 'brightness', label: 'Brightness', type: 'number', defaultValue: 1, min: 0, max: 2, step: 0.01 },
      { key: 'contrast', label: 'Contrast', type: 'number', defaultValue: 1, min: 0, max: 2, step: 0.01 },
      {
        key: 'blend',
        label: 'Blend',
        type: 'select',
        defaultValue: 'replace',
        connectable: true,
        options: [
          { value: 'replace', label: 'Replace' },
          { value: 'over', label: 'Over' },
        ],
      },
      {
        key: 'audioSource',
        label: 'Audio Source',
        type: 'select',
        defaultValue: 'microphone',
        connectable: true,
        options: [
          { value: 'microphone', label: 'Microphone' },
          { value: 'playback', label: 'Playback' },
          { value: 'both', label: 'Microphone + Playback' },
        ],
      },
      { key: 'showBackground', label: 'Show Background', type: 'number', defaultValue: 0, min: 0, max: 1, step: 0.01 },
    ],
    process: (inputs, config) => {
      const chain = coerceSceneChain(inputs.in);
      const scene: VisualSceneLayerItem = {
        type: 'fctTrack',
        variant: coerceFctVariant(inputs.variant ?? config.variant),
        palette: coerceFctPalette(inputs.palette ?? config.palette),
        sensitivity: coerceFctNumberParam(inputs.sensitivity, config.sensitivity, 1, 0, 2),
        brightness: coerceFctNumberParam(inputs.brightness, config.brightness, 1, 0, 2),
        contrast: coerceFctNumberParam(inputs.contrast, config.contrast, 1, 0, 2),
        blend: coerceFctBlend(inputs.blend ?? config.blend),
        audioSource: coerceFctAudioSource(inputs.audioSource ?? config.audioSource),
        showBackground: coerceSceneShowBackground(inputs.showBackground, config.showBackground, 0),
      };
      return { out: [...chain, scene] };
    },
  };
}
