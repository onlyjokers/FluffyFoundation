// Purpose: verify FF-18 WP5 AI semantic execution parity with the real node-core command bus.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSemanticCommandBus } from '../../node-core/dist-node-core/semantic-command-bus.js';
import { runAiSemanticCommandBusParityFixture } from '../dist-ai-core/index.js';

const definitions = [
  {
    type: 'number-source',
    label: 'Number Source',
    category: 'Values',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [{ key: 'value', label: 'Value', type: 'number', defaultValue: 1, min: 0, max: 10 }],
  },
  {
    type: 'number-sink',
    label: 'Number Sink',
    category: 'Values',
    inputs: [{ id: 'in', label: 'In', type: 'number' }],
    outputs: [],
    configSchema: [{ key: 'gain', label: 'Gain', type: 'number', defaultValue: 1, min: 0, max: 4 }],
  },
];

const baseGraph = (connections = []) => ({
  nodes: [
    {
      id: 'source:1',
      type: 'number-source',
      position: { x: 10, y: 20 },
      config: { value: 2, managerKey: 'shugu_secret_parity' },
      inputValues: {},
      outputValues: { out: 2 },
    },
    {
      id: 'sink:1',
      type: 'number-sink',
      position: { x: 200, y: 20 },
      config: { gain: 1 },
      inputValues: {},
      outputValues: {},
    },
  ],
  connections,
});

const createBus = (graph = baseGraph(), revision = 80) =>
  createSemanticCommandBus({
    graph,
    definitions,
    revision,
    runtimeStatus: { running: true, deployedPartitionIds: ['partition:parity'] },
    deviceCapabilities: [{ deviceId: 'manager:parity', capabilities: ['semantic.command'], status: 'online' }],
    permissions: [{ actorId: 'ai:wp5', operations: ['node.add', 'node.archive', 'node.params.update', 'node.connect', 'node.disconnect'] }],
    proposals: [
      {
        id: 'proposal:redacted',
        title: 'Old local proposal',
        commands: [],
        localPath: '/Users/ziqi/Desktop/FluffyFoundation/secrets/parity.json',
      },
    ],
  });

test('AI semantic runtime adapter preserves parity with direct command-bus callers', () => {
  const traces = runAiSemanticCommandBusParityFixture({
    actor: { id: 'ai:wp5', role: 'ai' },
    directActor: { id: 'cli:wp5', role: 'service' },
    cases: [
      {
        id: 'add',
        command: {
          type: 'node.add',
          node: {
            id: 'source:added',
            type: 'number-source',
            position: { x: 0, y: 0 },
            config: { value: 4 },
            inputValues: {},
            outputValues: {},
          },
        },
        createBus: () => createBus(baseGraph(), 80),
      },
      {
        id: 'archive',
        command: { type: 'node.archive', nodeId: 'sink:1' },
        createBus: () => createBus(baseGraph(), 90),
      },
      {
        id: 'params',
        command: { type: 'node.params.update', nodeId: 'source:1', params: { value: 7 } },
        createBus: () => createBus(baseGraph(), 100),
      },
      {
        id: 'connect',
        command: {
          type: 'node.connect',
          connection: {
            id: 'conn:1',
            sourceNodeId: 'source:1',
            sourcePortId: 'out',
            targetNodeId: 'sink:1',
            targetPortId: 'in',
          },
        },
        createBus: () => createBus(baseGraph(), 110),
      },
      {
        id: 'disconnect',
        command: { type: 'node.disconnect', connectionId: 'conn:existing' },
        createBus: () =>
          createBus(
            baseGraph([
              {
                id: 'conn:existing',
                sourceNodeId: 'source:1',
                sourcePortId: 'out',
                targetNodeId: 'sink:1',
                targetPortId: 'in',
              },
            ]),
            120
          ),
      },
    ],
  });

  assert.deepEqual(traces.map((trace) => trace.caseId), ['add', 'archive', 'params', 'connect', 'disconnect']);
  for (const trace of traces) {
    assert.equal(trace.ai.status.apply, 'applied');
    assert.equal(trace.ai.status.dryRun, 'dry-run-passed');
    assert.equal(trace.direct.result.ok, true);
    assert.equal(trace.parity.appliedRevisionMatches, true);
    assert.equal(trace.parity.snapshotMatches, true);
    assert.equal(trace.ai.audit.rollback.reference?.startsWith(`ai-rollback:proposal:wp5:${trace.caseId}:`), true);
    assert.equal(trace.ai.audit.historyEntry?.status, 'applied');
    assert.equal(trace.ai.observedResult.classification, 'success');
    assert.equal(trace.ai.redactionSummary.count > 0, true);
    assert.equal(JSON.stringify(trace).includes('/Users/'), false);
    assert.equal(JSON.stringify(trace).includes('shugu_secret_parity'), false);
  }

  const archived = traces.find((trace) => trace.caseId === 'archive');
  assert.equal(
    archived.ai.snapshot.nodes.find((node) => node.id === 'sink:1')?.params.archived,
    true
  );

  const disconnected = traces.find((trace) => trace.caseId === 'disconnect');
  assert.equal(disconnected.ai.snapshot.connections.length, 0);
});
