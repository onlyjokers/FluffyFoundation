// Purpose: Verify live SDK semantic messages are handled through the Manager semantic bridge.
import assert from 'node:assert/strict';
import { writable } from 'svelte/store';
import { test } from 'node:test';

import { bindManagerSemanticSdk, type SemanticSdkBindingTarget } from './manager-semantic-sdk-binding';
import { createManagerSemanticBridge } from './manager-semantic-bridge';
import type { NodeInstance } from '$lib/nodes/types';
import type { NodeDefinition, SemanticCommand } from '@shugu/node-core';
import type { SemanticMessage } from '@shugu/protocol';

const definitions: NodeDefinition[] = [
  {
    type: 'number',
    label: 'Number',
    category: 'Values',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [{ key: 'value', type: 'number', label: 'Value', default: 0, min: 0, max: 3 }],
  },
];

function createRuntime() {
  const nodes: NodeInstance[] = [
    {
      id: 'n1',
      type: 'number',
      position: { x: 0, y: 0 },
      config: {},
      inputValues: {},
      outputValues: {},
    },
  ];

  return {
    nodes,
    runtime: {
      nodeEngine: {
        exportGraph: () => ({ nodes: nodes.map((node) => ({ ...node })), connections: [] }),
        addNode: (node: NodeInstance) => {
          nodes.push({ ...node });
        },
        addConnection: () => undefined,
        removeNode: (nodeId: string) => {
          const index = nodes.findIndex((candidate) => candidate.id === nodeId);
          if (index >= 0) nodes.splice(index, 1);
        },
        updateNodeConfig: (nodeId: string, patch: Record<string, unknown>) => {
          const node = nodes.find((candidate) => candidate.id === nodeId);
          if (node) node.config = { ...(node.config ?? {}), ...patch };
        },
        lastError: writable<string | null>(null),
      },
      nodeRegistry: { list: () => definitions },
      getGroups: () => [],
      getPartitions: () => [],
      isRunningStore: writable(false),
      lastErrorStore: writable<string | null>(null),
    },
  };
}

test('bindManagerSemanticSdk dispatches semantic SDK commands and replies with semantic-result', () => {
  let semanticHandler: Parameters<SemanticSdkBindingTarget['onSemanticCommand']>[0] | null = null;
  const replies: unknown[] = [];
  const unsubscribeCalls: string[] = [];
  const { runtime, nodes } = createRuntime();

  const sdk = {
    onSemanticCommand: (handler: Parameters<SemanticSdkBindingTarget['onSemanticCommand']>[0]) => {
      semanticHandler = handler;
      return () => unsubscribeCalls.push('semantic');
    },
    sendSemanticResult: (message: Parameters<SemanticSdkBindingTarget['sendSemanticResult']>[0]) => replies.push(message),
  };

  const unsubscribe = bindManagerSemanticSdk({
    sdk: sdk as never,
    bridge: createManagerSemanticBridge(runtime),
  });

  semanticHandler?.({
    type: 'semantic',
    version: 1,
    serverTimestamp: 1,
    target: { mode: 'manager' },
    actor: 'cli',
    role: 'manager',
    command: { kind: 'node.params.update', nodeId: 'n1', params: { value: 4 } },
    requestId: 'semantic-live-1',
  } satisfies SemanticMessage);

  assert.deepEqual(nodes[0]?.config, { value: 3 });
  assert.equal(replies.length, 1);
  assert.equal((replies[0] as { requestId?: string }).requestId, 'semantic-live-1');
  assert.equal((replies[0] as { ok?: boolean }).ok, true);
  assert.deepEqual((replies[0] as { warnings?: unknown[] }).warnings, [
    {
      code: 'SEMANTIC.PARAM_CLAMPED',
      path: 'nodes.n1.params.value',
      message: 'Parameter value was clamped from 4 to 3.',
    },
  ]);

  unsubscribe();
  assert.deepEqual(unsubscribeCalls, ['semantic']);
});
