// Purpose: App-level helpers for mirroring the server-owned semantic graph into Manager UI state.
import type { SemanticGraphSnapshot, SemanticGroup, SemanticPartition } from '@shugu/node-core';
import type { SemanticCommandPayload, SemanticResultMessage } from '@shugu/protocol';
import type { GraphState } from '$lib/nodes/types';

export const SERVER_SEMANTIC_MIGRATION_KEY = 'shugu-server-semantic-migrated-v1';

export type ServerSemanticNodeEngine = {
  exportGraph?: () => GraphState;
  loadGraph: (graph: GraphState) => void;
  updateNodeConfig?: (nodeId: string, config: Record<string, unknown>) => void;
};

export type LocalProjectForServerMigration = {
  graph: GraphState;
  groups?: SemanticGroup[];
  partitions?: SemanticPartition[];
};

export type ServerSemanticMigrationStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type ServerSemanticMigrationCoordinator = {
  maybeImport: (snapshot: SemanticGraphSnapshot) => void;
};

export type ServerSemanticSyncSdk = {
  onSemanticSnapshot: (handler: (snapshot: SemanticGraphSnapshot) => void) => () => void;
  onSemanticResult?: (handler: (message: SemanticResultMessage) => void) => () => void;
  onStateChange: (handler: (state: { status: string }) => void) => () => void;
  requestSemanticSnapshot: (requestId?: string) => void;
};

function snapshotFromSemanticResult(message: SemanticResultMessage): SemanticGraphSnapshot | null {
  if (!message.ok) return null;
  const result = message.result as { snapshot?: SemanticGraphSnapshot } | undefined;
  return result?.snapshot ?? null;
}

const defaultSemanticNodePosition = { x: 0, y: 0 };

const positionFromGraph = (
  graph: GraphState | undefined
): Map<string, { x: number; y: number }> => {
  const positions = new Map<string, { x: number; y: number }>();
  for (const node of graph?.nodes ?? []) {
    const x = Number(node.position?.x);
    const y = Number(node.position?.y);
    positions.set(String(node.id), {
      x: Number.isFinite(x) ? x : defaultSemanticNodePosition.x,
      y: Number.isFinite(y) ? y : defaultSemanticNodePosition.y,
    });
  }
  return positions;
};

export function graphFromServerSemanticSnapshot(
  snapshot: SemanticGraphSnapshot,
  currentGraph?: GraphState
): GraphState {
  const currentPositions = positionFromGraph(currentGraph);
  const existingPositions = [...currentPositions.values()];
  const defaultY = existingPositions[0]?.y ?? defaultSemanticNodePosition.y;
  const nextPositionX =
    existingPositions.length > 0
      ? Math.max(...existingPositions.map((position) => position.x)) + 240
      : defaultSemanticNodePosition.x;
  let missingNodeIndex = 0;
  return {
    nodes: (snapshot.nodes ?? []).map((node) => ({
      id: String(node.id),
      type: String(node.type),
      position: currentPositions.get(String(node.id)) ?? {
        x: nextPositionX + missingNodeIndex++ * 240,
        y: defaultY,
      },
      config: { ...(node.params ?? {}) },
      inputValues: { ...(node.inputValues ?? {}) },
      outputValues: { ...(node.outputValues ?? {}) },
    })),
    connections: (snapshot.connections ?? []).map((connection) => ({ ...connection })),
  };
}

const nodeShapeKey = (graph: GraphState): string =>
  JSON.stringify({
    nodes: (graph.nodes ?? [])
      .map((node) => ({ id: String(node.id), type: String(node.type) }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    connections: (graph.connections ?? [])
      .map((connection) => ({
        id: String(connection.id),
        sourceNodeId: String(connection.sourceNodeId),
        sourcePortId: String(connection.sourcePortId),
        targetNodeId: String(connection.targetNodeId),
        targetPortId: String(connection.targetPortId),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });

const canPatchExistingNodeParams = (currentGraph: GraphState, nextGraph: GraphState): boolean =>
  nodeShapeKey(currentGraph) === nodeShapeKey(nextGraph);

const shallowRecordEqual = (
  left: Record<string, unknown>,
  right: Record<string, unknown>
): boolean => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => Object.is(left[key], right[key]));
};

export function applyServerSemanticSnapshot(input: {
  snapshot: SemanticGraphSnapshot;
  nodeEngine: ServerSemanticNodeEngine;
}): void {
  const currentGraph = input.nodeEngine.exportGraph?.();
  const nextGraph = graphFromServerSemanticSnapshot(input.snapshot, currentGraph);

  if (
    currentGraph &&
    input.nodeEngine.updateNodeConfig &&
    canPatchExistingNodeParams(currentGraph, nextGraph)
  ) {
    const currentById = new Map((currentGraph.nodes ?? []).map((node) => [String(node.id), node]));
    for (const nextNode of nextGraph.nodes ?? []) {
      const currentNode = currentById.get(String(nextNode.id));
      if (!currentNode) continue;
      const nextConfig = nextNode.config ?? {};
      if (!shallowRecordEqual(currentNode.config ?? {}, nextConfig)) {
        input.nodeEngine.updateNodeConfig(String(nextNode.id), nextConfig);
      }
    }
    return;
  }

  input.nodeEngine.loadGraph(nextGraph);
}

export function createServerSemanticMigrationCoordinator(input: {
  storage: ServerSemanticMigrationStorage | null;
  readLocalProject: () => LocalProjectForServerMigration | null;
  sendSemanticCommand: (input: { requestId: string; command: SemanticCommandPayload }) => void;
}): ServerSemanticMigrationCoordinator {
  let attempted = false;

  return {
    maybeImport(snapshot) {
      if (attempted) return;
      if (!input.storage) return;
      if (input.storage.getItem(SERVER_SEMANTIC_MIGRATION_KEY) === '1') return;
      if ((snapshot.nodes ?? []).length > 0 || (snapshot.connections ?? []).length > 0) return;

      const project = input.readLocalProject();
      if (!project || (project.graph.nodes ?? []).length === 0) return;

      attempted = true;
      input.sendSemanticCommand({
        requestId: 'local-project-migration',
        command: {
          kind: 'graph.replace',
          graph: project.graph,
          ...(project.groups ? { groups: project.groups } : {}),
          ...(project.partitions ? { partitions: project.partitions } : {}),
        },
      });
      input.storage.setItem(SERVER_SEMANTIC_MIGRATION_KEY, '1');
    },
  };
}

export function bindServerSemanticSync(input: {
  sdk: ServerSemanticSyncSdk;
  nodeEngine: ServerSemanticNodeEngine;
  migrationCoordinator: ServerSemanticMigrationCoordinator;
}): () => void {
  let requestedInitialSnapshot = false;
  const handleSnapshot = (snapshot: SemanticGraphSnapshot) => {
    applyServerSemanticSnapshot({ snapshot, nodeEngine: input.nodeEngine });
    input.migrationCoordinator.maybeImport(snapshot);
  };
  const unsubscribeSnapshot = input.sdk.onSemanticSnapshot((snapshot) => {
    handleSnapshot(snapshot);
  });
  const unsubscribeResult =
    input.sdk.onSemanticResult?.((message) => {
      const snapshot = snapshotFromSemanticResult(message);
      if (snapshot) handleSnapshot(snapshot);
    }) ?? (() => undefined);
  const unsubscribeState = input.sdk.onStateChange((state) => {
    if (requestedInitialSnapshot) return;
    if (state.status !== 'connected') return;
    requestedInitialSnapshot = true;
    input.sdk.requestSemanticSnapshot('graph-snapshot');
  });

  return () => {
    unsubscribeSnapshot();
    unsubscribeResult();
    unsubscribeState();
  };
}
