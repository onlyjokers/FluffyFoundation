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
import { createAgentNodeDefinitionSummary } from './node-definition-metadata.js';
import type { ControlPlaneActorRole, ControlPlaneCapability, ControlPlaneVisibilityAccess } from '@shugu/protocol';

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
    owner: group.owner
      ? { ...group.owner, capabilities: [...(group.owner.capabilities ?? [])] }
      : undefined,
    ownerStack: group.ownerStack
      ? group.ownerStack.map((owner) => ({
          ...owner,
          capabilities: [...(owner.capabilities ?? [])],
        }))
      : undefined,
    visibility: group.visibility ? { ...group.visibility } : undefined,
  }));

export const clonePartitions = (partitions: SemanticPartition[]): SemanticPartition[] =>
  partitions.map((partition) => ({
    ...partition,
    nodeIds: [...(partition.nodeIds ?? [])],
    targetPlatform: partition.targetPlatform ?? 'manager',
    requiredCapabilities: partition.requiredCapabilities
      ? [...partition.requiredCapabilities]
      : undefined,
    resourceBudget: partition.resourceBudget ? { ...partition.resourceBudget } : undefined,
    watchdog: partition.watchdog ? { ...partition.watchdog } : undefined,
    failureReport: partition.failureReport ? {
      ...partition.failureReport,
      watchdog: partition.failureReport.watchdog ? { ...partition.failureReport.watchdog } : undefined,
      resourceBudget: partition.failureReport.resourceBudget
        ? { ...partition.failureReport.resourceBudget }
        : undefined,
    } : undefined,
  }));

export const cloneProposals = (proposals: SemanticProposal[]): SemanticProposal[] =>
  proposals.map((proposal) => ({ ...proposal, commands: [...(proposal.commands ?? [])] }));

export const cloneRuntimeStatus = (runtimeStatus: RuntimeStatus = defaultRuntimeStatus): RuntimeStatus => ({
  ...defaultRuntimeStatus,
  ...runtimeStatus,
  deployedPartitionIds: [...(runtimeStatus.deployedPartitionIds ?? [])],
  runtimeOverrides: runtimeStatus.runtimeOverrides
    ? runtimeStatus.runtimeOverrides.map((override) => ({ ...override }))
    : undefined,
});

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
    aiSummary: createAgentNodeDefinitionSummary({
      type: String(def.type),
      label: String(def.label ?? def.type),
      category: String(def.category ?? 'Other'),
      inputs: [...(def.inputs ?? [])],
      outputs: [...(def.outputs ?? [])],
      configSchema: [...(def.configSchema ?? [])],
      metadata: def.metadata,
      process: () => ({}),
    }),
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
    owner:
      group.owner && typeof group.owner === 'object'
        ? {
            actorId: String((group.owner as Record<string, unknown>).actorId ?? ''),
            role: String((group.owner as Record<string, unknown>).role ?? 'client') as ControlPlaneActorRole,
            capabilities: Array.isArray((group.owner as Record<string, unknown>).capabilities)
              ? ((group.owner as Record<string, unknown>).capabilities as unknown[]).map(String) as ControlPlaneCapability[]
              : [],
          }
        : undefined,
    ownerStack: Array.isArray(group.ownerStack)
      ? group.ownerStack.map((owner) => ({
          actorId: String((owner as Record<string, unknown>).actorId ?? ''),
          role: String((owner as Record<string, unknown>).role ?? 'client') as ControlPlaneActorRole,
          capabilities: Array.isArray((owner as Record<string, unknown>).capabilities)
            ? ((owner as Record<string, unknown>).capabilities as unknown[]).map(String) as ControlPlaneCapability[]
            : [],
        }))
      : undefined,
    transferable: group.transferable === undefined ? undefined : Boolean(group.transferable),
    surface:
      group.surface === 'public' || group.surface === 'internal'
        ? group.surface
        : undefined,
    visibility:
      group.visibility && typeof group.visibility === 'object'
        ? {
            defaultAccess: String(
              (group.visibility as Record<string, unknown>).defaultAccess ?? 'visible-readonly'
            ) as ControlPlaneVisibilityAccess,
          }
        : undefined,
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
    runtimeStatus: cloneRuntimeStatus(input.runtimeStatus),
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
