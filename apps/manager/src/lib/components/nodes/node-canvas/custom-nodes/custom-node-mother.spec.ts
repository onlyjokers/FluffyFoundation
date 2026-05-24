// Purpose: Verify Custom Node mother instances can be reintroduced from persisted definitions.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCustomNodeMotherInstance } from './custom-node-mother';

test('createCustomNodeMotherInstance creates a mother from a persisted definition', () => {
  const node = createCustomNodeMotherInstance({
    definition: {
      definitionId: 'pulse',
      name: 'Pulse',
      template: {
        nodes: [
          {
            id: 'inner',
            type: 'float',
            position: { x: 10, y: 20 },
            config: { value: 1 },
            inputValues: {},
            outputValues: { value: 1 },
          },
        ],
        connections: [],
      },
      ports: [],
    },
    nodeId: 'mother-1',
    groupId: 'group:mother',
    type: 'custom:pulse',
    position: { x: 320, y: 240 },
    writeCustomNodeState: (config, state) => ({ ...config, customNode: state }),
  });

  assert.equal(node.id, 'mother-1');
  assert.equal(node.type, 'custom:pulse');
  assert.deepEqual(node.position, { x: 320, y: 240 });
  assert.deepEqual(node.inputValues, { gate: true });
  assert.equal((node.config.customNode as any).definitionId, 'pulse');
  assert.equal((node.config.customNode as any).groupId, 'group:mother');
  assert.equal((node.config.customNode as any).role, 'mother');
  assert.equal((node.config.customNode as any).manualGate, true);
  assert.deepEqual((node.config.customNode as any).internal.nodes[0].outputValues, {});
});

test('createCustomNodeMotherInstance migrates legacy client-object templates', () => {
  const node = createCustomNodeMotherInstance({
    definition: {
      definitionId: 'legacy-client',
      name: 'Legacy Client',
      template: {
        nodes: [
          {
            id: 'cmd',
            type: 'play-media',
            position: { x: 0, y: 0 },
            config: {},
            inputValues: {},
            outputValues: {},
          },
          {
            id: 'client',
            type: 'client-object',
            position: { x: 200, y: 0 },
            config: { clientId: 'client-a' },
            inputValues: { index: 2, range: 1, random: false },
            outputValues: { imageOut: 'stale' },
          },
          {
            id: 'image-consumer',
            type: 'image-preview',
            position: { x: 400, y: 0 },
            config: {},
            inputValues: {},
            outputValues: {},
          },
        ],
        connections: [
          {
            id: 'cmd-to-client',
            sourceNodeId: 'cmd',
            sourcePortId: 'cmd',
            targetNodeId: 'client',
            targetPortId: 'in',
          },
          {
            id: 'client-image',
            sourceNodeId: 'client',
            sourcePortId: 'imageOut',
            targetNodeId: 'image-consumer',
            targetPortId: 'image',
          },
        ],
      },
      ports: [
        {
          portKey: 'imageOut',
          label: 'Image Out',
          side: 'output',
          type: 'image',
          pinned: true,
          y: 0,
          binding: { nodeId: 'client', portId: 'imageOut' },
        },
      ],
    },
    nodeId: 'mother-legacy',
    groupId: 'group:legacy',
    type: 'custom:legacy-client',
    position: { x: 0, y: 0 },
    writeCustomNodeState: (config, state) => ({ ...config, customNode: state }),
  });

  const internal = (node.config.customNode as any).internal;
  assert.equal(internal.nodes.some((candidate: any) => candidate.type === 'client-object'), false);
  assert.equal(internal.nodes.some((candidate: any) => candidate.id === 'client' && candidate.type === 'client-executor'), true);

  const loader = internal.nodes.find((candidate: any) => candidate.id === 'client:loader');
  assert.equal(loader?.type, 'client-loader');
  assert.deepEqual(loader?.config, { clientId: 'client-a' });
  assert.deepEqual(loader?.inputValues, { index: 2, range: 1, random: false });

  assert.ok(
    internal.connections.some(
      (connection: any) =>
        connection.sourceNodeId === 'client:loader' &&
        connection.sourcePortId === 'client' &&
        connection.targetNodeId === 'client' &&
        connection.targetPortId === 'client'
    )
  );
  assert.ok(
    internal.connections.some(
      (connection: any) =>
        connection.sourceNodeId === 'cmd' &&
        connection.sourcePortId === 'cmd' &&
        connection.targetNodeId === 'client' &&
        connection.targetPortId === 'in'
    )
  );
});
