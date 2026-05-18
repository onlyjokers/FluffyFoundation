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

const coerceSceneShowBackground = (inputValue: unknown, configValue: unknown, fallback = true): boolean => {
  const raw = inputValue !== undefined && inputValue !== null ? inputValue : configValue;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw >= 0.5;
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'false' || normalized === '0' || normalized === 'off' || normalized === 'no') return false;
    if (normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes') return true;
  }
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
      { id: 'showBackground', label: 'Show Background', type: 'boolean', defaultValue: true },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'scene' }],
    configSchema: [
      { key: 'showBackground', label: 'Show Background', type: 'boolean', defaultValue: true },
    ],
    process: (inputs, config) => {
      const chain = coerceSceneChain(inputs.in);
      const scene: VisualSceneLayerItem = {
        type: 'box',
        showBackground: coerceSceneShowBackground(inputs.showBackground, config.showBackground, true),
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
      { id: 'showBackground', label: 'Show Background', type: 'boolean', defaultValue: false },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'scene' }],
    configSchema: [
      { key: 'showBackground', label: 'Show Background', type: 'boolean', defaultValue: false },
    ],
    process: (inputs, config) => {
      const chain = coerceSceneChain(inputs.in);
      const scene: VisualSceneLayerItem = {
        type: 'mel',
        showBackground: coerceSceneShowBackground(inputs.showBackground, config.showBackground, false),
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
    inputs: [
      { id: 'in', label: 'In', type: 'scene' },
      { id: 'showBackground', label: 'Show Background', type: 'boolean', defaultValue: false },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'scene' }],
    configSchema: [
      { key: 'showBackground', label: 'Show Background', type: 'boolean', defaultValue: false },
    ],
    process: (inputs, config) => {
      const chain = coerceSceneChain(inputs.in);
      const scene: VisualSceneLayerItem = {
        type: 'frontCamera',
        showBackground: coerceSceneShowBackground(inputs.showBackground, config.showBackground, false),
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
    inputs: [
      { id: 'in', label: 'In', type: 'scene' },
      { id: 'showBackground', label: 'Show Background', type: 'boolean', defaultValue: false },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'scene' }],
    configSchema: [
      { key: 'showBackground', label: 'Show Background', type: 'boolean', defaultValue: false },
    ],
    process: (inputs, config) => {
      const chain = coerceSceneChain(inputs.in);
      const scene: VisualSceneLayerItem = {
        type: 'backCamera',
        showBackground: coerceSceneShowBackground(inputs.showBackground, config.showBackground, false),
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
      { id: 'showBackground', label: 'Show Background', type: 'boolean', defaultValue: true },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'scene' }],
    configSchema: [
      {
        key: 'variant',
        label: 'Variant',
        type: 'select',
        defaultValue: 'shattered-reality',
        options: fctVariantOptions,
      },
      {
        key: 'palette',
        label: 'Palette',
        type: 'select',
        defaultValue: 'red-black',
        options: fctPaletteOptions,
      },
      { key: 'sensitivity', label: 'Sensitivity', type: 'number', defaultValue: 1, min: 0, max: 2, step: 0.01 },
      { key: 'brightness', label: 'Brightness', type: 'number', defaultValue: 1, min: 0, max: 2, step: 0.01 },
      { key: 'contrast', label: 'Contrast', type: 'number', defaultValue: 1, min: 0, max: 2, step: 0.01 },
      {
        key: 'blend',
        label: 'Blend',
        type: 'select',
        defaultValue: 'replace',
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
        options: [
          { value: 'microphone', label: 'Microphone' },
          { value: 'playback', label: 'Playback' },
          { value: 'both', label: 'Microphone + Playback' },
        ],
      },
      { key: 'showBackground', label: 'Show Background', type: 'boolean', defaultValue: true },
    ],
    process: (inputs, config) => {
      const chain = coerceSceneChain(inputs.in);
      const scene: VisualSceneLayerItem = {
        type: 'fctTrack',
        variant: coerceFctVariant(config.variant),
        palette: coerceFctPalette(config.palette),
        sensitivity: coerceFctNumberParam(inputs.sensitivity, config.sensitivity, 1, 0, 2),
        brightness: coerceFctNumberParam(inputs.brightness, config.brightness, 1, 0, 2),
        contrast: coerceFctNumberParam(inputs.contrast, config.contrast, 1, 0, 2),
        blend: coerceFctBlend(config.blend),
        audioSource: coerceFctAudioSource(config.audioSource),
        showBackground: coerceSceneShowBackground(inputs.showBackground, config.showBackground, true),
      };
      return { out: [...chain, scene] };
    },
  };
}
