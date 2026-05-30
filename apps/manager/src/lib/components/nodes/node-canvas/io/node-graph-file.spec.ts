/**
 * Purpose: Regression tests for node graph file parsing and AI Space metadata preservation.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import type { NodeGroup } from '../controllers/group-controller';
import {
  getTemplateImportPayloadKind,
  parseNodeGraphFile,
  remapImportedGroups,
  serializeNodeGroups,
} from './node-graph-file.js';

const aiInterface = {
  publicInputs: [{ id: 'voice_in', type: 'string', label: 'Voice Input' }],
  publicOutputs: [{ id: 'display_out', type: 'string', label: 'Display Output' }],
  exposedNodeIds: ['n-display'],
  callableCommands: ['node.params.update'],
  eventBindings: ['client.joined', 'client.text.final'],
};

const aiPolicy = {
  enabled: true,
  allowedCommands: ['node.params.update', 'group.update'],
  deniedSurfaces: ['network'],
  targetScope: { allowNewNodes: true, nodeIds: ['n-display'] },
  budgets: {
    maxNodes: 8,
    maxConnections: 8,
    maxParamsPerCommand: 4,
    maxCommandsPerTurn: 4,
    maxRetries: 1,
  },
  approvalRequired: false,
  rollbackOnReject: true,
};

function readAiAgentDemoTemplate(): unknown {
  const path = fileURLToPath(
    new URL('../../../../../../../../docs/templates/ai-agent-demo-template.json', import.meta.url)
  );
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

test('parsed and remapped graph AI spaces keep AI metadata', () => {
  const parsed = parseNodeGraphFile({
    version: 2,
    kind: 'node-graph',
    graph: {
      nodes: [{ id: 'n-display', type: 'note', position: { x: 0, y: 0 }, config: {} }],
      connections: [],
    },
    groups: [
      {
        id: 'g-ai',
        parentId: null,
        kind: 'ai-space',
        name: 'AI Space',
        nodeIds: ['n-display'],
        disabled: false,
        minimized: false,
        agentInterface: aiInterface,
        agentPolicy: aiPolicy,
      },
    ],
  });

  assert.ok(parsed);
  const { groups } = remapImportedGroups(
    parsed.groups,
    new Map([['n-display', 'node:new-display']]),
    (group) => (group?.kind === 'ai-space' ? 'ai-space:new-ai' : 'group:new-ai')
  );

  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, 'ai-space:new-ai');
  assert.equal(groups[0].kind, 'ai-space');
  assert.deepEqual(groups[0].nodeIds, ['node:new-display']);
  assert.deepEqual(groups[0].agentInterface, {
    ...aiInterface,
    exposedNodeIds: ['node:new-display'],
    callableCommands: [
      'node.params.update',
      'node.inputs.update',
      'node.add',
      'node.connect',
      'node.disconnect',
      'node.remove',
    ],
    eventBindings: ['client.text.final'],
  });
  assert.deepEqual(groups[0].agentPolicy, {
    ...aiPolicy,
    allowedCommands: [
      'node.params.update',
      'group.update',
      'node.inputs.update',
      'node.add',
      'node.connect',
      'node.disconnect',
      'node.remove',
    ],
    targetScope: { ...aiPolicy.targetScope, nodeIds: ['node:new-display'] },
    budgets: {
      maxNodes: 128,
      maxConnections: 256,
      maxParamsPerCommand: 32,
      maxCommandsPerTurn: 64,
      maxRetries: 2,
    },
  });
});

test('remapped graph AI spaces rewrite scoped AI metadata node ids', () => {
  const { groups } = remapImportedGroups(
    [
      {
        id: 'g-ai',
        parentId: null,
        kind: 'ai-space',
        name: 'AI Space',
        nodeIds: ['n-display', 'n-input'],
        disabled: false,
        minimized: false,
        agentInterface: {
          ...aiInterface,
          exposedNodeIds: ['n-display', 'n-input', 'missing-node'],
        },
        agentPolicy: {
          ...aiPolicy,
          targetScope: {
            ...aiPolicy.targetScope,
            nodeIds: ['n-display', 'n-input', 'missing-node'],
            allowedNodeTypes: ['string'],
            deniedNodeTypes: ['network'],
          },
        },
      } as NodeGroup,
    ],
    new Map([
      ['n-display', 'node:new-display'],
      ['n-input', 'node:new-input'],
    ]),
    (group) => (group?.kind === 'ai-space' ? 'ai-space:new-ai' : 'group:new-ai')
  );

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].nodeIds, ['node:new-display', 'node:new-input']);
  assert.deepEqual(groups[0].agentInterface?.exposedNodeIds, [
    'node:new-display',
    'node:new-input',
  ]);
  assert.deepEqual(groups[0].agentInterface?.eventBindings, ['client.text.final']);
  assert.deepEqual(groups[0].agentPolicy?.targetScope?.nodeIds, [
    'node:new-display',
    'node:new-input',
  ]);
  assert.deepEqual(groups[0].agentPolicy?.targetScope?.allowedNodeTypes, ['string']);
  assert.deepEqual(groups[0].agentPolicy?.targetScope?.deniedNodeTypes, ['network']);
});

test('AI spaces expose all member nodes after remap even when legacy metadata is stale', () => {
  const { groups } = remapImportedGroups(
    [
      {
        id: 'g-ai',
        parentId: null,
        kind: 'ai-space',
        name: 'AI Space',
        nodeIds: ['n-display', 'n-input'],
        disabled: false,
        minimized: false,
        agentInterface: {
          ...aiInterface,
          exposedNodeIds: ['n-display'],
        },
        agentPolicy: {
          ...aiPolicy,
          targetScope: { ...aiPolicy.targetScope, nodeIds: ['n-display'] },
        },
      } as NodeGroup,
    ],
    new Map([
      ['n-display', 'node:new-display'],
      ['n-input', 'node:new-input'],
    ]),
    (group) => (group?.kind === 'ai-space' ? 'ai-space:new-ai' : 'group:new-ai')
  );

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].agentInterface?.exposedNodeIds, [
    'node:new-display',
    'node:new-input',
  ]);
  assert.deepEqual(groups[0].agentPolicy?.targetScope?.nodeIds, [
    'node:new-display',
    'node:new-input',
  ]);
});

test('AI spaces upgrade legacy command surface and budgets without lowering existing limits', () => {
  const [group] = serializeNodeGroups([
    {
      id: 'g-ai',
      parentId: null,
      kind: 'ai-space',
      name: 'AI Space',
      nodeIds: ['n-display'],
      disabled: false,
      minimized: false,
      agentInterface: {
        ...aiInterface,
        callableCommands: ['node.params.update'],
      },
      agentPolicy: {
        ...aiPolicy,
        allowedCommands: ['node.params.update'],
        budgets: {
          maxNodes: 512,
          maxConnections: 8,
          maxParamsPerCommand: 4,
          maxCommandsPerTurn: 4,
          maxRetries: 1,
        },
      },
    } as NodeGroup,
  ]);

  assert.deepEqual(group?.agentInterface?.callableCommands, [
    'node.params.update',
    'node.inputs.update',
    'node.add',
    'node.connect',
    'node.disconnect',
    'node.remove',
  ]);
  assert.deepEqual(group?.agentPolicy?.allowedCommands, [
    'node.params.update',
    'node.inputs.update',
    'node.add',
    'node.connect',
    'node.disconnect',
    'node.remove',
  ]);
  assert.deepEqual(group?.agentPolicy?.budgets, {
    maxNodes: 512,
    maxConnections: 256,
    maxParamsPerCommand: 32,
    maxCommandsPerTurn: 64,
    maxRetries: 2,
  });
  assert.deepEqual(group?.agentPolicy?.deniedSurfaces, ['network']);
});

test('serialized graph AI spaces keep AI metadata', () => {
  const groups = serializeNodeGroups([
    {
      id: 'g-ai',
      parentId: null,
      kind: 'ai-space',
      name: 'AI Space',
      nodeIds: ['n-display'],
      disabled: false,
      minimized: false,
      agentInterface: aiInterface,
      agentPolicy: aiPolicy,
    } as NodeGroup,
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].kind, 'ai-space');
  assert.deepEqual(groups[0].agentInterface, {
    ...aiInterface,
    callableCommands: [
      'node.params.update',
      'node.inputs.update',
      'node.add',
      'node.connect',
      'node.disconnect',
      'node.remove',
    ],
    eventBindings: ['client.text.final'],
  });
  assert.deepEqual(groups[0].agentPolicy, {
    ...aiPolicy,
    allowedCommands: [
      'node.params.update',
      'group.update',
      'node.inputs.update',
      'node.add',
      'node.connect',
      'node.disconnect',
      'node.remove',
    ],
    budgets: {
      maxNodes: 128,
      maxConnections: 256,
      maxParamsPerCommand: 32,
      maxCommandsPerTurn: 64,
      maxRetries: 2,
    },
  });
});

test('template import payload classifier recognizes the AI Agent demo as a node graph', () => {
  const parsed = readAiAgentDemoTemplate();

  assert.equal(getTemplateImportPayloadKind(parsed), 'node-graph');
  const aiSpace = (parsed as { groups?: Array<{ agentInterface?: { callableCommands?: string[] }; agentPolicy?: { allowedCommands?: string[]; budgets?: Record<string, number> } }> }).groups?.find(
    (group) => group.agentPolicy?.allowedCommands?.includes('node.params.update')
  );
  assert.equal(aiSpace?.agentInterface?.callableCommands?.includes('node.inputs.update'), true);
  assert.equal(aiSpace?.agentPolicy?.allowedCommands?.includes('node.inputs.update'), true);
  assert.equal((aiSpace?.agentPolicy?.budgets?.maxNodes ?? 0) >= 128, true);
  assert.equal((aiSpace?.agentPolicy?.budgets?.maxCommandsPerTurn ?? 0) >= 64, true);
});

test('parsed node graph files preserve embedded custom node definitions', () => {
  const parsed = parseNodeGraphFile({
    version: 2,
    kind: 'node-graph',
    graph: {
      nodes: [
        {
          id: 'custom-1',
          type: 'custom:def-1',
          position: { x: 0, y: 0 },
          config: {},
        },
      ],
      connections: [],
    },
    customNodes: [
      {
        definitionId: 'def-1',
        name: 'Nested UI',
        template: { nodes: [], connections: [] },
        ports: [],
      },
    ],
  });

  assert.ok(parsed);
  assert.equal(parsed.customNodes.length, 1);
  assert.deepEqual(parsed.customNodes[0], {
    definitionId: 'def-1',
    name: 'Nested UI',
    template: { nodes: [], connections: [] },
    ports: [],
  });
});

test('AI Agent demo template uses current display-object routing defaults', () => {
  const parsed = readAiAgentDemoTemplate() as {
    graph?: { nodes?: Array<{ id?: string; type?: string; config?: unknown; inputValues?: unknown }> };
    groups?: Array<{ agentInterface?: { callableCommands?: string[] }; agentPolicy?: { allowedCommands?: string[] } }>;
  };
  const displayNode = parsed.graph?.nodes?.find((node) => node.id === 'n-display');
  assert.equal(displayNode?.type, 'display-object');
  assert.deepEqual(displayNode?.config, { displayId: '' });
  assert.deepEqual(displayNode?.inputValues, { index: 1, range: 1, random: false });

  const aiSpace = parsed.groups?.[0];
  assert.equal(aiSpace?.agentInterface?.callableCommands?.includes('node.remove'), true);
  assert.equal(aiSpace?.agentPolicy?.allowedCommands?.includes('node.remove'), true);
});
