// Purpose: Regression coverage for asset fallback registration against stale node-core builds.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { NodeDefinition } from '@shugu/node-core';

import { nodeRegistry } from '../../registry';
import { registerFallbackAssetNodes } from './fallback-assets';

test('asset fallback patches stale GPT Image Gen and image loader ports', () => {
  const previousGpt = nodeRegistry.get('gpt-image-gen');
  const previousLoader = nodeRegistry.get('load-image-from-assets');

  nodeRegistry.register({
    type: 'gpt-image-gen',
    label: 'GPT Image Gen',
    category: 'AI',
    inputs: [],
    outputs: [
      { id: 'image', label: 'Image', type: 'image' },
      { id: 'assetId', label: 'Asset ID', type: 'string' },
    ],
    configSchema: [],
    process: () => ({ image: '', assetId: '' }),
  } satisfies NodeDefinition);
  nodeRegistry.register({
    type: 'load-image-from-assets',
    label: 'Load Image From Remote',
    category: 'Assets',
    inputs: [],
    outputs: [{ id: 'ref', label: 'Image Out', type: 'image', kind: 'sink' }],
    configSchema: [],
    process: () => ({ ref: '' }),
  } satisfies NodeDefinition);

  try {
    registerFallbackAssetNodes();

    assert.deepEqual(
      nodeRegistry.get('gpt-image-gen')?.outputs.find((port) => port.id === 'asset'),
      { id: 'asset', label: 'Asset', type: 'asset' }
    );
    assert.deepEqual(
      nodeRegistry.get('load-image-from-assets')?.inputs.find((port) => port.id === 'asset'),
      { id: 'asset', label: 'Asset', type: 'asset', defaultValue: '' }
    );
  } finally {
    if (previousGpt) nodeRegistry.register(previousGpt);
    else nodeRegistry.unregister('gpt-image-gen');
    if (previousLoader) nodeRegistry.register(previousLoader);
    else nodeRegistry.unregister('load-image-from-assets');
  }
});
