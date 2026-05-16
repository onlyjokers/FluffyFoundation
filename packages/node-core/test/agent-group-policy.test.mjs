// Purpose: verify AI-operable Space sandbox policy and no-op rejection behavior.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGroupSovereigntyPolicy,
  createSemanticCommandBus,
} from '../dist-node-core/semantic-command-bus.js';

const definitions = [
  {
    type: 'number',
    label: 'Number',
    category: 'Values',
    inputs: [{ id: 'in', label: 'In', type: 'number' }],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [
      { key: 'value', label: 'Value', type: 'number', min: 0, max: 10, defaultValue: 1 },
    ],
  },
];

const graph = {
  nodes: [
    {
      id: 'inside',
      type: 'number',
      position: { x: 0, y: 0 },
      config: { value: 1 },
      inputValues: {},
      outputValues: {},
    },
    {
      id: 'outside',
      type: 'number',
      position: { x: 100, y: 0 },
      config: { value: 1 },
      inputValues: {},
      outputValues: {},
    },
  ],
  connections: [],
};

const agentGroup = {
  id: 'ai-space:agent',
  parentId: null,
  name: 'Agent Space',
  nodeIds: ['inside'],
  disabled: false,
  kind: 'ai-space',
  owner: { actorId: 'manager-a', role: 'manager', capabilities: ['group.mutate'] },
  surface: 'internal',
  visibility: { defaultAccess: 'visible-readonly' },
  agentInterface: {
    publicInputs: [{ id: 'prompt', type: 'string', label: 'Prompt' }],
    publicOutputs: [{ id: 'effect', type: 'number', label: 'Effect' }],
    exposedNodeIds: ['inside'],
    callableCommands: ['node.params.update', 'node.add', 'node.connect'],
  },
  agentPolicy: {
    enabled: true,
    allowedActorIds: ['ai-1'],
    allowedCommands: ['node.params.update', 'node.add', 'node.connect'],
    deniedSurfaces: ['partition', 'secrets'],
    targetScope: {
      nodeIds: ['inside'],
      allowNewNodes: true,
    },
    budgets: {
      maxNodes: 2,
      maxConnections: 1,
      maxParamsPerCommand: 2,
    },
  },
};

function createBus() {
  return createSemanticCommandBus({
    graph,
    groups: [agentGroup],
    definitions,
    policy: createGroupSovereigntyPolicy(),
    revision: 10,
  });
}

const aiActor = { id: 'ai-1', role: 'ai' };

test('AI can mutate and create nodes inside an assigned AI Space sandbox', () => {
  const bus = createBus();

  const updated = bus.dispatch({
    actor: aiActor,
    command: {
      type: 'node.params.update',
      nodeId: 'inside',
      scopeGroupId: 'ai-space:agent',
      params: { value: 4 },
    },
  });
  assert.equal(updated.ok, true);
  assert.equal(bus.getSnapshot().nodes.find((node) => node.id === 'inside')?.params.value, 4);

  const added = bus.dispatch({
    actor: aiActor,
    command: {
      type: 'node.add',
      scopeGroupId: 'ai-space:agent',
      node: {
        id: 'agent:new',
        type: 'number',
        position: { x: 30, y: 0 },
        config: { value: 2 },
        inputValues: {},
        outputValues: {},
      },
    },
  });

  assert.equal(added.ok, true);
  assert.equal(bus.getSnapshot().groups[0]?.nodeIds.includes('agent:new'), true);
  assert.equal(bus.getSnapshot().nodes.find((node) => node.id === 'agent:new')?.params.value, 2);
});

test('AI sandbox rejects out-of-scope targets and budget overflow without live mutation', () => {
  const bus = createBus();

  const deniedOutside = bus.dispatch({
    actor: aiActor,
    command: {
      type: 'node.params.update',
      nodeId: 'outside',
      scopeGroupId: 'ai-space:agent',
      params: { value: 9 },
    },
  });
  assert.equal(deniedOutside.ok, false);
  assert.equal(deniedOutside.stage, 'policy');
  assert.match(deniedOutside.message, /outside AI Space scope/);
  assert.equal(bus.getSnapshot().nodes.find((node) => node.id === 'outside')?.params.value, 1);
  assert.equal(bus.getSnapshot().revision, 10);
  assert.equal(bus.getHistory().length, 0);

  const allowedAdd = bus.dispatch({
    actor: aiActor,
    command: {
      type: 'node.add',
      scopeGroupId: 'ai-space:agent',
      node: {
        id: 'agent:first',
        type: 'number',
        position: { x: 30, y: 0 },
        config: { value: 2 },
        inputValues: {},
        outputValues: {},
      },
    },
  });
  assert.equal(allowedAdd.ok, true);

  const deniedBudget = bus.dispatch({
    actor: aiActor,
    command: {
      type: 'node.add',
      scopeGroupId: 'ai-space:agent',
      node: {
        id: 'agent:second',
        type: 'number',
        position: { x: 60, y: 0 },
        config: { value: 3 },
        inputValues: {},
        outputValues: {},
      },
    },
  });
  assert.equal(deniedBudget.ok, false);
  assert.equal(deniedBudget.stage, 'policy');
  assert.match(deniedBudget.message, /AI Space budget/);
  assert.equal(
    bus.getSnapshot().nodes.some((node) => node.id === 'agent:second'),
    false
  );
});

test('AI sandbox rejects node.add for node types disabled by the AI Space policy', () => {
  const bus = createSemanticCommandBus({
    graph,
    groups: [
      {
        ...agentGroup,
        agentPolicy: {
          ...agentGroup.agentPolicy,
          targetScope: {
            ...agentGroup.agentPolicy.targetScope,
            allowedNodeTypes: ['string'],
            deniedNodeTypes: ['number'],
          },
        },
      },
    ],
    definitions,
    policy: createGroupSovereigntyPolicy(),
    revision: 10,
  });

  const denied = bus.dispatch({
    actor: aiActor,
    command: {
      type: 'node.add',
      scopeGroupId: 'ai-space:agent',
      node: {
        id: 'agent:number',
        type: 'number',
        position: { x: 30, y: 0 },
        config: { value: 2 },
        inputValues: {},
        outputValues: {},
      },
    },
  });

  assert.equal(denied.ok, false);
  assert.equal(denied.stage, 'policy');
  assert.match(denied.message, /node type number/i);
  assert.equal(
    bus.getSnapshot().nodes.some((node) => node.id === 'agent:number'),
    false
  );
});

test('Group agent policy metadata rejects invalid budgets during validation', () => {
  const bus = createBus();

  const invalid = bus.dispatch({
    actor: { id: 'manager-a', role: 'manager' },
    command: {
      type: 'group.update',
      groupId: 'ai-space:agent',
      patch: {
        agentPolicy: {
          budgets: {
            maxNodes: -1,
          },
        },
      },
    },
  });

  assert.equal(invalid.ok, false);
  assert.equal(invalid.stage, 'dry-run');
  assert.equal(invalid.validationErrors?.[0]?.code, 'POLICY.INVALID_AGENT_POLICY');
  assert.match(invalid.message, /maxNodes/);
});
