/**
 * Purpose: Effect chain nodes.
 */
import type { ConvolutionPreset, VisualEffect } from '@shugu/protocol';

import type { NodeDefinition } from '../../types.js';
import { getBooleanValue, getNumberValue, getStringValue } from './node-definition-utils.js';

const isVisualEffect = (value: unknown): value is VisualEffect => {
  if (!value || typeof value !== 'object') return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string';
};

const coerceEffectChain = (raw: unknown): VisualEffect[] =>
  (Array.isArray(raw) ? raw : []).filter(isVisualEffect);

export function createEffectAsciiNode(): NodeDefinition {
  return {
    type: 'effect-ascii',
    label: 'Effect ASCII',
    category: 'Effect',
    inputs: [
      { id: 'in', label: 'In', type: 'effect' },
      {
        id: 'resolution',
        label: 'Resolution',
        type: 'number',
        defaultValue: 11,
        min: 1,
        max: 100,
        step: 1,
      },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'effect' }],
    configSchema: [
      {
        key: 'resolution',
        label: 'Resolution',
        type: 'number',
        defaultValue: 11,
        min: 1,
        max: 100,
        step: 1,
      },
    ],
    process: (inputs, config) => {
      const chain = coerceEffectChain(inputs.in);
      const resolution = (() => {
        const fromInput = inputs.resolution;
        const fromConfig = getNumberValue(config.resolution);
        const raw =
          typeof fromInput === 'number' ? fromInput : Number(fromInput ?? fromConfig ?? 11);
        const clamped = Number.isFinite(raw) ? Math.max(1, Math.min(100, raw)) : 11;
        return Math.round(clamped);
      })();

      const effect: VisualEffect = { type: 'ascii', cellSize: resolution };
      return { out: [...chain, effect] };
    },
  };
}

export function createEffectConvolutionNode(): NodeDefinition {
  return {
    type: 'effect-convolution',
    label: 'Effect Convolution',
    category: 'Effect',
    inputs: [
      { id: 'in', label: 'In', type: 'effect' },
      { id: 'preset', label: 'Preset', type: 'string' },
      { id: 'mix', label: 'Mix', type: 'number', defaultValue: 1, min: 0, max: 1, step: 0.01 },
      {
        id: 'scale',
        label: 'Scale',
        type: 'number',
        defaultValue: 0.5,
        min: 0.1,
        max: 1,
        step: 0.05,
      },
      { id: 'bias', label: 'Bias', type: 'number', defaultValue: 0, min: -1, max: 1, step: 0.01 },
      { id: 'normalize', label: 'Normalize', type: 'boolean', defaultValue: true },
      { id: 'kernel', label: 'Kernel (3x3)', type: 'string' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'effect' }],
    configSchema: [
      {
        key: 'preset',
        label: 'Preset',
        type: 'select',
        defaultValue: 'sharpen',
        options: [
          { value: 'blur', label: 'Blur' },
          { value: 'gaussianBlur', label: 'Gaussian Blur' },
          { value: 'sharpen', label: 'Sharpen' },
          { value: 'edge', label: 'Edge Detect' },
          { value: 'emboss', label: 'Emboss' },
          { value: 'sobelX', label: 'Sobel X' },
          { value: 'sobelY', label: 'Sobel Y' },
          { value: 'custom', label: 'Custom Kernel' },
        ],
      },
      { key: 'mix', label: 'Mix', type: 'number', defaultValue: 1, min: 0, max: 1, step: 0.01 },
      {
        key: 'scale',
        label: 'Scale',
        type: 'number',
        defaultValue: 0.5,
        min: 0.1,
        max: 1,
        step: 0.05,
      },
      { key: 'bias', label: 'Bias', type: 'number', defaultValue: 0, min: -1, max: 1, step: 0.01 },
      { key: 'normalize', label: 'Normalize', type: 'boolean', defaultValue: true },
      { key: 'kernel', label: 'Kernel (3x3)', type: 'string', defaultValue: '' },
    ],
    process: (inputs, config) => {
      const chain = coerceEffectChain(inputs.in);

      const preset = (() => {
        const allowed: readonly ConvolutionPreset[] = [
          'blur',
          'gaussianBlur',
          'sharpen',
          'edge',
          'emboss',
          'sobelX',
          'sobelY',
          'custom',
        ] as const;

        const fromInput = inputs.preset;
        const fromConfig = getStringValue(config.preset);
        const raw =
          typeof fromInput === 'string' && fromInput.trim()
            ? fromInput.trim()
            : typeof fromConfig === 'string' && fromConfig.trim()
              ? fromConfig.trim()
              : 'sharpen';

        return allowed.includes(raw as ConvolutionPreset) ? (raw as ConvolutionPreset) : 'sharpen';
      })();

      const mix = (() => {
        const fromInput = inputs.mix;
        const fromConfig = getNumberValue(config.mix);
        const raw =
          typeof fromInput === 'number' ? fromInput : Number(fromInput ?? fromConfig ?? 1);
        if (!Number.isFinite(raw)) return 1;
        return Math.max(0, Math.min(1, raw));
      })();

      const scale = (() => {
        const fromInput = inputs.scale;
        const fromConfig = getNumberValue(config.scale);
        const raw =
          typeof fromInput === 'number' ? fromInput : Number(fromInput ?? fromConfig ?? 0.5);
        if (!Number.isFinite(raw)) return 0.5;
        return Math.max(0.1, Math.min(1, raw));
      })();

      const bias = (() => {
        const fromInput = inputs.bias;
        const fromConfig = getNumberValue(config.bias);
        const raw =
          typeof fromInput === 'number' ? fromInput : Number(fromInput ?? fromConfig ?? 0);
        if (!Number.isFinite(raw)) return 0;
        return Math.max(-1, Math.min(1, raw));
      })();

      const normalize = (() => {
        const fromInput = inputs.normalize;
        if (typeof fromInput === 'number' && Number.isFinite(fromInput)) return fromInput >= 0.5;
        if (typeof fromInput === 'boolean') return fromInput;
        const fromConfig = getBooleanValue(config.normalize);
        if (typeof fromConfig === 'number' && Number.isFinite(fromConfig)) return fromConfig >= 0.5;
        if (typeof fromConfig === 'boolean') return fromConfig;
        return true;
      })();

      const kernel = (() => {
        if (preset !== 'custom') return undefined;
        const fromInput = inputs.kernel;
        const fromConfig = getStringValue(config.kernel);
        const raw =
          typeof fromInput === 'string' && fromInput.trim()
            ? fromInput.trim()
            : typeof fromConfig === 'string' && fromConfig.trim()
              ? fromConfig.trim()
              : '';
        if (!raw) return undefined;

        const parts = raw
          .split(/[\s,]+/g)
          .map((p) => p.trim())
          .filter(Boolean)
          .slice(0, 9);
        if (parts.length !== 9) return undefined;
        const parsed = parts.map((p) => Number(p));
        if (parsed.some((n) => !Number.isFinite(n))) return undefined;
        return parsed;
      })();

      const effect: VisualEffect = {
        type: 'convolution',
        preset,
        ...(kernel ? { kernel } : {}),
        mix,
        bias,
        normalize,
        scale,
      };

      return { out: [...chain, effect] };
    },
  };
}
