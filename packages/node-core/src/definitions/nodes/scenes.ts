/**
 * Purpose: Scene chain nodes.
 */
import type { VisualSceneLayerItem } from '@shugu/protocol';

import type { NodeDefinition } from '../../types.js';
import { getRecordString } from './node-definition-utils.js';

export function createSceneBoxNode(): NodeDefinition {
  const coerceSceneChain = (raw: unknown): VisualSceneLayerItem[] =>
    (Array.isArray(raw) ? raw : []).filter(
      (v): v is VisualSceneLayerItem =>
        Boolean(v) && getRecordString(v, 'type') !== null
    );

  return {
    type: 'scene-box',
    label: 'Scene Box',
    category: 'Scene',
    inputs: [{ id: 'in', label: 'In', type: 'scene' }],
    outputs: [{ id: 'out', label: 'Out', type: 'scene' }],
    configSchema: [],
    process: (inputs) => {
      const chain = coerceSceneChain(inputs.in);
      const scene: VisualSceneLayerItem = { type: 'box' };
      return { out: [...chain, scene] };
    },
  };
}

export function createSceneMelNode(): NodeDefinition {
  const coerceSceneChain = (raw: unknown): VisualSceneLayerItem[] =>
    (Array.isArray(raw) ? raw : []).filter(
      (v): v is VisualSceneLayerItem =>
        Boolean(v) && getRecordString(v, 'type') !== null
    );

  return {
    type: 'scene-mel',
    label: 'Scene Mel Spectrogram',
    category: 'Scene',
    inputs: [{ id: 'in', label: 'In', type: 'scene' }],
    outputs: [{ id: 'out', label: 'Out', type: 'scene' }],
    configSchema: [],
    process: (inputs) => {
      const chain = coerceSceneChain(inputs.in);
      const scene: VisualSceneLayerItem = { type: 'mel' };
      return { out: [...chain, scene] };
    },
  };
}

export function createSceneFrontCameraNode(): NodeDefinition {
  const coerceSceneChain = (raw: unknown): VisualSceneLayerItem[] =>
    (Array.isArray(raw) ? raw : []).filter(
      (v): v is VisualSceneLayerItem =>
        Boolean(v) && getRecordString(v, 'type') !== null
    );

  return {
    type: 'scene-front-camera',
    label: 'Scene Front Camera',
    category: 'Scene',
    inputs: [{ id: 'in', label: 'In', type: 'scene' }],
    outputs: [{ id: 'out', label: 'Out', type: 'scene' }],
    configSchema: [],
    process: (inputs) => {
      const chain = coerceSceneChain(inputs.in);
      const scene: VisualSceneLayerItem = { type: 'frontCamera' };
      return { out: [...chain, scene] };
    },
  };
}

export function createSceneBackCameraNode(): NodeDefinition {
  const coerceSceneChain = (raw: unknown): VisualSceneLayerItem[] =>
    (Array.isArray(raw) ? raw : []).filter(
      (v): v is VisualSceneLayerItem =>
        Boolean(v) && getRecordString(v, 'type') !== null
    );

  return {
    type: 'scene-back-camera',
    label: 'Scene Back Camera',
    category: 'Scene',
    inputs: [{ id: 'in', label: 'In', type: 'scene' }],
    outputs: [{ id: 'out', label: 'Out', type: 'scene' }],
    configSchema: [],
    process: (inputs) => {
      const chain = coerceSceneChain(inputs.in);
      const scene: VisualSceneLayerItem = { type: 'backCamera' };
      return { out: [...chain, scene] };
    },
  };
}
