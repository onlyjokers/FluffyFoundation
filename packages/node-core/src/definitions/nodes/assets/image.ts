/**
 * Purpose: Image asset loader node definitions for remote and local media references.
 */
import type { NodeDefinition } from '../../../types.js';
import { normalizeLocalMediaRef } from '../../media-utils.js';
import { getRecordString } from '../node-definition-utils.js';

function normalizeAssetId(value: unknown): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return '';
  const assetPrefix = 'asset:';
  const withoutPrefix = trimmed.startsWith(assetPrefix)
    ? trimmed.slice(assetPrefix.length).trim()
    : trimmed;
  return withoutPrefix.split(/[?#]/)[0]?.trim() ?? '';
}

function normalizeAssetRef(value: unknown): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return '';
  return trimmed.startsWith('asset:') ? trimmed : `asset:${trimmed}`;
}

export function createLoadImageFromAssetsNode(): NodeDefinition {
  return {
    type: 'load-image-from-assets',
    label: 'Load Image From Remote',
    category: 'Assets',
    inputs: [{ id: 'asset', label: 'Asset', type: 'asset', defaultValue: '' }],
    outputs: [{ id: 'ref', label: 'Image Out', type: 'image', kind: 'sink' }],
    configSchema: [
      {
        key: 'assetId',
        label: 'Image Asset',
        type: 'asset-picker',
        assetKind: 'image',
        defaultValue: '',
      },
    ],
    process: (inputs, config) => {
      const inputAssetRef = normalizeAssetRef(inputs.asset);
      if (inputAssetRef) return { ref: inputAssetRef };
      const assetId = normalizeAssetId(config.assetId);
      return { ref: assetId ? `asset:${assetId}` : '' };
    },
  };
}

export function createLoadImageFromLocalNode(): NodeDefinition {
  return {
    type: 'load-image-from-local',
    label: 'Load Image From Local(Display)',
    category: 'Assets',
    inputs: [{ id: 'asset', label: 'Asset', type: 'string', defaultValue: '' }],
    outputs: [{ id: 'ref', label: 'Image Out', type: 'image', kind: 'sink' }],
    configSchema: [
      {
        key: 'assetPath',
        label: 'Image Asset',
        type: 'local-asset-picker',
        assetKind: 'image',
        defaultValue: '',
      },
    ],
    process: (inputs, config) => {
      const baseUrl =
        typeof inputs.asset === 'string' && inputs.asset.trim()
          ? inputs.asset.trim()
          : (getRecordString(config, 'assetPath') ?? '');
      return { ref: baseUrl ? normalizeLocalMediaRef(baseUrl, 'image') : '' };
    },
  };
}
