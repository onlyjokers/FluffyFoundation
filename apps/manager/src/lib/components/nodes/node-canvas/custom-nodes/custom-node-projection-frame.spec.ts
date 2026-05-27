// Purpose: Verify Custom Node expanded projection frames use real rendered node bounds.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GraphState } from '$lib/nodes/types';
import type { NodeBounds } from '../adapters';
import { buildCustomNodeProjectionFrame } from './custom-node-projection-frame';

test('buildCustomNodeProjectionFrame wraps every projected node using adapter bounds', () => {
  const projection: GraphState = {
    nodes: [
      {
        id: 'view:custom:custom-1:track',
        type: 'scene-fct-track',
        position: { x: 100, y: 100 },
        config: { projectionOwnerNodeId: 'custom-1' },
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'view:custom:custom-1:client',
        type: 'client-loader',
        position: { x: 560, y: 130 },
        config: { projectionOwnerNodeId: 'custom-1' },
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [],
  };

  const boundsByNodeId = new Map<string, NodeBounds>([
    ['view:custom:custom-1:track', { left: 100, top: 100, right: 370, bottom: 740 }],
    ['view:custom:custom-1:client', { left: 560, top: 130, right: 850, bottom: 680 }],
  ]);

  const frame = buildCustomNodeProjectionFrame({
    ownerId: 'custom-1',
    groupId: 'group-1',
    name: 'Group 1',
    disabled: false,
    projection,
    getNodeBounds: (nodeId) => boundsByNodeId.get(nodeId) ?? null,
  });

  assert.deepEqual(
    frame && { left: frame.left, top: frame.top, width: frame.width, height: frame.height },
    { left: 48, top: 36, width: 854, height: 756 }
  );
});

test('buildCustomNodeProjectionFrame wraps projected internal group frames with breathing room', () => {
  const projection: GraphState = {
    nodes: [
      {
        id: 'view:custom:custom-1:inner-a',
        type: 'client-button',
        position: { x: 180, y: 220 },
        config: { projectionOwnerNodeId: 'custom-1' },
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'view:custom:custom-1:inner-b',
        type: 'cmd-aggregator',
        position: { x: 620, y: 520 },
        config: { projectionOwnerNodeId: 'custom-1' },
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [],
    groups: [
      {
        id: 'view:custom:custom-1:group:group-1',
        parentId: null,
        name: 'Group 1',
        nodeIds: ['view:custom:custom-1:inner-a', 'view:custom:custom-1:inner-b'],
        disabled: false,
        minimized: false,
      },
    ],
  };

  const boundsByNodeId = new Map<string, NodeBounds>([
    ['view:custom:custom-1:inner-a', { left: 180, top: 220, right: 330, bottom: 300 }],
    ['view:custom:custom-1:inner-b', { left: 620, top: 520, right: 840, bottom: 640 }],
  ]);

  const frame = buildCustomNodeProjectionFrame({
    ownerId: 'custom-1',
    groupId: 'group-outer',
    name: 'Custom Node',
    disabled: false,
    projection,
    getNodeBounds: (nodeId) => boundsByNodeId.get(nodeId) ?? null,
  });

  assert.deepEqual(
    frame && { left: frame.left, top: frame.top, width: frame.width, height: frame.height },
    { left: 76, top: 92, width: 868, height: 652 }
  );
});

test('buildCustomNodeProjectionFrame includes parent projection groups without direct nodes', () => {
  const projection: GraphState = {
    nodes: [
      {
        id: 'view:custom:custom-1:inner-a',
        type: 'client-button',
        position: { x: 220, y: 260 },
        config: { projectionOwnerNodeId: 'custom-1' },
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [],
    groups: [
      {
        id: 'view:custom:custom-1:group:outer',
        parentId: null,
        name: 'Outer',
        nodeIds: [],
        disabled: false,
        minimized: false,
      },
      {
        id: 'view:custom:custom-1:group:inner',
        parentId: 'view:custom:custom-1:group:outer',
        name: 'Inner',
        nodeIds: ['view:custom:custom-1:inner-a'],
        disabled: false,
        minimized: false,
      },
    ],
  };

  const frame = buildCustomNodeProjectionFrame({
    ownerId: 'custom-1',
    groupId: 'group-outer',
    name: 'Custom Node',
    disabled: false,
    projection,
    getNodeBounds: (nodeId) =>
      nodeId === 'view:custom:custom-1:inner-a'
        ? { left: 220, top: 260, right: 360, bottom: 340 }
        : null,
  });

  assert.deepEqual(
    frame && { left: frame.left, top: frame.top, width: frame.width, height: frame.height },
    { left: 80, top: 78, width: 420, height: 406 }
  );
});
