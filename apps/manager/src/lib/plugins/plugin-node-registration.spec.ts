// Purpose: verify plugin-provided nodes enter the Manager only through the semantic node registry.
import assert from 'node:assert/strict';
import test from 'node:test';

import { NodeRegistry, createSemanticGraphSnapshot } from '@shugu/node-core';

import { registerPluginNodeDefinitions } from './plugin-node-registration';

test('plugin node definitions register only through the semantic node registry', () => {
  const registry = new NodeRegistry();

  const result = registerPluginNodeDefinitions(registry, {
    pluginId: 'test-plugin',
    definitions: [
      {
        type: 'plugin:test-plugin:meter',
        label: 'Plugin Meter',
        category: 'Plugin',
        inputs: [{ id: 'in', label: 'In', type: 'number', defaultValue: 0, min: 0, max: 1 }],
        outputs: [{ id: 'out', label: 'Out', type: 'number' }],
        configSchema: [{ key: 'gain', label: 'Gain', type: 'number', defaultValue: 1, min: 0, max: 2 }],
        process: (inputs) => ({ out: inputs.in ?? 0 }),
      },
    ],
  });

  assert.deepEqual(result, { registered: ['plugin:test-plugin:meter'], rejected: [] });
  assert.equal(registry.get('plugin:test-plugin:meter')?.metadata?.description, 'Registered by plugin test-plugin.');

  const snapshot = createSemanticGraphSnapshot({
    graph: { nodes: [], connections: [] },
    definitions: registry.list(),
  });
  const pluginDefinition = snapshot.definitions.find((definition) => definition.type === 'plugin:test-plugin:meter');
  assert.equal(pluginDefinition?.params[0]?.key, 'gain');
  assert.equal(pluginDefinition?.params[0]?.max, 2);
});

test('plugin node definitions reject unsafe type prefixes and duplicate core types', () => {
  const registry = new NodeRegistry();
  registry.register({
    type: 'number',
    label: 'Number',
    category: 'Values',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [],
    process: () => ({ out: 0 }),
  });

  const result = registerPluginNodeDefinitions(registry, {
    pluginId: 'test-plugin',
    definitions: [
      {
        type: 'number',
        label: 'Hijacked Number',
        category: 'Plugin',
        inputs: [],
        outputs: [],
        configSchema: [],
        process: () => ({}),
      },
      {
        type: 'plugin:other-plugin:foreign',
        label: 'Foreign Plugin Node',
        category: 'Plugin',
        inputs: [],
        outputs: [],
        configSchema: [],
        process: () => ({}),
      },
    ],
  });

  assert.equal(result.registered.length, 0);
  assert.deepEqual(result.rejected.map((item) => item.reason), [
    'Plugin node type must start with plugin:test-plugin:.',
    'Plugin node type must start with plugin:test-plugin:.',
  ]);
  assert.equal(registry.get('number')?.label, 'Number');
});
