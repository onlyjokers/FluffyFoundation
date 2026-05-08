// Purpose: verify FF-18 WP8 AI semantic command coverage for remaining AI Operator command API surfaces.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSemanticCommandBus } from '../../node-core/dist-node-core/semantic-command-bus.js';
import { runAiRemainingCommandSurfaceFixtures } from '../dist-ai-core/index.js';

const definitions = [
  {
    type: 'display-node',
    label: 'Display Node',
    category: 'Display',
    inputs: [],
    outputs: [],
    configSchema: [{ key: 'brightness', label: 'Brightness', type: 'number', defaultValue: 0.5, min: 0, max: 1 }],
  },
];

const graph = {
  nodes: [
    {
      id: 'display:1',
      type: 'display-node',
      position: { x: 20, y: 40 },
      config: { brightness: 0.5, archived: true, managerKey: 'shugu_secret_wp8' },
      inputValues: {},
      outputValues: {},
    },
  ],
  connections: [],
};

const createBus = (overrides = {}) =>
  createSemanticCommandBus({
    graph,
    definitions,
    revision: 200,
    runtimeStatus: { running: true, deployedPartitionIds: [] },
    deviceCapabilities: [{ deviceId: 'display:wp8', capabilities: ['display.render'], status: 'online' }],
    proposals: [
      {
        id: 'proposal:wp8-approve',
        title: 'Restore display node',
        status: 'proposed',
        commands: [{ type: 'node.restore', nodeId: 'display:1' }],
        localPath: '/Users/ziqi/Desktop/FluffyFoundation/secrets/wp8.json',
      },
    ],
    ...overrides,
  });

test('AI remaining command surface fixtures prove executable and deferred WP8 traces', () => {
  const traces = runAiRemainingCommandSurfaceFixtures({
    actor: { id: 'ai:wp8', role: 'ai' },
    directActor: { id: 'cli:wp8', role: 'service' },
    cases: [
      {
        id: 'node-restore',
        command: { type: 'node.restore', nodeId: 'display:1' },
        createBus: () => createBus({ revision: 210 }),
      },
      {
        id: 'proposal-approval',
        command: { type: 'proposal.approve', proposalId: 'proposal:wp8-approve', approvedBy: 'manager:wp8' },
        createBus: () => createBus({ revision: 220 }),
      },
      {
        id: 'rollback-revision',
        rollbackRevision: 231,
        setupCommands: [
          { type: 'node.params.update', nodeId: 'display:1', params: { brightness: 0.8 } },
        ],
        createBus: () => createBus({ revision: 231 }),
      },
      {
        id: 'runtime-override-set',
        runtimeOverride: { action: 'set', nodeId: 'display:1', portId: 'brightness', value: 0.9, ttlMs: 5000 },
        createBus: () => createBus({ revision: 240 }),
      },
      {
        id: 'runtime-override-clear',
        runtimeOverride: { action: 'clear', nodeId: 'display:1', portId: 'brightness' },
        createBus: () => createBus({ revision: 250 }),
      },
    ],
  });

  assert.deepEqual(traces.map((trace) => trace.caseId), [
    'node-restore',
    'proposal-approval',
    'rollback-revision',
    'runtime-override-set',
    'runtime-override-clear',
  ]);

  const restore = traces.find((trace) => trace.caseId === 'node-restore');
  assert.equal(restore.status, 'executable');
  assert.equal(restore.ai.status.apply, 'applied');
  assert.equal(restore.direct.result.ok, true);
  assert.equal(restore.parity.snapshotMatches, true);
  assert.equal(restore.ai.snapshot.nodes.find((node) => node.id === 'display:1')?.params.archived, false);
  assert.ok(restore.ai.audit.rollback.reference);

  const approval = traces.find((trace) => trace.caseId === 'proposal-approval');
  assert.equal(approval.status, 'executable');
  assert.equal(approval.ai.snapshot.proposals.find((proposal) => proposal.id === 'proposal:wp8-approve')?.status, 'accepted');
  assert.equal(approval.ai.snapshot.proposals.find((proposal) => proposal.id === 'proposal:wp8-approve')?.approvedBy, 'manager:wp8');
  assert.equal(approval.ai.observedResult.classification, 'success');

  const rollback = traces.find((trace) => trace.caseId === 'rollback-revision');
  assert.equal(rollback.status, 'executable');
  assert.equal(rollback.rollbackRevision.revision, 231);
  assert.equal(rollback.rollbackRevision.ai.ok, true);
  assert.equal(rollback.rollbackRevision.direct.ok, true);
  assert.equal(rollback.rollbackRevision.parity.snapshotMatches, true);
  assert.equal(rollback.rollbackRevision.audit.historyLengthAfterSetup, 1);
  assert.equal(rollback.rollbackRevision.observedResult.classification, 'rollback-needed');

  const overrideSet = traces.find((trace) => trace.caseId === 'runtime-override-set');
  assert.equal(overrideSet.status, 'executable');
  assert.equal(overrideSet.commandType, 'runtime.override.set');
  assert.equal(overrideSet.ai.status.apply, 'applied');
  assert.equal(overrideSet.direct.result.ok, true);
  assert.equal(overrideSet.parity.snapshotMatches, true);
  assert.equal(overrideSet.ai.snapshot.runtimeStatus.runtimeOverrides[0].value, 0.9);
  assert.equal(overrideSet.ai.observedResult.classification, 'success');

  const overrideClear = traces.find((trace) => trace.caseId === 'runtime-override-clear');
  assert.equal(overrideClear.status, 'executable');
  assert.equal(overrideClear.commandType, 'runtime.override.clear');
  assert.equal(overrideClear.ai.status.apply, 'applied');
  assert.equal(overrideClear.direct.result.ok, true);
  assert.equal(overrideClear.parity.snapshotMatches, true);
  assert.deepEqual(overrideClear.ai.snapshot.runtimeStatus.runtimeOverrides, []);
  assert.equal(overrideClear.ai.observedResult.classification, 'success');

  assert.equal(JSON.stringify(traces).includes('/Users/'), false);
  assert.equal(JSON.stringify(traces).includes('shugu_secret'), false);
});
