// Purpose: App-level helpers for mirroring the server-owned semantic graph into Manager UI state.
import type { SemanticGraphSnapshot, SemanticGroup, SemanticPartition } from '@shugu/node-core';
import type { SemanticCommandPayload, SemanticResultMessage } from '@shugu/protocol';
import type { GraphState } from '$lib/nodes/types';

export const SERVER_SEMANTIC_MIGRATION_KEY = 'shugu-server-semantic-migrated-v1';

export type ServerSemanticNodeEngine = {
  loadGraph: (graph: GraphState) => void;
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

export function graphFromServerSemanticSnapshot(snapshot: SemanticGraphSnapshot): GraphState {
  return {
    nodes: (snapshot.nodes ?? []).map((node) => ({
      id: String(node.id),
      type: String(node.type),
      position: { x: 0, y: 0 },
      config: { ...(node.params ?? {}) },
      inputValues: { ...(node.inputValues ?? {}) },
      outputValues: { ...(node.outputValues ?? {}) },
    })),
    connections: (snapshot.connections ?? []).map((connection) => ({ ...connection })),
  };
}

export function applyServerSemanticSnapshot(input: {
  snapshot: SemanticGraphSnapshot;
  nodeEngine: ServerSemanticNodeEngine;
}): void {
  input.nodeEngine.loadGraph(graphFromServerSemanticSnapshot(input.snapshot));
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
  const unsubscribeResult = input.sdk.onSemanticResult?.((message) => {
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
