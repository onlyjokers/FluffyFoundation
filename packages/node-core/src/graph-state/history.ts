/**
 * Purpose: Track semantic graph revisions while ignoring layout-only Canvas noise.
 */

import type { GraphState } from '../types.js';
import type { SemanticGroup, SemanticPartition } from '../semantic-graph-types.js';
import { cloneGraph, cloneGroups, clonePartitions } from '../semantic-graph-snapshot.js';

export type SemanticHistoryInput = {
  graph: GraphState;
  groups?: SemanticGroup[];
  partitions?: SemanticPartition[];
  revision: number;
};

export type SemanticHistoryEntry = SemanticHistoryInput & { semanticHash: string };

export type SemanticHistory = {
  record: (input: SemanticHistoryInput) => { recorded: boolean; entry: SemanticHistoryEntry };
  entries: () => SemanticHistoryEntry[];
  getRevision: (revision: number) => SemanticHistoryEntry | undefined;
};

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const semanticProjection = (input: SemanticHistoryInput): Record<string, unknown> => ({
  nodes: cloneGraph(input.graph).nodes
    .map((node) => ({
      id: String(node.id),
      type: String(node.type),
      config: node.config ?? {},
      inputValues: node.inputValues ?? {},
      outputValues: node.outputValues ?? {},
    }))
    .sort((a, b) => a.id.localeCompare(b.id)),
  connections: cloneGraph(input.graph).connections
    .map((conn) => ({
      id: String(conn.id),
      sourceNodeId: String(conn.sourceNodeId),
      sourcePortId: String(conn.sourcePortId),
      targetNodeId: String(conn.targetNodeId),
      targetPortId: String(conn.targetPortId),
    }))
    .sort((a, b) => a.id.localeCompare(b.id)),
  groups: cloneGroups(input.groups ?? [])
    .map((group) => ({
      id: group.id,
      parentId: group.parentId,
      name: group.name,
      nodeIds: [...group.nodeIds].sort(),
      disabled: group.disabled,
      archived: group.archived,
      runtimeActive: group.runtimeActive,
    }))
    .sort((a, b) => a.id.localeCompare(b.id)),
  partitions: clonePartitions(input.partitions ?? [])
    .map((partition) => ({
      id: partition.id,
      nodeIds: [...partition.nodeIds].sort(),
      status: partition.status,
      requiredCapabilities: partition.requiredCapabilities
        ? [...partition.requiredCapabilities].sort()
        : undefined,
      error: partition.error,
    }))
    .sort((a, b) => a.id.localeCompare(b.id)),
});

export function createSemanticHash(input: SemanticHistoryInput): string {
  return stableStringify(semanticProjection(input));
}

const makeEntry = (input: SemanticHistoryInput): SemanticHistoryEntry => ({
  graph: cloneGraph(input.graph),
  groups: cloneGroups(input.groups ?? []),
  partitions: clonePartitions(input.partitions ?? []),
  revision: Number(input.revision),
  semanticHash: createSemanticHash(input),
});

export function createSemanticHistory(initial: SemanticHistoryInput): SemanticHistory {
  const entries: SemanticHistoryEntry[] = [makeEntry(initial)];

  return {
    record: (input) => {
      const entry = makeEntry(input);
      const previous = entries[entries.length - 1];
      if (previous?.semanticHash === entry.semanticHash) return { recorded: false, entry: previous };
      entries.push(entry);
      return { recorded: true, entry };
    },
    entries: () => entries.map((entry) => makeEntry(entry)),
    getRevision: (revision) => entries.find((entry) => entry.revision === revision),
  };
}
