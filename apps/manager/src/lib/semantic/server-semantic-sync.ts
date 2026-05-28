// Purpose: App-level helpers for mirroring the server-owned semantic graph into Manager UI state.
import {
  applySemanticCommand,
  type SemanticCommand,
  type SemanticGraphSnapshot,
  type SemanticGroup,
  type SemanticPartition,
} from '@shugu/node-core';
import type { SemanticCommandPayload, SemanticResultMessage } from '@shugu/protocol';
import type { GraphState } from '$lib/nodes/types';
import type { CustomNodeDefinition } from '$lib/nodes/custom-nodes/types';
import type { NodeGroup } from '$lib/components/nodes/node-canvas/controllers/group-controller';
import { isGroupDecorationNodeType } from '$lib/components/nodes/node-canvas/groups/group-node-types';

export const SERVER_SEMANTIC_MIGRATION_KEY = 'shugu-server-semantic-migrated-v1';

export type ServerSemanticNodeEngine = {
  exportGraph?: () => GraphState;
  loadGraph: (graph: GraphState) => void;
  updateNodeConfig?: (nodeId: string, config: Record<string, unknown>) => void;
  updateNodeInputValue?: (nodeId: string, portId: string, value: unknown) => void;
  replaceNodeInputValues?: (nodeId: string, inputValues: Record<string, unknown>) => void;
  lastError?: { set?: (message: string | null) => void };
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

export type ServerSemanticNodeGroupsSync = (groups: NodeGroup[]) => void;
export type ServerSemanticCustomDefinitionsSync = (definitions: CustomNodeDefinition[]) => void;
export type ServerSemanticLayoutPositions = Map<string, { x: number; y: number }>;

type PendingSemanticCommandReader = () => SemanticCommand[];
type PendingSemanticCommandSettler = (requestId: string) => void;
type PendingSemanticCommandClearer = () => void;

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

const overlayManagerOnlyGroupDecorations = (
  nextGraph: GraphState,
  currentGraph: GraphState | undefined
): GraphState => {
  if (!currentGraph) return nextGraph;

  const nextNodeIds = new Set((nextGraph.nodes ?? []).map((node) => String(node.id)));
  const preservedDecorationNodes = (currentGraph.nodes ?? []).filter((node) => {
    const id = String(node.id);
    if (nextNodeIds.has(id)) return false;
    return isGroupDecorationNodeType(String(node.type ?? ''));
  });
  if (preservedDecorationNodes.length === 0) return nextGraph;

  const finalNodeIds = new Set(nextNodeIds);
  for (const node of preservedDecorationNodes) {
    finalNodeIds.add(String(node.id));
  }

  const nextConnectionIds = new Set(
    (nextGraph.connections ?? []).map((connection) => String(connection.id))
  );
  const preservedDecorationNodeIds = new Set(
    preservedDecorationNodes.map((node) => String(node.id))
  );
  const preservedDecorationConnections = (currentGraph.connections ?? []).filter((connection) => {
    const id = String(connection.id);
    if (nextConnectionIds.has(id)) return false;
    const sourceNodeId = String(connection.sourceNodeId);
    const targetNodeId = String(connection.targetNodeId);
    if (!preservedDecorationNodeIds.has(sourceNodeId) && !preservedDecorationNodeIds.has(targetNodeId)) {
      return false;
    }
    return finalNodeIds.has(sourceNodeId) && finalNodeIds.has(targetNodeId);
  });

  return {
    nodes: [
      ...(nextGraph.nodes ?? []),
      ...preservedDecorationNodes.map((node) => ({
        ...node,
        position: { ...(node.position ?? defaultSemanticNodePosition) },
        config: { ...(node.config ?? {}) },
        inputValues: { ...(node.inputValues ?? {}) },
        outputValues: { ...(node.outputValues ?? {}) },
      })),
    ],
    connections: [
      ...(nextGraph.connections ?? []),
      ...preservedDecorationConnections.map((connection) => ({ ...connection })),
    ],
  };
};

export function graphFromServerSemanticSnapshot(
  snapshot: SemanticGraphSnapshot,
  currentGraph?: GraphState,
  layoutPositions?: ServerSemanticLayoutPositions
): GraphState {
  const currentPositions = positionFromGraph(currentGraph);
  const existingPositions = [...currentPositions.values(), ...(layoutPositions?.values() ?? [])];
  const defaultY = existingPositions[0]?.y ?? defaultSemanticNodePosition.y;
  const nextPositionX =
    existingPositions.length > 0
      ? Math.max(...existingPositions.map((position) => position.x)) + 240
      : defaultSemanticNodePosition.x;
  let missingNodeIndex = 0;
  const serverGraph = {
    nodes: (snapshot.nodes ?? []).map((node) => ({
      id: String(node.id),
      type: String(node.type),
      position:
        layoutPositions?.get(String(node.id)) ??
        currentPositions.get(String(node.id)) ??
        {
          x: nextPositionX + missingNodeIndex++ * 240,
          y: defaultY,
        },
      config: { ...(node.params ?? {}) },
      inputValues: { ...(node.inputValues ?? {}) },
      outputValues: { ...(node.outputValues ?? {}) },
    })),
    connections: (snapshot.connections ?? []).map((connection) => ({ ...connection })),
  };
  return overlayManagerOnlyGroupDecorations(serverGraph, currentGraph);
}

const snapshotNodeToGraphNode = (node: SemanticGraphSnapshot['nodes'][number]) => ({
  id: String(node.id),
  type: String(node.type),
  position: defaultSemanticNodePosition,
  config: { ...(node.params ?? {}) },
  inputValues: { ...(node.inputValues ?? {}) },
  outputValues: { ...(node.outputValues ?? {}) },
});

const graphNodeToSnapshotNode = (node: GraphState['nodes'][number]) => ({
  id: String(node.id),
  type: String(node.type),
  params: { ...(node.config ?? {}) },
  inputValues: { ...(node.inputValues ?? {}) },
  outputValues: { ...(node.outputValues ?? {}) },
});

export function overlayPendingSemanticCommands(
  snapshot: SemanticGraphSnapshot,
  commands: SemanticCommand[]
): SemanticGraphSnapshot {
  if (commands.length === 0) return snapshot;
  let state = {
    graph: {
      nodes: (snapshot.nodes ?? []).map(snapshotNodeToGraphNode),
      connections: (snapshot.connections ?? []).map((connection) => ({ ...connection })),
    },
    groups: snapshot.groups ?? [],
    partitions: snapshot.partitions ?? [],
    customDefinitions: snapshot.customDefinitions ?? [],
    agentCapabilities: snapshot.agentCapabilities,
    proposals: snapshot.proposals ?? [],
    runtimeStatus: snapshot.runtimeStatus,
    revision: Number(snapshot.revision) || 0,
  };

  for (const command of commands) {
    state = applySemanticCommand(state, command);
  }

  return {
    ...snapshot,
    nodes: state.graph.nodes.map(graphNodeToSnapshotNode),
    connections: state.graph.connections.map((connection) => ({ ...connection })),
    groups: state.groups.map((group) => ({ ...group })),
    partitions: state.partitions.map((partition) => ({ ...partition })),
    customDefinitions: state.customDefinitions.map((definition) => cloneJsonValue(definition)),
    agentCapabilities: cloneJsonValue(state.agentCapabilities),
    proposals: state.proposals.map((proposal) => cloneJsonValue(proposal)),
    runtimeStatus: cloneJsonValue(state.runtimeStatus),
  };
}

const cloneJsonValue = <T>(value: T): T =>
  value == null ? value : (JSON.parse(JSON.stringify(value)) as T);

export function groupsFromServerSemanticSnapshot(snapshot: SemanticGraphSnapshot): NodeGroup[] {
  return (snapshot.groups ?? [])
    .map((group) => {
      const record = group as SemanticGroup & { minimized?: unknown };
      const id = String(record.id ?? '');
      if (!id) return null;
      return {
        id,
        parentId: record.parentId ? String(record.parentId) : null,
        name: String(record.name ?? ''),
        nodeIds: Array.from(
          new Set((record.nodeIds ?? []).map((nodeId) => String(nodeId)).filter(Boolean))
        ),
        disabled: Boolean(record.disabled),
        minimized: Boolean(record.minimized),
        kind:
          record.kind === 'ai-space' ? 'ai-space' : record.kind === 'group' ? 'group' : undefined,
        runtimeActive: typeof record.runtimeActive === 'boolean' ? record.runtimeActive : undefined,
        agentInterface:
          record.agentInterface !== undefined ? cloneJsonValue(record.agentInterface) : undefined,
        agentPolicy:
          record.agentPolicy !== undefined ? cloneJsonValue(record.agentPolicy) : undefined,
      } satisfies NodeGroup;
    })
    .filter(Boolean) as NodeGroup[];
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

const patchNodeInputValues = (
  nodeId: string,
  current: Record<string, unknown>,
  next: Record<string, unknown>,
  updateNodeInputValue: (nodeId: string, portId: string, value: unknown) => void
): void => {
  for (const [key, value] of Object.entries(next)) {
    if (Object.is(current[key], value)) continue;
    updateNodeInputValue(nodeId, key, value);
  }
};

export function applyServerSemanticSnapshot(input: {
  snapshot: SemanticGraphSnapshot;
  nodeEngine: ServerSemanticNodeEngine;
  setNodeGroups?: ServerSemanticNodeGroupsSync;
  setCustomNodeDefinitions?: ServerSemanticCustomDefinitionsSync;
  layoutPositions?: ServerSemanticLayoutPositions;
}): void {
  const currentGraph = input.nodeEngine.exportGraph?.();
  const nextGraph = graphFromServerSemanticSnapshot(
    input.snapshot,
    currentGraph,
    input.layoutPositions
  );
  input.setNodeGroups?.(groupsFromServerSemanticSnapshot(input.snapshot));
  input.setCustomNodeDefinitions?.(
    cloneJsonValue((input.snapshot.customDefinitions ?? []) as CustomNodeDefinition[])
  );

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
      const nextInputValues = nextNode.inputValues ?? {};
      if (!shallowRecordEqual(currentNode.inputValues ?? {}, nextInputValues)) {
        if (input.nodeEngine.replaceNodeInputValues) {
          input.nodeEngine.replaceNodeInputValues(String(nextNode.id), nextInputValues);
        } else if (input.nodeEngine.updateNodeInputValue) {
          patchNodeInputValues(
            String(nextNode.id),
            currentNode.inputValues ?? {},
            nextInputValues,
            input.nodeEngine.updateNodeInputValue
          );
        }
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
  setNodeGroups?: ServerSemanticNodeGroupsSync;
  setCustomNodeDefinitions?: ServerSemanticCustomDefinitionsSync;
  getLayoutPositions?: () => ServerSemanticLayoutPositions;
  onSnapshot?: (snapshot: SemanticGraphSnapshot) => void;
  beforeApply?: () => void;
  afterApply?: () => void;
  getPendingCommands?: PendingSemanticCommandReader;
  settlePendingCommand?: PendingSemanticCommandSettler;
  clearPendingCommands?: PendingSemanticCommandClearer;
}): () => void {
  let requestedInitialSnapshot = false;
  let wasDisconnected = false;
  let latestAppliedRevision = Number.NEGATIVE_INFINITY;
  const handleSnapshot = (snapshot: SemanticGraphSnapshot) => {
    const revision = Number(snapshot.revision);
    if (Number.isFinite(revision)) {
      if (revision < latestAppliedRevision) return;
      latestAppliedRevision = revision;
    }
    const effectiveSnapshot = overlayPendingSemanticCommands(
      snapshot,
      input.getPendingCommands?.() ?? []
    );
    input.onSnapshot?.(effectiveSnapshot);
    input.beforeApply?.();
    try {
      applyServerSemanticSnapshot({
        snapshot: effectiveSnapshot,
        nodeEngine: input.nodeEngine,
        setNodeGroups: input.setNodeGroups,
        setCustomNodeDefinitions: input.setCustomNodeDefinitions,
        layoutPositions: input.getLayoutPositions?.(),
      });
    } finally {
      input.afterApply?.();
    }
    input.migrationCoordinator.maybeImport(snapshot);
  };
  const unsubscribeSnapshot = input.sdk.onSemanticSnapshot((snapshot) => {
    handleSnapshot(snapshot);
  });
  const unsubscribeResult =
    input.sdk.onSemanticResult?.((message) => {
      input.settlePendingCommand?.(message.requestId);
      if (!message.ok) {
        input.nodeEngine.lastError?.set?.(message.error?.message ?? 'Semantic command rejected.');
        input.sdk.requestSemanticSnapshot(`semantic-result-rejected:${message.requestId}`);
        return;
      }
      const snapshot = snapshotFromSemanticResult(message);
      if (snapshot) handleSnapshot(snapshot);
    }) ?? (() => undefined);
  const unsubscribeState = input.sdk.onStateChange((state) => {
    if (state.status !== 'connected') {
      if (requestedInitialSnapshot) wasDisconnected = true;
      return;
    }

    if (!requestedInitialSnapshot) {
      requestedInitialSnapshot = true;
      input.sdk.requestSemanticSnapshot('graph-snapshot');
      return;
    }

    if (!wasDisconnected) return;
    wasDisconnected = false;
    input.clearPendingCommands?.();
    latestAppliedRevision = Number.NEGATIVE_INFINITY;
    input.sdk.requestSemanticSnapshot('graph-snapshot:reconnect');
  });

  return () => {
    unsubscribeSnapshot();
    unsubscribeResult();
    unsubscribeState();
  };
}
