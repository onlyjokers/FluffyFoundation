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
  assert.deepEqual(groups[0].agentInterface, aiInterface);
  assert.deepEqual(groups[0].agentPolicy, aiPolicy);
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
  assert.deepEqual(groups[0].agentInterface, aiInterface);
  assert.deepEqual(groups[0].agentPolicy, aiPolicy);
});

test('template import payload classifier recognizes the AI Agent demo as a node graph', () => {
  const parsed = readAiAgentDemoTemplate();

  assert.equal(getTemplateImportPayloadKind(parsed), 'node-graph');
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
