// Purpose: Tests for app-level server semantic snapshot mirroring and local project migration.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { SemanticGraphSnapshot } from '@shugu/node-core';
import type { SemanticResultMessage } from '@shugu/protocol';
import {
  applyServerSemanticSnapshot,
  bindServerSemanticSync,
  createServerSemanticMigrationCoordinator,
  overlayPendingSemanticCommands,
  SERVER_SEMANTIC_MIGRATION_KEY,
} from './server-semantic-sync';
import type { GraphState } from '$lib/nodes/types';

const positions = (entries: Array<[string, { x: number; y: number }]>) => new Map(entries);

const requireLoaded = (loaded: GraphState | null): GraphState => {
  assert.ok(loaded);
  return loaded;
};

type SnapshotResultHandler = (message: SemanticResultMessage & {
  ok: boolean;
  result?: { snapshot?: SemanticGraphSnapshot };
}) => void;
type SnapshotRequestResultHandler = (message: SemanticResultMessage & {
  requestId: string;
  ok: boolean;
  result?: { snapshot?: SemanticGraphSnapshot };
}) => void;
type SnapshotRequestErrorHandler = (message: SemanticResultMessage & {
  requestId: string;
  ok: boolean;
  error?: { code: string; message: string };
}) => void;

const semanticResult = (
  message: Partial<SemanticResultMessage> & Pick<SemanticResultMessage, 'ok'>
): SemanticResultMessage =>
  ({
    type: 'semantic-result',
    version: 1,
    serverTimestamp: 0,
    requestId: '',
    ...message,
  }) as SemanticResultMessage;

const noopStateHandler = () => undefined;
const noopSnapshotHandler = () => undefined;
const noopSnapshotResultHandler: SnapshotResultHandler = () => undefined;
const noopSnapshotRequestResultHandler: SnapshotRequestResultHandler = () => undefined;
const noopSnapshotRequestErrorHandler: SnapshotRequestErrorHandler = () => undefined;

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
  customDefinitions: [],
  agentCapabilities: { version: 1, nodes: [] },
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
          type: 'client-loader',
          params: { label: 'Client Loader A' },
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

  assert.deepEqual(requireLoaded(loaded), {
    nodes: [
      {
        id: 'client-a',
        type: 'client-loader',
        position: { x: 0, y: 0 },
        config: { label: 'Client Loader A' },
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
        type: 'client-loader',
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
        type: 'client-loader',
        params: { label: 'Client Loader A' },
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

  assert.deepEqual(requireLoaded(loaded).nodes, [
    {
      id: 'client-a',
      type: 'client-loader',
      position: { x: 321, y: 654 },
      config: { label: 'Client Loader A' },
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
        type: 'client-loader',
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
        type: 'client-loader',
        params: {},
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'client-b',
        type: 'client-loader',
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

  assert.deepEqual(
    requireLoaded(loaded).nodes.map((node) => node.position),
    [
      { x: 321, y: 654 },
      { x: 561, y: 654 },
    ]
  );
});

test('applyServerSemanticSnapshot restores node positions from local layout storage after Manager reload', () => {
  let loaded: GraphState | null = null;

  applyServerSemanticSnapshot({
    snapshot: snapshot([
      {
        id: 'client-a',
        type: 'client-loader',
        params: {},
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'display-a',
        type: 'display-object',
        params: {},
        inputValues: {},
        outputValues: {},
      },
    ]),
    nodeEngine: {
      exportGraph: () => ({ nodes: [], connections: [] }),
      loadGraph: (graph) => {
        loaded = graph;
      },
    },
    layoutPositions: positions([
      ['client-a', { x: 420, y: 180 }],
      ['display-a', { x: 780, y: 260 }],
    ]),
  });

  assert.deepEqual(
    requireLoaded(loaded).nodes.map((node) => [node.id, node.position]),
    [
      ['client-a', { x: 420, y: 180 }],
      ['display-a', { x: 780, y: 260 }],
    ]
  );
});

test('applyServerSemanticSnapshot prefers newer layout storage when server shape changes reload the graph', () => {
  let loaded: GraphState | null = null;
  const staleLocalGraph: GraphState = {
    nodes: [
      {
        id: 'server-node',
        type: 'number',
        position: { x: 10, y: 20 },
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
        id: 'server-node',
        type: 'number',
        params: {},
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'new-node',
        type: 'math',
        params: {},
        inputValues: {},
        outputValues: {},
      },
    ]),
    nodeEngine: {
      exportGraph: () => staleLocalGraph,
      loadGraph: (graph) => {
        loaded = graph;
      },
    },
    layoutPositions: positions([['server-node', { x: 300, y: 400 }]]),
  });

  assert.deepEqual(requireLoaded(loaded).nodes[0]?.position, { x: 300, y: 400 });
});

test('applyServerSemanticSnapshot keeps layout storage after server-side node deletion reloads the graph', () => {
  let loaded: GraphState | null = null;
  const staleLocalGraph: GraphState = {
    nodes: [
      {
        id: 'server-node',
        type: 'number',
        position: { x: 10, y: 20 },
        config: {},
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'deleted-node',
        type: 'math',
        position: { x: 240, y: 20 },
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
        id: 'server-node',
        type: 'number',
        params: {},
        inputValues: {},
        outputValues: {},
      },
    ]),
    nodeEngine: {
      exportGraph: () => staleLocalGraph,
      loadGraph: (graph) => {
        loaded = graph;
      },
    },
    layoutPositions: positions([['server-node', { x: 300, y: 400 }]]),
  });

  assert.deepEqual(requireLoaded(loaded).nodes[0]?.position, { x: 300, y: 400 });
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

test('applyServerSemanticSnapshot patches existing inline input values without reloading the runtime graph', () => {
  const loaded: GraphState[] = [];
  const inputUpdates: Array<{ nodeId: string; portId: string; value: unknown }> = [];
  const localGraph: GraphState = {
    nodes: [
      {
        id: 'source',
        type: 'number',
        position: { x: 42, y: 64 },
        config: { value: 1 },
        inputValues: { value: 1 },
        outputValues: {},
      },
    ],
    connections: [],
  };

  applyServerSemanticSnapshot({
    snapshot: snapshot([
      {
        id: 'source',
        type: 'number',
        params: { value: 1 },
        inputValues: { value: 9 },
        outputValues: {},
      },
    ]),
    nodeEngine: {
      exportGraph: () => localGraph,
      loadGraph: (graph) => {
        loaded.push(graph);
      },
      updateNodeConfig: () => undefined,
      updateNodeInputValue: (nodeId, portId, value) => {
        inputUpdates.push({ nodeId, portId, value });
      },
    },
  });

  assert.deepEqual(loaded, []);
  assert.deepEqual(inputUpdates, [{ nodeId: 'source', portId: 'value', value: 9 }]);
});

test('applyServerSemanticSnapshot removes stale inline input values without reloading the runtime graph', () => {
  const loaded: GraphState[] = [];
  const inputUpdates: Array<{ nodeId: string; values: Record<string, unknown> }> = [];
  const localGraph: GraphState = {
    nodes: [
      {
        id: 'source',
        type: 'number',
        position: { x: 42, y: 64 },
        config: { value: 9 },
        inputValues: { value: 9 },
        outputValues: {},
      },
    ],
    connections: [],
  };

  applyServerSemanticSnapshot({
    snapshot: snapshot([
      {
        id: 'source',
        type: 'number',
        params: { value: 9 },
        inputValues: {},
        outputValues: {},
      },
    ]),
    nodeEngine: {
      exportGraph: () => localGraph,
      loadGraph: (graph) => {
        loaded.push(graph);
      },
      updateNodeConfig: () => undefined,
      replaceNodeInputValues: (nodeId, values) => {
        inputUpdates.push({ nodeId, values });
      },
    },
  });

  assert.deepEqual(loaded, []);
  assert.deepEqual(inputUpdates, [{ nodeId: 'source', values: {} }]);
});

test('overlayPendingSemanticCommands keeps local graph edits over older server snapshots', () => {
  const staleServer = snapshot([
    {
      id: 'kept',
      type: 'number',
      params: { value: 1 },
      inputValues: { value: 1 },
      outputValues: {},
    },
    {
      id: 'removed-locally',
      type: 'number',
      params: {},
      inputValues: {},
      outputValues: {},
    },
  ]);

  const localOnlyNode = {
    id: 'local-new',
    type: 'math',
    position: { x: 500, y: 80 },
    config: { gain: 2 },
    inputValues: { a: 3 },
    outputValues: {},
  };

  const overlaid = overlayPendingSemanticCommands(staleServer, [
    { type: 'node.remove', nodeId: 'removed-locally' },
    { type: 'node.add', node: localOnlyNode },
    { type: 'node.params.update', nodeId: 'kept', params: { value: 9 } },
    { type: 'node.inputs.update', nodeId: 'kept', inputValues: { value: 9 } },
  ]);

  assert.deepEqual(
    overlaid.nodes.map((node) => [node.id, node.params, node.inputValues]),
    [
      ['kept', { value: 9 }, { value: 9 }],
      ['local-new', { gain: 2 }, { a: 3 }],
    ]
  );
});

test('overlayPendingSemanticCommands keeps pending local disconnect over older server snapshots', () => {
  const staleServer = snapshot(
    [
      {
        id: 'source',
        type: 'number',
        params: {},
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'target',
        type: 'math',
        params: {},
        inputValues: {},
        outputValues: {},
      },
    ],
    [
      {
        id: 'edge-1',
        sourceNodeId: 'source',
        sourcePortId: 'out',
        targetNodeId: 'target',
        targetPortId: 'a',
      },
    ]
  );

  const overlaid = overlayPendingSemanticCommands(staleServer, [
    { type: 'node.disconnect', connectionId: 'edge-1' },
  ]);

  assert.deepEqual(overlaid.connections, []);
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

test('applyServerSemanticSnapshot mirrors server custom node definitions into Manager custom-node store', () => {
  let syncedDefinitions: unknown[] = [];

  applyServerSemanticSnapshot({
    snapshot: {
      ...snapshot([]),
      customDefinitions: [
        {
          definitionId: 'def-server',
          name: 'Server Custom',
          template: { nodes: [], connections: [] },
          ports: [],
        },
      ],
    },
    nodeEngine: {
      loadGraph: () => undefined,
    },
    setCustomNodeDefinitions: (definitions) => {
      syncedDefinitions = definitions;
    },
  });

  assert.deepEqual(syncedDefinitions, [
    {
      definitionId: 'def-server',
      name: 'Server Custom',
      template: { nodes: [], connections: [] },
      ports: [],
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
  let stateHandler: (state: { status: string }) => void = noopStateHandler;

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

  stateHandler({ status: 'connecting' });
  stateHandler({ status: 'connected' });
  stateHandler({ status: 'connected' });

  assert.deepEqual(requested, ['graph-snapshot']);
});

test('bindServerSemanticSync clears pending local commands and refreshes snapshots on reconnect', () => {
  const requested: string[] = [];
  let stateHandler: (state: { status: string }) => void = noopStateHandler;
  let clearCount = 0;

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
    clearPendingCommands: () => {
      clearCount += 1;
    },
  });

  stateHandler?.({ status: 'connected' });
  stateHandler?.({ status: 'disconnected' });
  stateHandler?.({ status: 'connected' });

  assert.deepEqual(requested, ['graph-snapshot', 'graph-snapshot:reconnect']);
  assert.equal(clearCount, 1);
});

test('bindServerSemanticSync mirrors snapshot replies from graph.snapshot requests', () => {
  let resultHandler: SnapshotResultHandler = noopSnapshotResultHandler;
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

  resultHandler(semanticResult({
    ok: true,
    result: {
      snapshot: snapshot([
        {
          id: 'cli-client-c',
          type: 'client-loader',
          params: {},
          inputValues: {},
          outputValues: {},
        },
      ]),
    },
  }));

  assert.deepEqual(requireLoaded(loaded), {
    nodes: [
      {
        id: 'cli-client-c',
        type: 'client-loader',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [],
  });
});

test('bindServerSemanticSync settles pending local commands when their semantic result arrives', () => {
  let resultHandler: SnapshotRequestResultHandler = noopSnapshotRequestResultHandler;
  const settled: string[] = [];

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
      loadGraph: () => undefined,
    },
    migrationCoordinator: { maybeImport: () => undefined },
    settlePendingCommand: (requestId) => settled.push(requestId),
  });

  resultHandler(semanticResult({
    requestId: 'canvas:node.remove:n1',
    ok: true,
    result: {
      snapshot: snapshot([]),
    },
  }));

  assert.deepEqual(settled, ['canvas:node.remove:n1']);
});

test('bindServerSemanticSync overlays pending local commands before applying server snapshots', () => {
  let snapshotHandler: (snapshot: SemanticGraphSnapshot) => void = noopSnapshotHandler;
  let loaded: GraphState | null = null;

  bindServerSemanticSync({
    sdk: {
      onSemanticSnapshot: (handler) => {
        snapshotHandler = handler;
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
    getPendingCommands: () => [{ type: 'node.remove', nodeId: 'local-delete' }],
  });

  snapshotHandler(
    snapshot([
      {
        id: 'local-delete',
        type: 'number',
        params: {},
        inputValues: {},
        outputValues: {},
      },
    ])
  );

  assert.deepEqual(loaded, { nodes: [], connections: [] });
});

test('bindServerSemanticSync requests a fresh snapshot when a pending command is rejected', () => {
  let resultHandler: SnapshotRequestErrorHandler = noopSnapshotRequestErrorHandler;
  const requested: string[] = [];
  const settled: string[] = [];

  bindServerSemanticSync({
    sdk: {
      onSemanticSnapshot: () => () => undefined,
      onSemanticResult: (handler) => {
        resultHandler = handler;
        return () => undefined;
      },
      onStateChange: () => () => undefined,
      requestSemanticSnapshot: (requestId?: string) => requested.push(requestId ?? ''),
    },
    nodeEngine: {
      loadGraph: () => undefined,
    },
    migrationCoordinator: { maybeImport: () => undefined },
    settlePendingCommand: (requestId) => settled.push(requestId),
  });

  resultHandler(semanticResult({
    requestId: 'canvas:node.add:bad',
    ok: false,
    error: { code: 'rejected', message: 'rejected' },
  }));

  assert.deepEqual(settled, ['canvas:node.add:bad']);
  assert.deepEqual(requested, ['semantic-result-rejected:canvas:node.add:bad']);
});

test('bindServerSemanticSync ignores stale semantic snapshots after a newer revision was applied', () => {
  let snapshotHandler: (snapshot: SemanticGraphSnapshot) => void = noopSnapshotHandler;
  let resultHandler: SnapshotResultHandler = noopSnapshotResultHandler;
  const loaded: GraphState[] = [];

  bindServerSemanticSync({
    sdk: {
      onSemanticSnapshot: (handler) => {
        snapshotHandler = handler;
        return () => undefined;
      },
      onSemanticResult: (handler) => {
        resultHandler = handler;
        return () => undefined;
      },
      onStateChange: () => () => undefined,
      requestSemanticSnapshot: () => undefined,
    },
    nodeEngine: {
      loadGraph: (graph) => {
        loaded.push(graph);
      },
    },
    migrationCoordinator: { maybeImport: () => undefined },
  });

  snapshotHandler({
    ...snapshot([
      {
        id: 'server-node',
        type: 'number',
        params: { value: 2 },
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'new-node',
        type: 'math',
        params: {},
        inputValues: {},
        outputValues: {},
      },
    ]),
    revision: 8,
  });

  resultHandler(semanticResult({
    ok: true,
    result: {
      snapshot: {
        ...snapshot([
          {
            id: 'server-node',
            type: 'number',
            params: { value: 1 },
            inputValues: {},
            outputValues: {},
          },
        ]),
        revision: 7,
      },
    },
  }));

  assert.equal(loaded.length, 1);
  assert.deepEqual(
    loaded[0]?.nodes.map((node) => [node.id, node.config]),
    [
      ['server-node', { value: 2 }],
      ['new-node', {}],
    ]
  );
});

test('bindServerSemanticSync publishes live snapshots to subscribers', () => {
  let snapshotHandler: (snapshot: SemanticGraphSnapshot) => void = noopSnapshotHandler;
  const published: number[] = [];

  bindServerSemanticSync({
    sdk: {
      onSemanticSnapshot: (handler) => {
        snapshotHandler = handler;
        return () => undefined;
      },
      onStateChange: () => () => undefined,
      requestSemanticSnapshot: () => undefined,
    },
    nodeEngine: { loadGraph: () => undefined },
    migrationCoordinator: { maybeImport: () => undefined },
    onSnapshot: (nextSnapshot) => published.push(nextSnapshot.revision),
  });

  snapshotHandler(snapshot([]));

  assert.deepEqual(published, [7]);
});

test('bindServerSemanticSync marks snapshot application boundaries', () => {
  let snapshotHandler: (snapshot: SemanticGraphSnapshot) => void = noopSnapshotHandler;
  const markers: string[] = [];

  bindServerSemanticSync({
    sdk: {
      onSemanticSnapshot: (handler) => {
        snapshotHandler = handler;
        return () => undefined;
      },
      onStateChange: () => () => undefined,
      requestSemanticSnapshot: () => undefined,
    },
    nodeEngine: {
      loadGraph: () => {
        markers.push('load');
      },
    },
    migrationCoordinator: { maybeImport: () => undefined },
    beforeApply: () => markers.push('before'),
    afterApply: () => markers.push('after'),
  });

  snapshotHandler(snapshot([]));

  assert.deepEqual(markers, ['before', 'load', 'after']);
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
