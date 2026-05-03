// Purpose: verify FF-11 graph validation, migrations, semantic history, and rollback safety.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  NodeRegistry,
  NodeRuntime,
  createSemanticCommandBus,
  createSemanticHistory,
  migrateProjectSchema,
  validateGraphState,
} from '../dist-node-core/index.js';
import { oldProjectV1 } from './fixtures/ff11-old-project-v1.mjs';

const definitions = [
  {
    type: 'number',
    label: 'Number',
    category: 'Values',
    inputs: [{ id: 'value', label: 'Value', type: 'number' }],
    outputs: [{ id: 'value', label: 'Value', type: 'number' }],
    configSchema: [{ key: 'value', label: 'Value', type: 'number', defaultValue: 0, min: 0, max: 10 }],
    metadata: {
      version: '1.0.0',
      platformTargets: ['manager', 'client'],
      sideEffectClass: 'none',
      permissions: [],
      compatibility: [],
      examples: [],
      risks: [],
      description: 'Bounded number source.',
    },
    process: (_inputs, config) => ({ value: Number(config.value ?? 0) }),
  },
  {
    type: 'math',
    label: 'Math',
    category: 'Logic',
    inputs: [{ id: 'a', label: 'A', type: 'number' }],
    outputs: [{ id: 'result', label: 'Result', type: 'number' }],
    configSchema: [],
    metadata: {
      version: '1.0.0',
      platformTargets: ['manager', 'client'],
      sideEffectClass: 'none',
      permissions: [],
      compatibility: [],
      examples: [],
      risks: [],
      description: 'Math fixture.',
    },
    process: (inputs) => ({ result: Number(inputs.a ?? 0) + 1 }),
  },
  {
    type: 'display-output',
    label: 'Display Output',
    category: 'Player',
    inputs: [{ id: 'in', label: 'In', type: 'number', kind: 'sink' }],
    outputs: [],
    configSchema: [],
    metadata: {
      version: '1.0.0',
      platformTargets: ['display'],
      sideEffectClass: 'remote-control',
      permissions: ['control:send'],
      compatibility: [],
      examples: [],
      risks: ['Requires display deployment.'],
      description: 'Display side-effect sink.',
    },
    process: () => ({}),
  },
  {
    type: 'group-proxy',
    label: 'Group Proxy',
    category: 'Internal',
    inputs: [{ id: 'in', label: 'In', type: 'any' }],
    outputs: [{ id: 'out', label: 'Out', type: 'any' }],
    configSchema: [{ key: 'groupId', label: 'Group ID', type: 'string', defaultValue: '' }],
    metadata: {
      version: '1.0.0',
      platformTargets: ['manager'],
      sideEffectClass: 'local-state',
      permissions: ['graph:state'],
      compatibility: [],
      examples: [],
      risks: [],
      description: 'Group boundary proxy.',
    },
    process: (inputs) => ({ out: inputs.in }),
  },
];

const node = (id, type, config = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  config,
  inputValues: {},
  outputValues: {},
});

test('old project fixtures migrate to the current schema deterministically', () => {
  const migrated = migrateProjectSchema(oldProjectV1);

  assert.equal(migrated.schemaVersion, CURRENT_PROJECT_SCHEMA_VERSION);
  assert.deepEqual(migrated.graph.nodes.map((item) => item.id), ['source', 'math']);
  assert.deepEqual(migrated.graph.nodes[0].position, { x: 12, y: 34 });
  assert.deepEqual(migrated.graph.nodes[0].inputValues, {});
  assert.deepEqual(migrated.graph.connections[0], {
    id: 'edge-1',
    sourceNodeId: 'source',
    sourcePortId: 'value',
    targetNodeId: 'math',
    targetPortId: 'a',
  });
  assert.deepEqual(migrated.groups[0], {
    id: 'group-a',
    parentId: null,
    name: 'Legacy Group',
    nodeIds: ['source'],
    disabled: false,
  });
});

test('invalid connections and param overflow produce structured validation errors', () => {
  const result = validateGraphState(
    {
      nodes: [node('source', 'number', { value: 99 }), node('math', 'math')],
      connections: [
        {
          id: 'bad-port',
          sourceNodeId: 'source',
          sourcePortId: 'missing',
          targetNodeId: 'math',
          targetPortId: 'a',
        },
        {
          id: 'bad-type',
          sourceNodeId: 'source',
          sourcePortId: 'value',
          targetNodeId: 'math',
          targetPortId: 'missing',
        },
      ],
    },
    { definitions, targetPlatform: 'manager' }
  );

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.map((error) => error.code).sort(),
    ['ENDPOINT_NOT_FOUND', 'ENDPOINT_NOT_FOUND', 'PARAM_OUT_OF_BOUNDS']
  );
  assert.equal(result.errors.every((error) => typeof error.message === 'string'), true);
});

test('group boundaries and deployability validation use registry metadata', () => {
  const result = validateGraphState(
    {
      nodes: [
        node('source', 'number', { value: 4 }),
        node('math', 'math'),
        node('display', 'display-output'),
      ],
      connections: [
        {
          id: 'cross-boundary',
          sourceNodeId: 'source',
          sourcePortId: 'value',
          targetNodeId: 'math',
          targetPortId: 'a',
        },
      ],
    },
    {
      definitions,
      targetPlatform: 'manager',
      groups: [
        { id: 'group-a', parentId: null, name: 'A', nodeIds: ['source'], disabled: true },
      ],
      partitions: [
        { id: 'deploy-a', nodeIds: ['source', 'display'], status: 'deployed' },
      ],
      deployable: true,
      allowedSideEffects: ['none', 'local-state'],
    }
  );

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.map((error) => error.code).sort(),
    [
      'DEPLOYMENT_SIDE_EFFECT_FORBIDDEN',
      'DISABLED_NODE_CONNECTED',
      'DISABLED_NODE_DEPLOYED',
      'GROUP_BOUNDARY_VIOLATION',
      'PLATFORM_INCOMPATIBLE',
      'SIDE_EFFECT_FORBIDDEN',
    ]
  );
});

test('semantic history records meaningful changes but excludes layout-only noise', () => {
  const history = createSemanticHistory({
    graph: { nodes: [node('source', 'number', { value: 1 })], connections: [] },
    revision: 1,
  });

  const layoutOnly = history.record({
    graph: {
      nodes: [{ ...node('source', 'number', { value: 1 }), position: { x: 200, y: 300 } }],
      connections: [],
    },
    revision: 2,
  });
  assert.equal(layoutOnly.recorded, false);
  assert.equal(history.entries().length, 1);

  const semantic = history.record({
    graph: { nodes: [node('source', 'number', { value: 2 })], connections: [] },
    revision: 3,
  });
  assert.equal(semantic.recorded, true);
  assert.equal(history.entries().length, 2);
  assert.deepEqual(history.entries().map((entry) => entry.revision), [1, 3]);
});

test('rollback restores output behavior and returns structured recovery status', () => {
  const registry = new NodeRegistry();
  for (const definition of definitions.slice(0, 2)) registry.register(definition);

  const bus = createSemanticCommandBus({
    graph: { nodes: [node('source', 'number', { value: 3 })], connections: [] },
    definitions: definitions.slice(0, 2),
    partitions: [{ id: 'deploy-a', nodeIds: ['source'], status: 'deployed' }],
    revision: 1,
  });

  const changed = bus.dispatch({
    actor: { id: 'canvas', role: 'operator' },
    command: { type: 'node.params.update', nodeId: 'source', params: { value: 8 } },
  });
  assert.equal(changed.ok, true);

  const runtimeBefore = new NodeRuntime(registry);
  runtimeBefore.loadGraph({
    nodes: bus.getSnapshot().nodes.map((semanticNode) => ({
      id: semanticNode.id,
      type: semanticNode.type,
      position: { x: 0, y: 0 },
      config: semanticNode.params,
      inputValues: {},
      outputValues: {},
    })),
    connections: [],
  });
  runtimeBefore.step();
  assert.equal(runtimeBefore.getNode('source')?.outputValues.value, 8);

  const rolledBack = bus.rollbackToRevision(1);
  assert.equal(rolledBack.ok, true);
  assert.deepEqual(rolledBack.recovery, {
    status: 'redeployed',
    stoppedPartitionIds: ['deploy-a'],
    redeployedPartitionIds: ['deploy-a'],
    errors: [],
  });

  const runtimeAfter = new NodeRuntime(registry);
  runtimeAfter.loadGraph({
    nodes: bus.getSnapshot().nodes.map((semanticNode) => ({
      id: semanticNode.id,
      type: semanticNode.type,
      position: { x: 0, y: 0 },
      config: semanticNode.params,
      inputValues: {},
      outputValues: {},
    })),
    connections: [],
  });
  runtimeAfter.step();
  assert.equal(runtimeAfter.getNode('source')?.outputValues.value, 3);
});
