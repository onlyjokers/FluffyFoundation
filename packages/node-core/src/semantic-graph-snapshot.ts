/**
 * Purpose: Build FF-09 semantic graph snapshots without Canvas UI noise.
 */

import type { GraphState } from './types.js';
import type {
  RuntimeStatus,
  SemanticDefinition,
  SemanticGraphSnapshot,
  SemanticGroup,
  SemanticNode,
  SemanticPartition,
  SemanticProposal,
  SemanticSnapshotInput,
} from './semantic-graph-types.js';

export const cloneRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};

export const cloneGraph = (graph: GraphState): GraphState => ({
  nodes: (graph.nodes ?? []).map((node) => ({
    ...node,
    position: { ...(node.position ?? { x: 0, y: 0 }) },
    config: cloneRecord(node.config),
    inputValues: cloneRecord(node.inputValues),
    outputValues: cloneRecord(node.outputValues),
  })),
  connections: (graph.connections ?? []).map((connection) => ({ ...connection })),
});

export const cloneGroups = (groups: SemanticGroup[]): SemanticGroup[] =>
  groups.map((group) => ({
    ...group,
    parentId: group.parentId ? String(group.parentId) : null,
    nodeIds: [...(group.nodeIds ?? [])],
  }));

export const clonePartitions = (partitions: SemanticPartition[]): SemanticPartition[] =>
  partitions.map((partition) => ({
    ...partition,
    nodeIds: [...(partition.nodeIds ?? [])],
    requiredCapabilities: partition.requiredCapabilities
      ? [...partition.requiredCapabilities]
      : undefined,
  }));

export const cloneProposals = (proposals: SemanticProposal[]): SemanticProposal[] =>
  proposals.map((proposal) => ({ ...proposal, commands: [...(proposal.commands ?? [])] }));

const defaultRuntimeStatus: RuntimeStatus = { running: false, deployedPartitionIds: [] };

export const normalizeDefinitions = (
  definitions: SemanticSnapshotInput['definitions'] = []
): SemanticDefinition[] =>
  definitions.map((def) => ({
    type: String(def.type),
    label: String(def.label ?? def.type),
    category: String(def.category ?? 'Other'),
    ports: { inputs: [...(def.inputs ?? [])], outputs: [...(def.outputs ?? [])] },
    params: [...(def.configSchema ?? [])],
  }));

export const normalizeGroups = (groups: SemanticSnapshotInput['groups'] = []): SemanticGroup[] =>
  groups.map((group) => ({
    id: String(group.id ?? ''),
    parentId: group.parentId ? String(group.parentId) : null,
    name: String(group.name ?? 'Group'),
    nodeIds: Array.isArray(group.nodeIds)
      ? group.nodeIds.map((id) => String(id)).filter(Boolean)
      : [],
    disabled: Boolean(group.disabled),
    archived: group.archived === undefined ? undefined : Boolean(group.archived),
    runtimeActive: group.runtimeActive === undefined ? undefined : Boolean(group.runtimeActive),
  }));

export function createSemanticGraphSnapshot(input: SemanticSnapshotInput): SemanticGraphSnapshot {
  const graph = cloneGraph(input.graph ?? { nodes: [], connections: [] });
  return {
    revision: Number.isFinite(input.revision) ? Number(input.revision) : 0,
    nodes: graph.nodes.map((node) => {
      const semanticNode: SemanticNode = {
        id: String(node.id),
        type: String(node.type),
        params: cloneRecord(node.config),
        inputValues: cloneRecord(node.inputValues),
        outputValues: cloneRecord(node.outputValues),
      };
      if (node.config?.archived !== undefined)
        semanticNode.archived = Boolean(node.config.archived);
      return semanticNode;
    }),
    definitions: normalizeDefinitions(input.definitions),
    connections: graph.connections,
    groups: normalizeGroups(input.groups),
    partitions: clonePartitions(input.partitions ?? []),
    runtimeStatus: {
      ...defaultRuntimeStatus,
      ...(input.runtimeStatus ?? {}),
      deployedPartitionIds: [...(input.runtimeStatus?.deployedPartitionIds ?? [])],
    },
    deviceCapabilities: (input.deviceCapabilities ?? []).map((capability) => ({
      ...capability,
      capabilities: [...(capability.capabilities ?? [])],
    })),
    errors: (input.errors ?? []).map((error) => ({ ...error })),
    permissions: (input.permissions ?? []).map((permission) => ({
      ...permission,
      operations: [...(permission.operations ?? [])],
    })),
    proposals: input.proposals ? cloneProposals(input.proposals) : undefined,
  };
}
