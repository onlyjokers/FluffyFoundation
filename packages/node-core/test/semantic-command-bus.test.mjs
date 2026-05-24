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

test('command bus restores archived nodes and approves proposals with audit history', () => {
  const bus = createSemanticCommandBus({
    graph: {
      nodes: [
        {
          id: 'n1',
          type: 'number',
          position: { x: 50, y: 80 },
          config: { value: 2, archived: true },
          inputValues: {},
          outputValues: {},
        },
      ],
      connections: [],
    },
    definitions,
    revision: 20,
    proposals: [
      {
        id: 'proposal:restore',
        title: 'Restore number node',
        status: 'proposed',
        commands: [{ type: 'node.restore', nodeId: 'n1' }],
      },
    ],
  });

  const restored = bus.dispatch({
    actor: { id: 'canvas', role: 'operator' },
    command: { type: 'node.restore', nodeId: 'n1' },
  });

  assert.equal(restored.ok, true);
  assert.equal(bus.getSnapshot().nodes.find((node) => node.id === 'n1')?.params.archived, false);
  assert.equal(restored.audit.lifecycle.includes('rollback-token'), true);

  const approved = bus.dispatch({
    actor: { id: 'manager', role: 'manager' },
    command: { type: 'proposal.approve', proposalId: 'proposal:restore', approvedBy: 'manager' },
  });

  assert.equal(approved.ok, true);
  assert.equal(bus.getSnapshot().proposals?.[0].status, 'accepted');
  assert.equal(bus.getSnapshot().proposals?.[0].approvedBy, 'manager');
  assert.equal(bus.getHistory().length, 2);
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

test('runtime override commands record live override intent with audit and rollback', () => {
  const bus = createSemanticCommandBus({
    graph: baseGraph,
    definitions,
    runtimeStatus: { running: true, deployedPartitionIds: ['partition:client'] },
    revision: 30,
  });

  const setOverride = bus.dispatch({
    actor: { id: 'ai:runtime', role: 'ai' },
    command: {
      type: 'runtime.override.set',
      nodeId: 'n1',
      portId: 'value',
      kind: 'input',
      value: 0.9,
      ttlMs: 5000,
    },
  });

  assert.equal(setOverride.ok, true);
  assert.equal(setOverride.audit.command.type, 'runtime.override.set');
  assert.equal(setOverride.audit.lifecycle.includes('rollback-token'), true);
  assert.deepEqual(bus.getSnapshot().runtimeStatus.runtimeOverrides, [
    {
      nodeId: 'n1',
      portId: 'value',
      kind: 'input',
      value: 0.9,
      ttlMs: 5000,
      updatedAtRevision: 31,
    },
  ]);

  const clearOverride = bus.dispatch({
    actor: { id: 'ai:runtime', role: 'ai' },
    command: {
      type: 'runtime.override.clear',
      nodeId: 'n1',
      portId: 'value',
      kind: 'input',
    },
  });

  assert.equal(clearOverride.ok, true);
  assert.deepEqual(bus.getSnapshot().runtimeStatus.runtimeOverrides, []);

  const rolledBack = bus.rollback(clearOverride.rollbackToken);
  assert.equal(rolledBack.ok, true);
  assert.deepEqual(bus.getSnapshot().runtimeStatus.runtimeOverrides, [
    {
      nodeId: 'n1',
      portId: 'value',
      kind: 'input',
      value: 0.9,
      ttlMs: 5000,
      updatedAtRevision: 31,
    },
  ]);
});

test('runtime override commands validate node, port, and ttl boundaries', () => {
  const bus = createSemanticCommandBus({
    graph: baseGraph,
    definitions,
    revision: 40,
  });

  const missingNode = bus.dispatch({
    actor: { id: 'ai:runtime', role: 'ai' },
    command: { type: 'runtime.override.set', nodeId: 'missing', portId: 'value', value: 1 },
    dryRun: true,
  });
  assert.equal(missingNode.ok, false);
  assert.equal(missingNode.validationErrors[0].code, 'GRAPH.MISSING_NODE');

  const missingPort = bus.dispatch({
    actor: { id: 'ai:runtime', role: 'ai' },
    command: { type: 'runtime.override.set', nodeId: 'n1', portId: '', value: 1 },
    dryRun: true,
  });
  assert.equal(missingPort.ok, false);
  assert.equal(missingPort.validationErrors[0].code, 'RUNTIME.INVALID_OVERRIDE');

  const invalidTtl = bus.dispatch({
    actor: { id: 'ai:runtime', role: 'ai' },
    command: { type: 'runtime.override.set', nodeId: 'n1', portId: 'value', value: 1, ttlMs: -1 },
    dryRun: true,
  });
  assert.equal(invalidTtl.ok, false);
  assert.equal(invalidTtl.validationErrors[0].code, 'RUNTIME.INVALID_OVERRIDE_TTL');
});

test('runtime override commands clamp numeric param values using semantic bounds', () => {
  const bus = createSemanticCommandBus({
    graph: baseGraph,
    definitions: [
      {
        type: 'number',
        label: 'Number',
        category: 'Values',
        inputs: [],
        outputs: [{ id: 'out', label: 'Out', type: 'number' }],
        configSchema: [{ key: 'value', label: 'Value', type: 'number', defaultValue: 1, min: 0, max: 3 }],
      },
    ],
    runtimeStatus: { running: true, deployedPartitionIds: ['partition:client'] },
    revision: 50,
  });

  const result = bus.dispatch({
    actor: { id: 'ai:runtime', role: 'ai' },
    command: { type: 'runtime.override.set', nodeId: 'n1', portId: 'value', kind: 'param', value: -36 },
  });

  assert.equal(result.ok, true);
  assert.equal(result.command.type, 'runtime.override.set');
  assert.equal(result.command.value, 0);
  assert.deepEqual(result.warnings, [
    {
      code: 'SEMANTIC.PARAM_CLAMPED',
      path: 'nodes.n1.params.value',
      message: 'Parameter value was clamped from -36 to 0.',
    },
  ]);
  assert.equal(bus.getSnapshot().runtimeStatus.runtimeOverrides?.[0]?.value, 0);
});

test('semantic command dry-run clamps numeric param overflow and returns warnings', () => {
  const bus = createSemanticCommandBus({
    graph: {
      nodes: [
        {
          id: 'n1',
          type: 'number',
          position: { x: 50, y: 80 },
          config: { value: 2 },
          inputValues: {},
          outputValues: { out: 2 },
        },
        {
          id: 'n2',
          type: 'math',
          position: { x: 100, y: 100 },
          config: {},
          inputValues: {},
          outputValues: {},
        },
      ],
      connections: [],
    },
    definitions: [
      {
        type: 'number',
        label: 'Number',
        category: 'Values',
        inputs: [],
        outputs: [{ id: 'out', label: 'Out', type: 'number' }],
        configSchema: [{ key: 'value', label: 'Value', type: 'number', defaultValue: 1, min: 0, max: 10 }],
      },
      {
        type: 'math',
        label: 'Math',
        category: 'Logic',
        inputs: [{ id: 'flag', label: 'Flag', type: 'boolean' }],
        outputs: [{ id: 'out', label: 'Out', type: 'number' }],
        configSchema: [],
      },
    ],
    revision: 1,
  });

  const overflow = bus.dispatch({
    actor: { id: 'ai:wp1', role: 'ai' },
    command: { type: 'node.params.update', nodeId: 'n1', params: { value: 20 } },
    dryRun: true,
  });
  assert.equal(overflow.ok, true);
  assert.equal(overflow.command.type, 'node.params.update');
  assert.equal(overflow.command.params.value, 10);
  assert.deepEqual(overflow.warnings, [
    {
      code: 'SEMANTIC.PARAM_CLAMPED',
      path: 'nodes.n1.params.value',
      message: 'Parameter value was clamped from 20 to 10.',
    },
  ]);
  assert.equal(bus.getSnapshot().nodes.find((node) => node.id === 'n1')?.params.value, 2);
});

test('semantic command dry-run returns structured validation errors for incompatible ports', () => {
  const bus = createSemanticCommandBus({
    graph: {
      nodes: [
        {
          id: 'n1',
          type: 'number',
          position: { x: 50, y: 80 },
          config: { value: 2 },
          inputValues: {},
          outputValues: { out: 2 },
        },
        {
          id: 'n2',
          type: 'math',
          position: { x: 100, y: 100 },
          config: {},
          inputValues: {},
          outputValues: {},
        },
      ],
      connections: [],
    },
    definitions: [
      {
        type: 'number',
        label: 'Number',
        category: 'Values',
        inputs: [],
        outputs: [{ id: 'out', label: 'Out', type: 'number' }],
        configSchema: [{ key: 'value', label: 'Value', type: 'number', defaultValue: 1, min: 0, max: 10 }],
      },
      {
        type: 'math',
        label: 'Math',
        category: 'Logic',
        inputs: [{ id: 'flag', label: 'Flag', type: 'boolean' }],
        outputs: [{ id: 'out', label: 'Out', type: 'number' }],
        configSchema: [],
      },
    ],
    revision: 1,
  });

  const incompatible = bus.dispatch({
    actor: { id: 'ai:wp1', role: 'ai' },
    command: {
      type: 'node.connect',
      connection: {
        id: 'c1',
        sourceNodeId: 'n1',
        sourcePortId: 'out',
        targetNodeId: 'n2',
        targetPortId: 'flag',
      },
    },
    dryRun: true,
  });
  assert.equal(incompatible.ok, false);
  assert.equal(incompatible.validationErrors[0].code, 'GRAPH.PORT_INCOMPATIBLE');
  assert.equal(incompatible.validationErrors[0].path, 'connections.c1');

  const invalidTarget = bus.dispatch({
    actor: { id: 'ai:wp1', role: 'ai' },
    command: {
      type: 'partition.deploy',
      partitionId: 'partition:bad-target',
      nodeIds: ['n1'],
      targetPlatform: 'browser-wall',
    },
    dryRun: true,
  });
  assert.equal(invalidTarget.ok, false);
  assert.equal(invalidTarget.validationErrors[0].code, 'EXECUTION.INVALID_TARGET_PLATFORM');
  assert.equal(invalidTarget.validationErrors[0].path, 'partitions.partition:bad-target.targetPlatform');
});

test('command bus returns current snapshot without mutation for graph.snapshot', () => {
  const bus = createSemanticCommandBus({
    graph: baseGraph,
    definitions,
    revision: 11,
  });

  const result = bus.dispatch({
    actor: { id: 'cli', role: 'operator' },
    command: { type: 'graph.snapshot' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.appliedRevision, 11);
  assert.equal(result.snapshot.revision, 11);
  assert.equal(result.snapshot.nodes.length, 1);
  assert.equal(bus.getHistory().length, 0);
});

test('command bus snapshots preserve normalized definition ports', () => {
  const bus = createSemanticCommandBus({
    graph: { nodes: [], connections: [] },
    definitions,
    revision: 1,
  });

  const snapshot = bus.getSnapshot();

  assert.equal(snapshot.definitions[0].ports.outputs[0].id, 'out');
  assert.equal(snapshot.definitions[1].ports.inputs[0].id, 'a');
});

test('command bus replaces graph state for server-owned graph import', () => {
  const bus = createSemanticCommandBus({
    graph: { nodes: [], connections: [] },
    definitions,
    revision: 0,
  });

  const result = bus.dispatch({
    actor: { id: 'manager', role: 'operator' },
    command: {
      type: 'graph.replace',
      graph: baseGraph,
      groups: [
        { id: 'group:1', parentId: null, name: 'Imported', nodeIds: ['n1'], disabled: false },
      ],
      partitions: [{ id: 'partition:1', nodeIds: ['n1'], status: 'draft' }],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.appliedRevision, 1);
  assert.equal(bus.getSnapshot().nodes[0].id, 'n1');
  assert.equal(bus.getSnapshot().groups[0].name, 'Imported');
  assert.equal(bus.getSnapshot().partitions[0].id, 'partition:1');
});

test('semantic command params update clears stale inline input values for the same key', () => {
  const bus = createSemanticCommandBus({
    graph: {
      nodes: [
        {
          id: 'n1',
          type: 'values-string',
          position: { x: 0, y: 0 },
          config: { value: 'config-value' },
          inputValues: { value: 'inline-value', other: 'keep-me' },
          outputValues: {},
        },
      ],
      connections: [],
    },
    definitions: [
      {
        type: 'values-string',
        label: 'Values String',
        category: 'Values',
        inputs: [],
        outputs: [],
        configSchema: [
          { key: 'value', label: 'Value', type: 'string', defaultValue: '' },
          { key: 'other', label: 'Other', type: 'string', defaultValue: '' },
        ],
      },
    ],
    revision: 1,
  });

  const result = bus.dispatch({
    actor: { id: 'ai:wp1', role: 'ai' },
    command: {
      type: 'node.params.update',
      nodeId: 'n1',
      params: { value: 'new-value' },
    },
  });

  assert.equal(result.ok, true);
  const node = bus.getSnapshot().nodes.find((item) => item.id === 'n1');
  assert.equal(node?.params.value, 'new-value');
  assert.equal(node?.inputValues.value, undefined);
  assert.equal(node?.inputValues.other, 'keep-me');
});

test('semantic command input update persists inline input values', () => {
  const bus = createSemanticCommandBus({
    graph: {
      nodes: [
        {
          id: 'n1',
          type: 'number',
          position: { x: 0, y: 0 },
          config: { value: 1 },
          inputValues: { value: 1 },
          outputValues: {},
        },
      ],
      connections: [],
    },
    definitions: [
      {
        type: 'number',
        label: 'Number',
        category: 'Values',
        inputs: [{ id: 'value', label: 'Value', type: 'number' }],
        outputs: [{ id: 'out', label: 'Out', type: 'number' }],
        configSchema: [{ key: 'value', label: 'Value', type: 'number', defaultValue: 1 }],
      },
    ],
    revision: 1,
  });

  const result = bus.dispatch({
    actor: { id: 'canvas', role: 'operator' },
    command: {
      type: 'node.inputs.update',
      nodeId: 'n1',
      inputValues: { value: 42 },
    },
  });

  assert.equal(result.ok, true);
  const node = bus.getSnapshot().nodes.find((item) => item.id === 'n1');
  assert.equal(node?.params.value, 1);
  assert.equal(node?.inputValues.value, 42);
});

test('semantic command input update rejects unknown ports and invalid values', () => {
  const bus = createSemanticCommandBus({
    graph: {
      nodes: [
        {
          id: 'n1',
          type: 'number',
          position: { x: 0, y: 0 },
          config: { value: 1 },
          inputValues: { value: 1 },
          outputValues: {},
        },
      ],
      connections: [],
    },
    definitions: [
      {
        type: 'number',
        label: 'Number',
        category: 'Values',
        inputs: [{ id: 'value', label: 'Value', type: 'number', min: 0, max: 10 }],
        outputs: [{ id: 'out', label: 'Out', type: 'number' }],
        configSchema: [{ key: 'value', label: 'Value', type: 'number', defaultValue: 1 }],
      },
    ],
    revision: 1,
  });

  const unknownPort = bus.dispatch({
    actor: { id: 'canvas', role: 'operator' },
    command: {
      type: 'node.inputs.update',
      nodeId: 'n1',
      inputValues: { missing: 42 },
    },
    dryRun: true,
  });

  assert.equal(unknownPort.ok, false);
  assert.equal(unknownPort.validationErrors[0].code, 'GRAPH.PORT_NOT_FOUND');
  assert.equal(unknownPort.validationErrors[0].path, 'nodes.n1.inputs.missing');

  const outOfRange = bus.dispatch({
    actor: { id: 'canvas', role: 'operator' },
    command: {
      type: 'node.inputs.update',
      nodeId: 'n1',
      inputValues: { value: 42 },
    },
    dryRun: true,
  });

  assert.equal(outOfRange.ok, false);
  assert.equal(outOfRange.validationErrors[0].code, 'GRAPH.INPUT_OUT_OF_RANGE');
  assert.equal(outOfRange.validationErrors[0].path, 'nodes.n1.inputs.value');

  const wrongType = bus.dispatch({
    actor: { id: 'canvas', role: 'operator' },
    command: {
      type: 'node.inputs.update',
      nodeId: 'n1',
      inputValues: { value: 'loud' },
    },
    dryRun: true,
  });

  assert.equal(wrongType.ok, false);
  assert.equal(wrongType.validationErrors[0].code, 'GRAPH.INPUT_INVALID');
  assert.equal(wrongType.validationErrors[0].path, 'nodes.n1.inputs.value');
});

test('semantic command input update accepts connectable config inputs and rejects unsupported options', () => {
  const bus = createSemanticCommandBus({
    graph: {
      nodes: [
        {
          id: 'scene',
          type: 'scene-fct-track',
          position: { x: 0, y: 0 },
          config: { variant: 'shattered-reality' },
          inputValues: {},
          outputValues: {},
        },
      ],
      connections: [],
    },
    definitions: [
      {
        type: 'scene-fct-track',
        label: 'Scene FCT Track',
        category: 'Scene',
        inputs: [{ id: 'in', label: 'In', type: 'scene' }],
        outputs: [{ id: 'out', label: 'Out', type: 'scene' }],
        configSchema: [
          {
            key: 'variant',
            label: 'Variant',
            type: 'select',
            defaultValue: 'shattered-reality',
            connectable: true,
            options: [
              { value: 'shattered-reality', label: 'Shattered Reality' },
              { value: 'acab', label: 'ACAB' },
            ],
          },
        ],
      },
    ],
    revision: 1,
  });

  const accepted = bus.dispatch({
    actor: { id: 'canvas', role: 'operator' },
    command: {
      type: 'node.inputs.update',
      nodeId: 'scene',
      inputValues: { variant: 'acab' },
    },
  });

  assert.equal(accepted.ok, true);
  assert.equal(bus.getSnapshot().nodes[0].params.variant, 'shattered-reality');
  assert.equal(bus.getSnapshot().nodes[0].inputValues.variant, 'acab');

  const rejected = bus.dispatch({
    actor: { id: 'canvas', role: 'operator' },
    command: {
      type: 'node.inputs.update',
      nodeId: 'scene',
      inputValues: { variant: 'unknown' },
    },
    dryRun: true,
  });

  assert.equal(rejected.ok, false);
  assert.equal(rejected.validationErrors[0].code, 'GRAPH.INPUT_INVALID');
  assert.equal(rejected.validationErrors[0].path, 'nodes.scene.inputs.variant');
});

test('semantic command normalizes select aliases and rejects unsupported select values', () => {
  const bus = createSemanticCommandBus({
    graph: {
      nodes: [
        {
          id: 'flashlight',
          type: 'proc-flashlight',
          position: { x: 0, y: 0 },
          config: { active: true, mode: 'blink', frequencyHz: 2, dutyCycle: 0.5 },
          inputValues: {},
          outputValues: {},
        },
      ],
      connections: [],
    },
    definitions: [
      {
        type: 'proc-flashlight',
        label: 'Flashlight',
        category: 'Processors',
        inputs: [],
        outputs: [],
        configSchema: [
          { key: 'active', label: 'Active', type: 'boolean', defaultValue: true },
          {
            key: 'mode',
            label: 'Mode',
            type: 'select',
            defaultValue: 'blink',
            options: [
              { value: 'off', label: 'Off' },
              { value: 'on', label: 'On' },
              { value: 'blink', label: 'Blink' },
            ],
          },
          { key: 'frequencyHz', label: 'Frequency', type: 'number', defaultValue: 2 },
          { key: 'dutyCycle', label: 'Duty', type: 'number', defaultValue: 0.5 },
        ],
      },
    ],
    revision: 1,
  });

  const aliased = bus.dispatch({
    actor: { id: 'ai:wp1', role: 'ai' },
    command: {
      type: 'node.params.update',
      nodeId: 'flashlight',
      params: { mode: 'pulse' },
    },
    dryRun: true,
  });

  assert.equal(aliased.ok, true);
  assert.equal(aliased.command.params.mode, 'blink');
  assert.equal(aliased.warnings?.[0]?.code, 'SEMANTIC.PARAM_NORMALIZED');

  const rejected = bus.dispatch({
    actor: { id: 'ai:wp1', role: 'ai' },
    command: {
      type: 'node.params.update',
      nodeId: 'flashlight',
      params: { mode: 'spark' },
    },
    dryRun: true,
  });

  assert.equal(rejected.ok, false);
  assert.equal(rejected.validationErrors[0].code, 'GRAPH.PARAM_INVALID');
});
