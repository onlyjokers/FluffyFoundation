// Purpose: verify FF-09 semantic snapshot and transactional command bus behavior.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSemanticCommandBus,
  createSemanticGraphSnapshot,
} from '../dist-node-core/semantic-command-bus.js';

const definitions = [
  {
    type: 'number',
    label: 'Number',
    category: 'Values',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [{ key: 'value', label: 'Value', type: 'number', defaultValue: 1 }],
  },
  {
    type: 'math',
    label: 'Math',
    category: 'Logic',
    inputs: [{ id: 'a', label: 'A', type: 'number' }],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [],
  },
];

const baseGraph = {
  nodes: [
    {
      id: 'n1',
      type: 'number',
      position: { x: 50, y: 80 },
      config: { value: 2 },
      inputValues: {},
      outputValues: { out: 2 },
      selected: true,
      collapsed: true,
    },
  ],
  connections: [],
};

test('SemanticGraphSnapshot includes semantic fields and excludes UI noise', () => {
  const snapshot = createSemanticGraphSnapshot({
    graph: baseGraph,
    definitions,
    groups: [
      {
        id: 'group:1',
        parentId: null,
        name: 'Group 1',
        nodeIds: ['n1'],
        disabled: false,
        minimized: true,
      },
    ],
    partitions: [{ id: 'partition:1', nodeIds: ['n1'], status: 'stopped' }],
    runtimeStatus: { running: false, deployedPartitionIds: [] },
    deviceCapabilities: [{ deviceId: 'client-1', capabilities: ['sound'] }],
    errors: [{ code: 'last-error', message: 'example' }],
    permissions: [{ actorId: 'canvas', operations: ['node.add', 'node.connect'] }],
    revision: 7,
  });

  assert.equal(snapshot.revision, 7);
  assert.deepEqual(snapshot.nodes[0], {
    id: 'n1',
    type: 'number',
    params: { value: 2 },
    inputValues: {},
    outputValues: { out: 2 },
  });
  assert.equal(snapshot.nodes[0].position, undefined);
  assert.equal(snapshot.nodes[0].selected, undefined);
  assert.equal(snapshot.nodes[0].collapsed, undefined);
  assert.equal(snapshot.definitions[0].ports.outputs[0].id, 'out');
  assert.equal(snapshot.groups[0].minimized, undefined);
  assert.equal(snapshot.partitions[0].status, 'stopped');
  assert.equal(snapshot.permissions[0].operations[0], 'node.add');
});

test('command bus applies transaction lifecycle with dry-run, policy, audit, history, and rollback token', () => {
  const bus = createSemanticCommandBus({
    graph: { nodes: [], connections: [] },
    definitions,
    revision: 1,
    policy: {
      canExecute: ({ actor, command }) =>
        actor.id === 'canvas' || command.type === 'proposal.create',
    },
  });

  const dryRun = bus.dispatch({
    actor: { id: 'canvas', role: 'operator' },
    command: {
      type: 'node.add',
      node: {
        id: 'n1',
        type: 'number',
        position: { x: 10, y: 20 },
        config: { value: 4 },
        inputValues: {},
        outputValues: {},
      },
    },
    dryRun: true,
  });

  assert.equal(dryRun.ok, true);
  assert.equal(bus.getSnapshot().nodes.length, 0);
  assert.equal(dryRun.audit.policy.allowed, true);
  assert.ok(dryRun.rollbackToken);
  assert.equal(dryRun.appliedRevision, 1);

  const applied = bus.dispatch({
    actor: { id: 'canvas', role: 'operator' },
    command: dryRun.command,
  });

  assert.equal(applied.ok, true);
  assert.equal(applied.previousRevision, 1);
  assert.equal(applied.appliedRevision, 2);
  assert.equal(bus.getSnapshot().nodes.length, 1);
  assert.equal(bus.getHistory().length, 1);
  assert.equal(
    bus.getAuditLog()[0].lifecycle.join(','),
    'dry-run,policy,apply,audit,history,rollback-token'
  );

  const denied = bus.dispatch({
    actor: { id: 'intruder', role: 'viewer' },
    command: { type: 'node.archive', nodeId: 'n1' },
  });

  assert.equal(denied.ok, false);
  assert.equal(denied.stage, 'policy');
  assert.equal(bus.getSnapshot().nodes.length, 1);

  const rolledBack = bus.rollback(applied.rollbackToken);
  assert.equal(rolledBack.ok, true);
  assert.equal(bus.getSnapshot().nodes.length, 0);
  assert.equal(bus.getSnapshot().revision, 3);
});

test('command bus handles groups, partitions, params, disconnect, and proposals transactionally', () => {
  const bus = createSemanticCommandBus({
    graph: baseGraph,
    definitions,
    revision: 3,
  });

  assert.equal(
    bus.dispatch({
      actor: { id: 'canvas', role: 'operator' },
      command: {
        type: 'node.add',
        node: {
          id: 'n2',
          type: 'math',
          position: { x: 100, y: 100 },
          config: {},
          inputValues: {},
          outputValues: {},
        },
      },
    }).ok,
    true
  );
  assert.equal(
    bus.dispatch({
      actor: { id: 'canvas', role: 'operator' },
      command: {
        type: 'node.connect',
        connection: {
          id: 'c1',
          sourceNodeId: 'n1',
          sourcePortId: 'out',
          targetNodeId: 'n2',
          targetPortId: 'a',
        },
      },
    }).ok,
    true
  );
  assert.equal(
    bus.dispatch({
      actor: { id: 'canvas', role: 'operator' },
      command: { type: 'node.params.update', nodeId: 'n1', params: { value: 9 } },
    }).ok,
    true
  );
  assert.equal(
    bus.dispatch({
      actor: { id: 'canvas', role: 'operator' },
      command: {
        type: 'group.create',
        group: { id: 'group:1', parentId: null, name: 'Group', nodeIds: ['n1'], disabled: false },
      },
    }).ok,
    true
  );
  assert.equal(
    bus.dispatch({
      actor: { id: 'canvas', role: 'operator' },
      command: {
        type: 'group.update',
        groupId: 'group:1',
        patch: { name: 'Renamed', nodeIds: ['n1', 'n2'] },
      },
    }).ok,
    true
  );
  assert.equal(
    bus.dispatch({
      actor: { id: 'canvas', role: 'operator' },
      command: { type: 'partition.deploy', partitionId: 'partition:1', nodeIds: ['n1', 'n2'] },
    }).ok,
    true
  );
  assert.equal(
    bus.dispatch({
      actor: { id: 'canvas', role: 'operator' },
      command: { type: 'partition.stop', partitionId: 'partition:1' },
    }).ok,
    true
  );
  assert.equal(
    bus.dispatch({
      actor: { id: 'ai', role: 'operator' },
      command: {
        type: 'proposal.create',
        proposal: {
          id: 'proposal:1',
          title: 'Add math node',
          commands: [{ type: 'node.disconnect', connectionId: 'c1' }],
        },
      },
    }).ok,
    true
  );

  const snapshot = bus.getSnapshot();
  assert.equal(snapshot.nodes.find((node) => node.id === 'n1')?.params.value, 9);
  assert.equal(snapshot.connections.length, 1);
  assert.equal(snapshot.groups.find((group) => group.id === 'group:1')?.name, 'Renamed');
  assert.equal(
    snapshot.partitions.find((partition) => partition.id === 'partition:1')?.status,
    'stopped'
  );
  assert.equal(snapshot.proposals?.[0].id, 'proposal:1');
});

test('partition lifecycle commands bind target platform, status, rollback, and revision', () => {
  const bus = createSemanticCommandBus({
    graph: baseGraph,
    definitions,
    revision: 10,
  });

  const deployed = bus.dispatch({
    actor: { id: 'manager-1', role: 'manager' },
    command: {
      type: 'partition.deploy',
      partitionId: 'partition:display',
      nodeIds: ['n1'],
      targetPlatform: 'display',
      requiredCapabilities: ['display.render'],
      resourceBudget: { maxTickHz: 30, maxMemoryMb: 128 },
      watchdog: { timeoutMs: 1500, failureThreshold: 2 },
      expectedRevision: 10,
    },
  });

  assert.equal(deployed.ok, true);
  const partition = bus.getSnapshot().partitions.find((item) => item.id === 'partition:display');
  assert.equal(partition?.targetPlatform, 'display');
  assert.equal(partition?.status, 'deployed');
  assert.equal(partition?.boundRevision, 11);
  assert.equal(partition?.resourceBudget?.maxTickHz, 30);
  assert.equal(partition?.watchdog?.timeoutMs, 1500);
  assert.equal(deployed.audit.lifecycle.includes('rollback-token'), true);

  assert.equal(
    bus.dispatch({
      actor: { id: 'manager-1', role: 'manager' },
      command: { type: 'partition.start', partitionId: 'partition:display', expectedRevision: 11 },
    }).ok,
    true
  );
  assert.equal(
    bus.dispatch({
      actor: { id: 'manager-1', role: 'manager' },
      command: { type: 'partition.stop', partitionId: 'partition:display', expectedRevision: 12 },
    }).ok,
    true
  );
  assert.equal(
    bus.dispatch({
      actor: { id: 'manager-1', role: 'manager' },
      command: { type: 'partition.redeploy', partitionId: 'partition:display', expectedRevision: 13 },
    }).ok,
    true
  );
  assert.equal(
    bus.dispatch({
      actor: { id: 'manager-1', role: 'manager' },
      command: { type: 'partition.remove', partitionId: 'partition:display', expectedRevision: 14 },
    }).ok,
    true
  );

  assert.equal(bus.getSnapshot().partitions.find((item) => item.id === 'partition:display')?.status, 'removed');
});

test('partition lifecycle rejects revision mismatch and records structured failure reports', () => {
  const bus = createSemanticCommandBus({
    graph: baseGraph,
    definitions,
    partitions: [
      {
        id: 'partition:client',
        nodeIds: ['n1'],
        targetPlatform: 'client',
        status: 'deployed',
        boundRevision: 3,
        requiredCapabilities: ['sensor.gyro'],
      },
    ],
    revision: 3,
  });

  const stale = bus.dispatch({
    actor: { id: 'manager-1', role: 'manager' },
    command: { type: 'partition.start', partitionId: 'partition:client', expectedRevision: 2 },
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.stage, 'dry-run');
  assert.match(stale.message, /revision/i);

  const failure = bus.dispatch({
    actor: { id: 'manager-1', role: 'manager' },
    command: {
      type: 'partition.report.failure',
      partitionId: 'partition:client',
      report: {
        kind: 'partition-failure-report',
        partitionId: 'partition:client',
        targetPlatform: 'client',
        code: 'resource.budget_exceeded',
        message: 'Tick rate exceeded budget.',
        atRevision: 3,
        resourceBudget: { maxTickHz: 30, observedTickHz: 75 },
      },
    },
  });

  assert.equal(failure.ok, true);
  const partition = bus.getSnapshot().partitions.find((item) => item.id === 'partition:client');
  assert.equal(partition?.status, 'error');
  assert.equal(partition?.failureReport?.code, 'resource.budget_exceeded');
  assert.equal(partition?.failureReport?.resourceBudget?.observedTickHz, 75);
});
