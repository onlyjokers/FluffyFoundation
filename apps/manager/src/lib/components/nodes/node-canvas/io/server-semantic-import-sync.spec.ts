/**
 * Purpose: Verify imported Node Graph state is converted into Server semantic graph.replace commands.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { NodeGroup } from '../controllers/group-controller';
import { createImportedGraphReplaceCommand } from './server-semantic-import-sync.js';

test('createImportedGraphReplaceCommand preserves imported AI Space metadata', () => {
  const groups: NodeGroup[] = [
    {
      id: 'ai-space:demo',
      parentId: null,
      name: 'AI Space Demo',
      kind: 'ai-space',
      nodeIds: ['node:message'],
      disabled: false,
      minimized: false,
      agentInterface: {
        publicInputs: [{ id: 'client_text', type: 'string', label: 'Client Text' }],
        publicOutputs: [{ id: 'message', type: 'string', label: 'Message' }],
        exposedNodeIds: ['node:message'],
        callableCommands: ['node.params.update'],
        eventBindings: ['client.text.final'],
      },
      agentPolicy: {
        enabled: true,
        allowedCommands: ['node.params.update'],
        targetScope: { nodeIds: ['node:message'], allowNewNodes: false },
      },
    } as NodeGroup,
  ];

  const command = createImportedGraphReplaceCommand({
    graph: {
      nodes: [
        {
          id: 'node:message',
          type: 'string',
          position: { x: 10, y: 20 },
          config: { value: '你好' },
          inputValues: {},
          outputValues: { value: 'stale' },
        },
      ],
      connections: [],
    },
    groups,
  });

  assert.equal(command.kind, 'graph.replace');
  assert.deepEqual(command.graph.nodes[0], {
    id: 'node:message',
    type: 'string',
    position: { x: 10, y: 20 },
    config: { value: '你好' },
    inputValues: {},
    outputValues: {},
  });
  assert.equal(command.groups?.[0]?.kind, 'ai-space');
  assert.deepEqual(command.groups?.[0]?.agentInterface, groups[0].agentInterface);
  assert.deepEqual(command.groups?.[0]?.agentPolicy, groups[0].agentPolicy);
});
