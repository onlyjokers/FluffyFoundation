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

const snapshot = (nodes: SemanticGraphSnapshot['nodes'], connections: SemanticGraphSnapshot['connections'] = []): SemanticGraphSnapshot => ({
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
      groups: [{ id: 'g1', parentId: null, name: 'Group', nodeIds: ['local-node'], disabled: false, minimized: false }],
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
      groups: [{ id: 'g1', parentId: null, name: 'Group', nodeIds: ['local-node'], disabled: false, minimized: false }],
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
  let resultHandler: ((message: { ok: boolean; result?: { snapshot?: SemanticGraphSnapshot } }) => void) | null = null;
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
