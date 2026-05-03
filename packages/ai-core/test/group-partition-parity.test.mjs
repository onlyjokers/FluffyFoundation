// Purpose: verify FF-18 WP7 AI semantic runtime parity for Group internals and execution partitions.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSemanticCommandBus } from '../../node-core/dist-node-core/semantic-command-bus.js';
import { runAiGroupPartitionParityFixtures } from '../dist-ai-core/index.js';

const definitions = [
  {
    type: 'display-node',
    label: 'Display Node',
    category: 'Display',
    inputs: [],
    outputs: [],
    configSchema: [{ key: 'intensity', label: 'Intensity', type: 'number', defaultValue: 0.5, min: 0, max: 1 }],
  },
];

const graph = {
  nodes: [
    {
      id: 'display:1',
      type: 'display-node',
      position: { x: 20, y: 30 },
      config: { intensity: 0.4, managerKey: 'shugu_secret_wp7' },
      inputValues: {},
      outputValues: {},
    },
    {
      id: 'display:2',
      type: 'display-node',
      position: { x: 160, y: 30 },
      config: { intensity: 0.6 },
      inputValues: {},
      outputValues: {},
    },
  ],
  connections: [],
};

const baseGroup = {
  id: 'group:display',
  parentId: null,
  name: 'Display Group',
  nodeIds: ['display:1'],
  disabled: false,
  surface: 'public',
  visibility: { defaultAccess: 'visible-readonly' },
};

const createBus = (overrides = {}) =>
  createSemanticCommandBus({
    graph,
    definitions,
    groups: [baseGroup],
    partitions: [{ id: 'partition:display', nodeIds: ['display:1'], targetPlatform: 'display', status: 'deployed', boundRevision: 60 }],
    revision: 60,
    runtimeStatus: { running: true, deployedPartitionIds: ['partition:display'] },
    deviceCapabilities: [{ deviceId: 'display:wp7', capabilities: ['display.render'], status: 'online' }],
    proposals: [
      {
        id: 'proposal:redacted',
        title: 'Old local proposal',
        commands: [],
        localPath: '/Users/ziqi/Desktop/FluffyFoundation/secrets/wp7.json',
      },
    ],
    ...overrides,
  });

test('AI group and partition parity fixtures use semantic command bus policy, audit, history, and rollback paths', () => {
  const traces = runAiGroupPartitionParityFixtures({
    actor: { id: 'ai:wp7', role: 'ai' },
    directActor: { id: 'cli:wp7', role: 'service' },
    cases: [
      {
        id: 'group-create',
        command: {
          type: 'group.create',
          group: { id: 'group:new', parentId: null, name: 'New Group', nodeIds: ['display:2'], disabled: false, surface: 'internal' },
        },
        createBus: () => createBus({ revision: 70 }),
      },
      {
        id: 'group-update',
        command: {
          type: 'group.update',
          groupId: 'group:display',
          patch: { nodeIds: ['display:1', 'display:2'], surface: 'internal', visibility: { defaultAccess: 'hidden' } },
        },
        createBus: () => createBus({ revision: 80 }),
      },
      {
        id: 'group-archive',
        command: { type: 'group.archive', groupId: 'group:display' },
        createBus: () => createBus({ revision: 90 }),
      },
      {
        id: 'group-restore',
        command: { type: 'group.restore', groupId: 'group:display' },
        createBus: () => createBus({ groups: [{ ...baseGroup, archived: true }], revision: 100 }),
      },
      {
        id: 'partition-deploy',
        command: { type: 'partition.deploy', partitionId: 'partition:preview', nodeIds: ['display:1', 'display:2'], targetPlatform: 'display' },
        createBus: () => createBus({ revision: 110 }),
      },
      {
        id: 'partition-stop',
        command: { type: 'partition.stop', partitionId: 'partition:display' },
        createBus: () => createBus({ revision: 120 }),
      },
      {
        id: 'partition-stop-approval',
        command: { type: 'partition.stop', partitionId: 'partition:display' },
        createBus: () => createBus({ revision: 130 }),
        approvalRequired: true,
      },
    ],
  });

  assert.deepEqual(traces.map((trace) => trace.caseId), [
    'group-create',
    'group-update',
    'group-archive',
    'group-restore',
    'partition-deploy',
    'partition-stop',
    'partition-stop-approval',
  ]);

  for (const trace of traces.filter((item) => !item.approvalRequired)) {
    assert.equal(trace.ai.status.dryRun, 'dry-run-passed');
    assert.equal(trace.ai.status.apply, 'applied');
    assert.equal(trace.ai.policy.apply.status, 'allowed');
    assert.equal(trace.ai.audit.historyEntry?.status, 'applied');
    assert.ok(trace.ai.audit.rollback.reference);
    assert.equal(trace.direct.result.ok, true);
    assert.deepEqual(trace.parity, {
      appliedRevisionMatches: true,
      snapshotMatches: true,
      commandTypeMatches: true,
    });
    assert.equal(trace.ai.observedResult.classification, 'success');
    assert.equal(trace.runtimeObservation.deferred, true);
    assert.match(trace.expectedEffect.summary, /semantic command bus/i);
    assert.ok(['medium', 'high'].includes(trace.risk.level));
    assert.equal(JSON.stringify(trace).includes('/Users/'), false);
    assert.equal(JSON.stringify(trace).includes('shugu_secret'), false);
  }

  const approval = traces.find((trace) => trace.caseId === 'partition-stop-approval');
  assert.equal(approval.approvalRequired, true);
  assert.equal(approval.ai.status.apply, 'approval-required');
  assert.equal(approval.ai.policy.apply.status, 'approval-required');
  assert.equal(approval.ai.audit.historyEntry, null);
  assert.equal(approval.ai.audit.rollback.reference, null);
  assert.equal(approval.direct.result.ok, true);
  assert.equal(approval.parity.snapshotMatches, false);

  const updated = traces.find((trace) => trace.caseId === 'group-update');
  assert.deepEqual(
    updated.ai.snapshot.groups.find((group) => group.id === 'group:display')?.nodeIds,
    ['display:1', 'display:2']
  );

  const stopped = traces.find((trace) => trace.caseId === 'partition-stop');
  assert.equal(
    stopped.ai.snapshot.partitions.find((partition) => partition.id === 'partition:display')?.status,
    'stopped'
  );
});
