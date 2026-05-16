// Purpose: Tests for app-level server semantic snapshot mirroring and local project migration.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { SemanticGraphSnapshot } from '@shugu/node-core';
import {
  applyServerSemanticSnapshot,
  bindServerSemanticSync,
  createServerSemanticMigrationCoordinator,
  SERVER_SEMANTIC_MIGRATION_KEY,
} from './server-semantic-sync';
import type { GraphState } from '$lib/nodes/types';

const snapshot = (
  nodes: SemanticGraphSnapshot['nodes'],
  connections: SemanticGraphSnapshot['connections'] = []
): SemanticGraphSnapshot => ({
  revision: 7,
  nodes,
  definitions: [],
  connections,
  groups: [],
  partitions: [],
  runtimeStatus: { running: false, deployedPartitionIds: [] },
  deviceCapabilities: [],
  errors: [],
  permissions: [],
});

test('applyServerSemanticSnapshot mirrors server graph into the Manager NodeEngine', () => {
  let loaded: GraphState | null = null;

  applyServerSemanticSnapshot({
    snapshot: snapshot(
      [
        {
          id: 'client-a',
          type: 'client-object',
          params: { label: 'Client A' },
          inputValues: { active: true },
          outputValues: { ready: false },
        },
      ],
      [
        {
          id: 'edge-a',
          sourceNodeId: 'client-a',
          sourcePortId: 'selected',
          targetNodeId: 'display-a',
          targetPortId: 'client',
        },
      ]
    ),
    nodeEngine: {
      loadGraph: (graph) => {
        loaded = graph;
      },
    },
  });

  assert.deepEqual(loaded, {
    nodes: [
      {
        id: 'client-a',
        type: 'client-object',
        position: { x: 0, y: 0 },
        config: { label: 'Client A' },
        inputValues: { active: true },
        outputValues: { ready: false },
      },
    ],
    connections: [
      {
        id: 'edge-a',
        sourceNodeId: 'client-a',
        sourcePortId: 'selected',
        targetNodeId: 'display-a',
        targetPortId: 'client',
      },
    ],
  });
});

test('applyServerSemanticSnapshot preserves local positions while applying semantic node updates', () => {
  let loaded: GraphState | null = null;
  const localGraph: GraphState = {
    nodes: [
      {
        id: 'client-a',
        type: 'client-object',
        position: { x: 321, y: 654 },
        config: { label: 'Old label' },
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [],
  };

  applyServerSemanticSnapshot({
    snapshot: snapshot([
      {
        id: 'client-a',
        type: 'client-object',
        params: { label: 'Client A' },
        inputValues: { active: true },
        outputValues: { ready: false },
      },
      {
        id: 'display-a',
        type: 'display-object',
        params: { label: 'Display A' },
        inputValues: {},
        outputValues: {},
      },
    ]),
    nodeEngine: {
      exportGraph: () => localGraph,
      loadGraph: (graph) => {
        loaded = graph;
      },
    },
  });

  assert.ok(loaded);
  assert.deepEqual(loaded.nodes, [
    {
      id: 'client-a',
      type: 'client-object',
      position: { x: 321, y: 654 },
      config: { label: 'Client A' },
      inputValues: { active: true },
      outputValues: { ready: false },
    },
    {
      id: 'display-a',
      type: 'display-object',
      position: { x: 561, y: 654 },
      config: { label: 'Display A' },
      inputValues: {},
      outputValues: {},
    },
  ]);
});

test('applyServerSemanticSnapshot places newly added server nodes away from existing local nodes', () => {
  let loaded: GraphState | null = null;
  const localGraph: GraphState = {
    nodes: [
      {
        id: 'client-a',
        type: 'client-object',
        position: { x: 321, y: 654 },
        config: {},
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [],
  };

  applyServerSemanticSnapshot({
    snapshot: snapshot([
      {
        id: 'client-a',
        type: 'client-object',
        params: {},
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'client-b',
        type: 'client-object',
        params: {},
        inputValues: {},
        outputValues: {},
      },
    ]),
    nodeEngine: {
      exportGraph: () => localGraph,
      loadGraph: (graph) => {
        loaded = graph;
      },
    },
  });

  assert.ok(loaded);
  assert.deepEqual(
    loaded.nodes.map((node) => node.position),
    [
      { x: 321, y: 654 },
      { x: 561, y: 654 },
    ]
  );
});

test('applyServerSemanticSnapshot patches existing node params without reloading the runtime graph', () => {
  const loaded: GraphState[] = [];
  const updates: Array<{ nodeId: string; config: Record<string, unknown> }> = [];
  const localGraph: GraphState = {
    nodes: [
      {
        id: 'flash-rate',
        type: 'number',
        position: { x: 42, y: 64 },
        config: { value: 3 },
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'flashlight',
        type: 'proc-flashlight',
        position: { x: 120, y: 64 },
        config: { frequencyHz: 3, dutyCycle: 0.5 },
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [
      {
        id: 'rate-to-flash',
        sourceNodeId: 'flash-rate',
        sourcePortId: 'value',
        targetNodeId: 'flashlight',
        targetPortId: 'frequencyHz',
      },
    ],
  };

  applyServerSemanticSnapshot({
    snapshot: snapshot(
      [
        {
          id: 'flash-rate',
          type: 'number',
          params: { value: 100 },
          inputValues: {},
          outputValues: {},
        },
        {
          id: 'flashlight',
          type: 'proc-flashlight',
          params: { frequencyHz: 3, dutyCycle: 0.5 },
          inputValues: {},
          outputValues: {},
        },
      ],
      localGraph.connections
    ),
    nodeEngine: {
      exportGraph: () => localGraph,
      loadGraph: (graph) => {
        loaded.push(graph);
      },
      updateNodeConfig: (nodeId, config) => {
        updates.push({ nodeId, config });
      },
    },
  });

  assert.deepEqual(loaded, []);
  assert.deepEqual(updates, [{ nodeId: 'flash-rate', config: { value: 100 } }]);
});

test('applyServerSemanticSnapshot mirrors server groups into Node Graph UI groups', () => {
  let syncedGroups: unknown[] = [];

  applyServerSemanticSnapshot({
    snapshot: {
      ...snapshot([
        {
          id: 'new-ai-node',
          type: 'display-text',
          params: { text: 'Hello' },
          inputValues: {},
          outputValues: {},
        },
      ]),
      groups: [
        {
          id: 'ai-space-1',
          parentId: null,
          name: 'AI Space',
          nodeIds: ['existing-node', 'new-ai-node'],
          disabled: false,
          kind: 'ai-space',
          runtimeActive: true,
          agentInterface: { exposedNodeIds: ['new-ai-node'] },
          agentPolicy: { enabled: true },
        },
      ],
    },
    nodeEngine: {
      loadGraph: () => undefined,
    },
    setNodeGroups: (groups) => {
      syncedGroups = groups;
    },
  });

  assert.deepEqual(syncedGroups, [
    {
      id: 'ai-space-1',
      parentId: null,
      name: 'AI Space',
      nodeIds: ['existing-node', 'new-ai-node'],
      disabled: false,
      minimized: false,
      kind: 'ai-space',
      runtimeActive: true,
      agentInterface: { exposedNodeIds: ['new-ai-node'] },
      agentPolicy: { enabled: true },
    },
  ]);
});

test('migration coordinator imports old local project only once when server graph is empty', () => {
  const sent: unknown[] = [];
  const storage = new Map<string, string>();
  const coordinator = createServerSemanticMigrationCoordinator({
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    readLocalProject: () => ({
      graph: {
        nodes: [
          {
            id: 'local-node',
            type: 'number',
            position: { x: 12, y: 24 },
            config: {},
            inputValues: {},
            outputValues: {},
          },
        ],
        connections: [],
      },
      groups: [
        {
          id: 'g1',
          parentId: null,
          name: 'Group',
          nodeIds: ['local-node'],
          disabled: false,
          minimized: false,
        },
      ],
      partitions: [],
    }),
    sendSemanticCommand: (input) => sent.push(input),
  });

  coordinator.maybeImport(snapshot([]));
  coordinator.maybeImport(snapshot([]));

  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0], {
    requestId: 'local-project-migration',
    command: {
      kind: 'graph.replace',
      graph: {
        nodes: [
          {
            id: 'local-node',
            type: 'number',
            position: { x: 12, y: 24 },
            config: {},
            inputValues: {},
            outputValues: {},
          },
        ],
        connections: [],
      },
      groups: [
        {
          id: 'g1',
          parentId: null,
          name: 'Group',
          nodeIds: ['local-node'],
          disabled: false,
          minimized: false,
        },
      ],
      partitions: [],
    },
  });
  assert.equal(storage.get(SERVER_SEMANTIC_MIGRATION_KEY), '1');
});

test('bindServerSemanticSync requests server snapshot when Manager SDK reaches connected state', () => {
  const requested: string[] = [];
  let stateHandler: ((state: { status: string }) => void) | null = null;

  bindServerSemanticSync({
    sdk: {
      onSemanticSnapshot: () => () => undefined,
      onStateChange: (handler) => {
        stateHandler = handler;
        return () => undefined;
      },
      requestSemanticSnapshot: (requestId?: string) => requested.push(requestId ?? ''),
    },
    nodeEngine: { loadGraph: () => undefined },
    migrationCoordinator: { maybeImport: () => undefined },
  });

  stateHandler?.({ status: 'connecting' });
  stateHandler?.({ status: 'connected' });
  stateHandler?.({ status: 'connected' });

  assert.deepEqual(requested, ['graph-snapshot']);
});

test('bindServerSemanticSync mirrors snapshot replies from graph.snapshot requests', () => {
  let resultHandler:
    | ((message: { ok: boolean; result?: { snapshot?: SemanticGraphSnapshot } }) => void)
    | null = null;
  let loaded: GraphState | null = null;

  bindServerSemanticSync({
    sdk: {
      onSemanticSnapshot: () => () => undefined,
      onSemanticResult: (handler) => {
        resultHandler = handler;
        return () => undefined;
      },
      onStateChange: () => () => undefined,
      requestSemanticSnapshot: () => undefined,
    },
    nodeEngine: {
      loadGraph: (graph) => {
        loaded = graph;
      },
    },
    migrationCoordinator: { maybeImport: () => undefined },
  });

  resultHandler?.({
    ok: true,
    result: {
      snapshot: snapshot([
        {
          id: 'cli-client-c',
          type: 'client-object',
          params: {},
          inputValues: {},
          outputValues: {},
        },
      ]),
    },
  });

  assert.deepEqual(loaded, {
    nodes: [
      {
        id: 'cli-client-c',
        type: 'client-object',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [],
  });
});

test('migration coordinator never overwrites non-empty server graph with old local project', () => {
  const sent: unknown[] = [];
  const coordinator = createServerSemanticMigrationCoordinator({
    storage: {
      getItem: () => null,
      setItem: () => undefined,
    },
    readLocalProject: () => ({
      graph: {
        nodes: [
          {
            id: 'local-node',
            type: 'number',
            position: { x: 0, y: 0 },
            config: {},
            inputValues: {},
            outputValues: {},
          },
        ],
        connections: [],
      },
    }),
    sendSemanticCommand: (input) => sent.push(input),
  });

  coordinator.maybeImport(
    snapshot([
      {
        id: 'server-node',
        type: 'number',
        params: {},
        inputValues: {},
        outputValues: {},
      },
    ])
  );

  assert.equal(sent.length, 0);
});
