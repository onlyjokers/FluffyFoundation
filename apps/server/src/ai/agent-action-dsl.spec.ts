/**
 * Purpose: Verify AI action-plan parsing accepts common model field aliases before semantic compilation.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { SemanticGraphSnapshot, SemanticGroup } from '@shugu/node-core';
import { compileAgentPlan, parseAgentPlan } from './agent-action-dsl.js';

const targetSpace: SemanticGroup = {
  id: 'ai-space:test',
  parentId: null,
  kind: 'ai-space',
  name: 'Test AI Space',
  nodeIds: ['source-a'],
  disabled: false,
  surface: 'internal',
  visibility: { defaultAccess: 'visible-readonly' },
  agentPolicy: {
    enabled: true,
    allowedActorIds: ['ai-orchestrator'],
    allowedCommands: ['node.add', 'node.connect'],
    targetScope: {
      nodeIds: ['source-a'],
      allowNewNodes: true,
    },
  },
};

const snapshot: SemanticGraphSnapshot = {
  revision: 1,
  nodes: [
    {
      id: 'source-a',
      type: 'number',
      params: { value: 1 },
      inputValues: {},
      outputValues: {},
    },
  ],
  definitions: [
    {
      type: 'number',
      label: 'Number',
      category: 'Inputs',
      ports: {
        inputs: [],
        outputs: [{ id: 'value', label: 'Value', type: 'number' }],
      },
      params: [{ key: 'value', label: 'Value', type: 'number', defaultValue: 0 }],
    },
    {
      type: 'client-loader',
      label: 'Client Loader',
      category: 'Client Loader',
      ports: {
        inputs: [{ id: 'range', label: 'Range', type: 'number' }],
        outputs: [],
      },
      params: [],
    },
  ],
  customDefinitions: [],
  agentCapabilities: { version: 1, nodes: [] },
  connections: [],
  groups: [targetSpace],
  partitions: [],
  runtimeStatus: { running: false, deployedPartitionIds: [] },
  deviceCapabilities: [],
  errors: [],
  permissions: [],
};

test('AI action DSL accepts addNode/connect aliases emitted by models', () => {
  const parsed = parseAgentPlan(
    {
      version: 1,
      id: 'turn-create-client',
      actions: [
        { op: 'addNode', nodeId: 'client-new', type: 'client-loader' },
        {
          op: 'connect',
          from: { nodeId: 'source-a', portId: 'value' },
          to: { nodeId: 'client-new', portId: 'range' },
        },
      ],
    },
    ''
  );

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const compiled = compileAgentPlan({
    plan: parsed.value,
    snapshot,
    targetSpace,
  });

  assert.equal(compiled.ok, true);
  if (!compiled.ok) return;
  assert.deepEqual(
    compiled.commands.map((command) => command.type),
    ['node.add', 'node.connect']
  );
  assert.deepEqual(compiled.commands[0], {
    type: 'node.add',
    scopeGroupId: 'ai-space:test',
    node: {
      id: 'client-new',
      type: 'client-loader',
      position: { x: 0, y: 0 },
      config: {},
      inputValues: {},
      outputValues: {},
    },
  });
  const connectCommand = compiled.commands[1];
  assert.equal(connectCommand.type, 'node.connect');
  if (connectCommand.type !== 'node.connect') return;
  assert.match(String(connectCommand.connection.id), /^ai:conn:/);
  assert.deepEqual(
    {
      type: connectCommand.type,
      scopeGroupId: connectCommand.scopeGroupId,
      connection: connectCommand.connection,
    },
    {
      type: 'node.connect',
      scopeGroupId: 'ai-space:test',
      connection: {
        id: connectCommand.connection.id,
        sourceNodeId: 'source-a',
        sourcePortId: 'value',
        targetNodeId: 'client-new',
        targetPortId: 'range',
      },
    }
  );
});

test('AI action DSL rejects node types disabled in agent capability settings', () => {
  const parsed = parseAgentPlan(
    {
      version: 1,
      id: 'turn-create-number',
      actions: [{ op: 'addNode', nodeId: 'number-new', type: 'number' }],
    },
    ''
  );

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const compiled = compileAgentPlan({
    plan: parsed.value,
    snapshot: {
      ...snapshot,
      agentCapabilities: {
        version: 1,
        nodes: [{ nodeType: 'number', enabled: false, source: 'builtin' }],
      },
    },
    targetSpace,
  });

  assert.equal(compiled.ok, false);
  if (compiled.ok) return;
  assert.equal(compiled.path, 'actions.0.nodeType');
  assert.match(compiled.error, /disabled/i);
});
