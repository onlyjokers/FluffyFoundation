/**
 * Purpose: Verify AI capability manifests expose createable node types without leaking disabled types or canvas layout.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCapabilityManifest } from './agent-capability-manifest.js';

test('manifest includes policy-allowed createable node types even when not yet in the AI Space', () => {
  const snapshot = {
    revision: 1,
    nodes: [
      {
        id: 'message',
        type: 'string',
        params: { value: 'hello' },
        inputValues: {},
        outputValues: {},
      },
    ],
    definitions: [
      {
        type: 'string',
        label: 'String',
        category: 'Values',
        ports: { inputs: [], outputs: [{ id: 'value', type: 'string' }] },
        params: [{ key: 'value', type: 'string', defaultValue: '' }],
      },
      {
        type: 'number',
        label: 'Number',
        category: 'Values',
        ports: { inputs: [], outputs: [{ id: 'value', type: 'number' }] },
        params: [{ key: 'value', type: 'number', min: 0, max: 100, defaultValue: 1 }],
      },
      {
        type: 'network-fetch',
        label: 'Network Fetch',
        category: 'Network',
        ports: { inputs: [], outputs: [] },
        params: [],
      },
    ],
    connections: [],
    groups: [],
    runtimeStatus: { running: false, deployedPartitionIds: [] },
    deviceCapabilities: [],
    errors: [],
    permissions: [],
    proposals: [],
  };
  const targetSpace = {
    id: 'ai-space:test',
    parentId: null,
    kind: 'ai-space' as const,
    name: 'Test Space',
    nodeIds: ['message'],
    disabled: false,
    agentPolicy: {
      enabled: true,
      allowedCommands: ['node.add', 'node.params.update'],
      targetScope: {
        nodeIds: ['message'],
        allowNewNodes: true,
        allowedNodeTypes: ['string', 'number'],
        deniedNodeTypes: ['network-fetch'],
      },
    },
  };

  const manifest = buildCapabilityManifest(snapshot as never, targetSpace as never) as {
    nodeTypes: Array<{ type: string }>;
    createableNodeTypes: Array<{ type: string }>;
  };

  assert.deepEqual(
    manifest.nodeTypes.map((definition) => definition.type).sort(),
    ['number', 'string']
  );
  assert.deepEqual(
    manifest.createableNodeTypes.map((definition) => definition.type).sort(),
    ['number', 'string']
  );
});

test('manifest hides node types disabled by agent capability settings', () => {
  const snapshot = {
    revision: 1,
    nodes: [
      {
        id: 'message',
        type: 'string',
        params: { value: 'hello' },
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'count',
        type: 'number',
        params: { value: 1 },
        inputValues: {},
        outputValues: {},
      },
    ],
    definitions: [
      {
        type: 'string',
        label: 'String',
        category: 'Values',
        ports: { inputs: [], outputs: [{ id: 'value', type: 'string' }] },
        params: [{ key: 'value', type: 'string', defaultValue: '' }],
      },
      {
        type: 'number',
        label: 'Number',
        category: 'Values',
        ports: { inputs: [], outputs: [{ id: 'value', type: 'number' }] },
        params: [{ key: 'value', type: 'number', min: 0, max: 100, defaultValue: 1 }],
      },
    ],
    customDefinitions: [],
    agentCapabilities: {
      version: 1,
      nodes: [{ nodeType: 'number', enabled: false, source: 'builtin' }],
    },
    connections: [],
    groups: [],
    runtimeStatus: { running: false, deployedPartitionIds: [] },
    deviceCapabilities: [],
    errors: [],
    permissions: [],
    proposals: [],
  };
  const targetSpace = {
    id: 'ai-space:test',
    parentId: null,
    kind: 'ai-space' as const,
    name: 'Test Space',
    nodeIds: ['message', 'count'],
    disabled: false,
    agentPolicy: {
      enabled: true,
      allowedCommands: ['node.add', 'node.params.update'],
      targetScope: {
        nodeIds: ['message', 'count'],
        allowNewNodes: true,
        allowedNodeTypes: ['string', 'number'],
      },
    },
  };

  const manifest = buildCapabilityManifest(snapshot as never, targetSpace as never) as {
    nodeTypes: Array<{ type: string }>;
    createableNodeTypes: Array<{ type: string }>;
    disabledNodeTypes: Array<{ type: string; reason?: string }>;
  };

  assert.deepEqual(manifest.nodeTypes.map((definition) => definition.type), ['string']);
  assert.deepEqual(manifest.createableNodeTypes.map((definition) => definition.type), ['string']);
  assert.deepEqual(manifest.disabledNodeTypes, [{ type: 'number' }]);
});

test('manifest exposes connectable config inputs with option metadata', () => {
  const snapshot = {
    revision: 1,
    nodes: [
      {
        id: 'scene',
        type: 'scene-fct-track',
        params: { variant: 'shattered-reality' },
        inputValues: {},
        outputValues: {},
      },
    ],
    definitions: [
      {
        type: 'scene-fct-track',
        label: 'Scene FCT Track',
        category: 'Scene',
        ports: {
          inputs: [
            { id: 'in', label: 'In', type: 'scene' },
            {
              id: 'variant',
              label: 'Variant',
              type: 'string',
              defaultValue: 'shattered-reality',
              options: [
                { value: 'shattered-reality', label: 'Shattered Reality' },
                { value: 'acab', label: 'ACAB' },
              ],
            },
          ],
          outputs: [{ id: 'out', label: 'Out', type: 'scene' }],
        },
        params: [
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
    customDefinitions: [],
    agentCapabilities: { version: 1, nodes: [] },
    connections: [],
    groups: [],
    runtimeStatus: { running: false, deployedPartitionIds: [] },
    deviceCapabilities: [],
    errors: [],
    permissions: [],
    proposals: [],
  };
  const targetSpace = {
    id: 'ai-space:test',
    parentId: null,
    kind: 'ai-space' as const,
    name: 'Test Space',
    nodeIds: ['scene'],
    disabled: false,
    agentPolicy: {
      enabled: true,
      allowedCommands: ['node.connect', 'node.inputs.update'],
      targetScope: { nodeIds: ['scene'] },
    },
  };

  const manifest = buildCapabilityManifest(snapshot as never, targetSpace as never) as {
    nodeTypes: Array<{ type: string; ports: { inputs: Array<Record<string, unknown>> } }>;
  };

  assert.deepEqual(
    manifest.nodeTypes[0].ports.inputs.find((input) => input.id === 'variant')?.options,
    [
      { value: 'shattered-reality', label: 'Shattered Reality' },
      { value: 'acab', label: 'ACAB' },
    ]
  );
});
