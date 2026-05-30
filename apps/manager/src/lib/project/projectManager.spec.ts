/**
 * Purpose: Verify local project persistence preserves graph metadata needed by server sync.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { NodeGroup } from '$lib/components/nodes/node-canvas/controllers/group-controller';
import { parseProjectGroupsFromStorage, serializeProjectGroupsForStorage } from './project-groups-storage.js';

test('project group storage preserves AI Space agent metadata', () => {
  const groups: NodeGroup[] = [
    {
      id: 'ai-space:demo',
      parentId: null,
      name: 'Agent Space',
      kind: 'ai-space',
      nodeIds: ['input', 'executor'],
      disabled: false,
      minimized: false,
      runtimeActive: true,
      agentInterface: {
        eventBindings: ['client.text.final'],
        callableCommands: ['node.params.update'],
      },
      agentPolicy: {
        enabled: true,
        allowedCommands: ['node.params.update'],
        targetScope: { nodeIds: ['input'], allowNewNodes: false },
      },
    } as NodeGroup,
  ];

  const restored = parseProjectGroupsFromStorage(serializeProjectGroupsForStorage(groups));

  assert.equal(restored.length, 1);
  assert.equal(restored[0].kind, 'ai-space');
  assert.deepEqual(restored[0].agentInterface, groups[0].agentInterface);
  assert.deepEqual(restored[0].agentPolicy, groups[0].agentPolicy);
  assert.equal(restored[0].runtimeActive, true);
});
