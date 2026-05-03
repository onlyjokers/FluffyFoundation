/**
 * Purpose: Versioned graph/project schema migration helpers for shared semantic graph state.
 */

import type { GraphState } from '../types.js';
import type { SemanticGroup, SemanticPartition } from '../semantic-graph-types.js';
import { cloneGraph, cloneGroups, clonePartitions } from '../semantic-graph-snapshot.js';

export const CURRENT_PROJECT_SCHEMA_VERSION = 2;

export type ProjectSchemaV2 = {
  schemaVersion: typeof CURRENT_PROJECT_SCHEMA_VERSION;
  graph: GraphState;
  groups: SemanticGroup[];
  partitions: SemanticPartition[];
  metadata: Record<string, unknown>;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asString = (value: unknown, fallback = ''): string => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
};

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : [];

const normalizeNode = (value: unknown) => {
  const node = asRecord(value);
  const position = asRecord(node.position);
  const config = asRecord(node.config);
  const inputValues = asRecord(node.inputValues);
  const outputValues = asRecord(node.outputValues);
  return {
    id: asString(node.id),
    type: asString(node.type),
    position: {
      x: asNumber(position.x, asNumber(node.x, 0)),
      y: asNumber(position.y, asNumber(node.y, 0)),
    },
    config: { ...config },
    inputValues: { ...inputValues },
    outputValues: { ...outputValues },
  };
};

const normalizeConnection = (value: unknown) => {
  const conn = asRecord(value);
  const from = asRecord(conn.from);
  const to = asRecord(conn.to);
  return {
    id: asString(conn.id),
    sourceNodeId: asString(conn.sourceNodeId, asString(from.node)),
    sourcePortId: asString(conn.sourcePortId, asString(from.port)),
    targetNodeId: asString(conn.targetNodeId, asString(to.node)),
    targetPortId: asString(conn.targetPortId, asString(to.port)),
  };
};

const normalizeGraph = (value: unknown): GraphState => {
  const graph = asRecord(value);
  const rawConnections = Array.isArray(graph.connections) ? graph.connections : graph.edges;
  return {
    nodes: Array.isArray(graph.nodes)
      ? graph.nodes.map(normalizeNode).filter((node) => node.id && node.type)
      : [],
    connections: Array.isArray(rawConnections)
      ? rawConnections
          .map(normalizeConnection)
          .filter(
            (conn) =>
              conn.id &&
              conn.sourceNodeId &&
              conn.sourcePortId &&
              conn.targetNodeId &&
              conn.targetPortId
          )
      : [],
  };
};

const normalizeGroup = (value: unknown): SemanticGroup => {
  const group = asRecord(value);
  const normalized: SemanticGroup = {
    id: asString(group.id),
    parentId: group.parentId ? asString(group.parentId) : null,
    name: asString(group.name, 'Group'),
    nodeIds: Array.isArray(group.nodeIds) ? asStringArray(group.nodeIds) : asStringArray(group.nodes),
    disabled: Boolean(group.disabled),
  };
  if (group.archived !== undefined) normalized.archived = Boolean(group.archived);
  if (group.runtimeActive !== undefined) normalized.runtimeActive = Boolean(group.runtimeActive);
  return normalized;
};

const normalizePartition = (value: unknown): SemanticPartition => {
  const partition = asRecord(value);
  const status = asString(partition.status, 'draft');
  const safeStatus =
    status === 'deployed' || status === 'stopped' || status === 'error' || status === 'draft'
      ? status
      : 'draft';
  return {
    id: asString(partition.id),
    nodeIds: asStringArray(partition.nodeIds),
    status: safeStatus,
    requiredCapabilities: Array.isArray(partition.requiredCapabilities)
      ? asStringArray(partition.requiredCapabilities)
      : undefined,
    error: typeof partition.error === 'string' ? partition.error : undefined,
  };
};

export function migrateProjectSchema(input: unknown): ProjectSchemaV2 {
  const project = asRecord(input);
  if (project.schemaVersion === CURRENT_PROJECT_SCHEMA_VERSION) {
    return {
      schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
      graph: cloneGraph(normalizeGraph(project.graph)),
      groups: cloneGroups(
        Array.isArray(project.groups)
          ? project.groups.map(normalizeGroup).filter((group) => group.id)
          : []
      ),
      partitions: clonePartitions(
        Array.isArray(project.partitions)
          ? project.partitions.map(normalizePartition).filter((partition) => partition.id)
          : []
      ),
      metadata: { ...asRecord(project.metadata) },
    };
  }

  const graph = normalizeGraph(project.graph);
  return {
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    graph,
    groups: Array.isArray(project.groups)
      ? project.groups.map(normalizeGroup).filter((group) => group.id)
      : [],
    partitions: Array.isArray(project.partitions)
      ? project.partitions.map(normalizePartition).filter((partition) => partition.id)
      : [],
    metadata: { migratedFromVersion: project.version ?? project.schemaVersion ?? 1 },
  };
}
