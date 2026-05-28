// Purpose: FF-10 registry tests for auto-discovery and AI-readable node summaries.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NodeRegistry,
  createSemanticGraphSnapshot,
  registerDefaultNodeDefinitions,
} from '../dist-node-core/index.js';

const fixtureFactory = () => ({
  type: 'fixture-auto-node',
  label: 'Fixture Auto Node',
  category: 'Logic',
  metadata: {
    version: '2.0.0',
    platformTargets: ['manager', 'client'],
    sideEffectClass: 'none',
    permissions: [],
    compatibility: [{ target: 'number', rule: 'output.value can connect to number inputs', repairHint: 'Use a converter if the target expects another type.' }],
    examples: [{ title: 'Emit a value', summary: 'Outputs the configured value for downstream math.', config: { value: 7 } }],
    risks: ['Fixture only; no runtime side effects.'],
    description: 'Test fixture that proves new node factories are loaded without editing a central switch.',
    repairHints: ['Check the factory export list if this node is missing.'],
  },
  inputs: [{ id: 'in', label: 'In', type: 'number', defaultValue: 0, min: 0, max: 10, step: 1 }],
  outputs: [{ id: 'value', label: 'Value', type: 'number' }],
  configSchema: [{ key: 'value', label: 'Value', type: 'number', defaultValue: 7, min: 0, max: 10, step: 1, unit: 'count' }],
  process: (inputs, config) => ({ value: typeof inputs.in === 'number' ? inputs.in : config.value ?? 7 }),
});

test('registerNodeDefinitionFactories registers a new fixture node without a global switch edit', () => {
  const registry = new NodeRegistry();

  registry.registerFactories([fixtureFactory]);

  const definition = registry.get('fixture-auto-node');
  assert.ok(definition);
  assert.equal(definition.metadata.version, '2.0.0');
  assert.equal(definition.metadata.sideEffectClass, 'none');
  assert.deepEqual(definition.metadata.platformTargets, ['manager', 'client']);
});

test('AI context snapshot includes an auto-registered fixture node summary', () => {
  const registry = new NodeRegistry();
  registry.registerFactories([fixtureFactory]);

  const snapshot = createSemanticGraphSnapshot({
    graph: { nodes: [], connections: [] },
    definitions: registry.list(),
    revision: 10,
  });

  const fixture = snapshot.definitions.find((definition) => definition.type === 'fixture-auto-node');
  assert.ok(fixture);
  assert.equal(fixture.aiSummary.version, '2.0.0');
  assert.equal(fixture.aiSummary.description, 'Test fixture that proves new node factories are loaded without editing a central switch.');
  assert.equal(fixture.aiSummary.permissions.length, 0);
  assert.equal(fixture.aiSummary.params[0].unit, 'count');
  assert.match(JSON.stringify(fixture.aiSummary), /repair/i);

  const direct = registry.listAgentSummaries().find((summary) => summary.type === 'fixture-auto-node');
  assert.ok(direct);
  assert.equal('sideEffects' in direct, false);
  assert.equal('risks' in direct, false);
  assert.deepEqual(direct.ports.inputs[0], {
    id: 'in',
    type: 'number',
    default: 0,
    min: 0,
    max: 10,
    step: 1,
  });
});

test('connectable config fields become semantic input ports with option metadata', () => {
  const registry = new NodeRegistry();
  registry.register({
    type: 'fixture-connectable-node',
    label: 'Fixture Connectable Node',
    category: 'Logic',
    inputs: [{ id: 'in', label: 'In', type: 'number' }],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [
      {
        key: 'mode',
        label: 'Mode',
        type: 'select',
        defaultValue: 'alpha',
        connectable: true,
        options: [
          { value: 'alpha', label: 'Alpha' },
          { value: 'beta', label: 'Beta' },
        ],
      },
      { key: 'assetId', label: 'Asset', type: 'asset-picker', defaultValue: '' },
    ],
    process: () => ({}),
  });

  const definition = registry.get('fixture-connectable-node');
  assert.ok(definition);
  assert.deepEqual(
    definition.inputs.map((input) => input.id),
    ['in', 'mode']
  );
  assert.deepEqual(definition.inputs.find((input) => input.id === 'mode')?.options, [
    { value: 'alpha', label: 'Alpha' },
    { value: 'beta', label: 'Beta' },
  ]);

  const snapshot = createSemanticGraphSnapshot({
    graph: { nodes: [], connections: [] },
    definitions: registry.list(),
    revision: 1,
  });
  const summary = snapshot.definitions.find((item) => item.type === 'fixture-connectable-node')?.aiSummary;
  assert.deepEqual(summary?.ports.inputs.find((input) => input.id === 'mode')?.options, [
    { value: 'alpha', label: 'Alpha' },
    { value: 'beta', label: 'Beta' },
  ]);
  assert.equal(summary?.ports.inputs.some((input) => input.id === 'assetId'), false);
});

test('default node registry includes AI Note as an agent manual node', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry);

  const definition = registry.get('ai-note');
  assert.ok(definition);
  assert.equal(definition.label, 'AI Note');
  assert.deepEqual(
    definition.configSchema.find((field) => field.key === 'kind')?.options?.map((option) => option.value),
    ['description', 'compatibility', 'examples', 'repairHints']
  );

  const summary = registry.listAgentSummaries().find((item) => item.type === 'ai-note');
  assert.ok(summary);
  assert.match(summary.description, /custom node AI manual/i);
});

test('AI Note summary still uses the same agent summary shape as ordinary nodes', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry);

  const aiNote = registry.listAgentSummaries().find((item) => item.type === 'ai-note');
  const note = registry.listAgentSummaries().find((item) => item.type === 'note');
  assert.ok(aiNote);
  assert.ok(note);
  assert.deepEqual(Object.keys(aiNote).sort(), Object.keys(note).sort());
});

test('connectable config metadata augments existing same-key input ports', () => {
  const registry = new NodeRegistry();
  registry.register({
    type: 'fixture-connectable-existing-input-node',
    label: 'Fixture Existing Input Node',
    category: 'Logic',
    inputs: [{ id: 'mode', label: 'Mode', type: 'string' }],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [
      {
        key: 'mode',
        label: 'Mode',
        type: 'select',
        defaultValue: 'alpha',
        connectable: true,
        options: [
          { value: 'alpha', label: 'Alpha' },
          { value: 'beta', label: 'Beta' },
        ],
      },
    ],
    process: () => ({}),
  });

  const definition = registry.get('fixture-connectable-existing-input-node');
  assert.ok(definition);
  assert.deepEqual(
    definition.inputs.map((input) => input.id),
    ['mode']
  );
  assert.deepEqual(definition.inputs[0].options, [
    { value: 'alpha', label: 'Alpha' },
    { value: 'beta', label: 'Beta' },
  ]);
});
