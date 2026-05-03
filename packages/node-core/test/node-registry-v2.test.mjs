// Purpose: FF-10 registry tests for auto-discovery and AI-readable node summaries.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NodeRegistry,
  createSemanticGraphSnapshot,
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
  assert.equal(direct.sideEffects, 'none');
  assert.deepEqual(direct.ports.inputs[0], {
    id: 'in',
    type: 'number',
    default: 0,
    min: 0,
    max: 10,
    step: 1,
  });
});
