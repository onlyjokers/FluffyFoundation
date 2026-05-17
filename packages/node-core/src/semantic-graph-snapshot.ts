/**
 * Purpose: Build FF-09 semantic graph snapshots without Canvas UI noise.
 */

import type { GraphState } from './types.js';
import type {
  AgentGroupInterface,
  AgentGroupPolicy,
  AgentCapabilitySettings,
  CustomNodeDefinition,
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
import type {
  ControlPlaneActorRole,
  ControlPlaneCapability,
  ControlPlaneVisibilityAccess,
} from '@shugu/protocol';

export const cloneRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};

const cloneStringArray = (values: string[] | undefined): string[] | undefined =>
  values ? [...values] : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeStringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? value.map(String).filter(Boolean) : undefined;

const normalizeAgentPorts = (value: unknown): AgentGroupInterface['publicInputs'] | undefined =>
  Array.isArray(value)
    ? value
        .filter(isRecord)
        .map((port) => ({
          id: String(port.id ?? ''),
          type: String(port.type ?? 'any'),
          ...(port.label === undefined ? {} : { label: String(port.label) }),
          ...(port.description === undefined ? {} : { description: String(port.description) }),
        }))
        .filter((port) => port.id.length > 0)
    : undefined;

const cloneAgentInterface = (
  value: AgentGroupInterface | undefined
): AgentGroupInterface | undefined =>
  value
    ? {
        publicInputs: value.publicInputs
          ? value.publicInputs.map((port) => ({ ...port }))
          : undefined,
        publicOutputs: value.publicOutputs
          ? value.publicOutputs.map((port) => ({ ...port }))
          : undefined,
        exposedNodeIds: cloneStringArray(value.exposedNodeIds),
        callableCommands: cloneStringArray(value.callableCommands),
        eventBindings: cloneStringArray(value.eventBindings),
      }
    : undefined;

const normalizeAgentInterface = (value: unknown): AgentGroupInterface | undefined => {
  if (!isRecord(value)) return undefined;
  return {
    publicInputs: normalizeAgentPorts(value.publicInputs),
    publicOutputs: normalizeAgentPorts(value.publicOutputs),
    exposedNodeIds: normalizeStringArray(value.exposedNodeIds),
    callableCommands: normalizeStringArray(value.callableCommands),
    eventBindings: normalizeStringArray(value.eventBindings),
  };
};

const cloneAgentPolicy = (value: AgentGroupPolicy | undefined): AgentGroupPolicy | undefined =>
  value
    ? {
        enabled: value.enabled,
        allowedActorIds: cloneStringArray(value.allowedActorIds),
        allowedCommands: cloneStringArray(value.allowedCommands),
        deniedSurfaces: value.deniedSurfaces ? [...value.deniedSurfaces] : undefined,
        targetScope: value.targetScope
          ? {
              nodeIds: cloneStringArray(value.targetScope.nodeIds),
              allowNewNodes: value.targetScope.allowNewNodes,
            }
          : undefined,
        budgets: value.budgets ? { ...value.budgets } : undefined,
        approvalRequired: value.approvalRequired,
        rollbackOnReject: value.rollbackOnReject,
      }
    : undefined;

const normalizeAgentPolicy = (value: unknown): AgentGroupPolicy | undefined => {
  if (!isRecord(value)) return undefined;
  const targetScope = isRecord(value.targetScope)
    ? {
        nodeIds: normalizeStringArray(value.targetScope.nodeIds),
        allowNewNodes:
          typeof value.targetScope.allowNewNodes === 'boolean'
            ? value.targetScope.allowNewNodes
            : undefined,
        allowedNodeTypes: normalizeStringArray(value.targetScope.allowedNodeTypes),
        deniedNodeTypes: normalizeStringArray(value.targetScope.deniedNodeTypes),
      }
    : undefined;
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : undefined,
    allowedActorIds: normalizeStringArray(value.allowedActorIds),
    allowedCommands: normalizeStringArray(value.allowedCommands),
    deniedSurfaces: normalizeStringArray(
      value.deniedSurfaces
    ) as AgentGroupPolicy['deniedSurfaces'],
    targetScope,
    budgets: isRecord(value.budgets) ? { ...value.budgets } : undefined,
    approvalRequired:
      typeof value.approvalRequired === 'boolean' ? value.approvalRequired : undefined,
    rollbackOnReject:
      typeof value.rollbackOnReject === 'boolean' ? value.rollbackOnReject : undefined,
  };
};

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
    kind: group.kind === 'ai-space' ? 'ai-space' : group.kind === 'group' ? 'group' : undefined,
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
    agentInterface: cloneAgentInterface(group.agentInterface),
    agentPolicy: cloneAgentPolicy(group.agentPolicy),
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
    failureReport: partition.failureReport
      ? {
          ...partition.failureReport,
          watchdog: partition.failureReport.watchdog
            ? { ...partition.failureReport.watchdog }
            : undefined,
          resourceBudget: partition.failureReport.resourceBudget
            ? { ...partition.failureReport.resourceBudget }
            : undefined,
        }
      : undefined,
  }));

export const cloneProposals = (proposals: SemanticProposal[]): SemanticProposal[] =>
  proposals.map((proposal) => ({ ...proposal, commands: [...(proposal.commands ?? [])] }));

export const cloneRuntimeStatus = (
  runtimeStatus: RuntimeStatus = defaultRuntimeStatus
): RuntimeStatus => ({
  ...defaultRuntimeStatus,
  ...runtimeStatus,
  deployedPartitionIds: [...(runtimeStatus.deployedPartitionIds ?? [])],
  runtimeOverrides: runtimeStatus.runtimeOverrides
    ? runtimeStatus.runtimeOverrides.map((override) => ({ ...override }))
    : undefined,
});

const defaultRuntimeStatus: RuntimeStatus = { running: false, deployedPartitionIds: [] };

export const cloneCustomDefinitions = (
  definitions: CustomNodeDefinition[] = []
): CustomNodeDefinition[] =>
  definitions.map((definition) => ({
    definitionId: String(definition.definitionId ?? ''),
    name: String(definition.name ?? ''),
    template: cloneGraph(definition.template ?? { nodes: [], connections: [] }),
    ports: (definition.ports ?? []).map((port) => ({
      portKey: String(port.portKey ?? ''),
      side: port.side === 'input' ? 'input' : 'output',
      label: String(port.label ?? ''),
      type: String(port.type ?? 'any'),
      pinned: Boolean(port.pinned),
      y: Number.isFinite(port.y) ? Number(port.y) : 0,
      binding: {
        nodeId: String(port.binding?.nodeId ?? ''),
        portId: String(port.binding?.portId ?? ''),
      },
    })),
  }));

export const cloneAgentCapabilities = (
  settings: AgentCapabilitySettings | undefined
): AgentCapabilitySettings => ({
  version: 1,
  nodes: (settings?.nodes ?? []).map((node) => ({
    nodeType: String(node.nodeType ?? ''),
    enabled: Boolean(node.enabled),
    ...(node.source ? { source: node.source } : {}),
    ...(node.aiNotes ? { aiNotes: String(node.aiNotes) } : {}),
    ...(node.disabledReason ? { disabledReason: String(node.disabledReason) } : {}),
    ...(node.updatedAt ? { updatedAt: String(node.updatedAt) } : {}),
  })).filter((node) => node.nodeType.length > 0),
});

export const normalizeDefinitions = (
  definitions: SemanticSnapshotInput['definitions'] = []
): SemanticDefinition[] =>
  definitions.map((def) => {
    const record = def as Record<string, unknown>;
    const ports =
      record.ports && typeof record.ports === 'object'
        ? (record.ports as { inputs?: unknown; outputs?: unknown })
        : null;
    const inputs = Array.isArray(def.inputs)
      ? def.inputs
      : Array.isArray(ports?.inputs)
        ? ports.inputs
        : [];
    const outputs = Array.isArray(def.outputs)
      ? def.outputs
      : Array.isArray(ports?.outputs)
        ? ports.outputs
        : [];
    const params = Array.isArray(def.configSchema)
      ? def.configSchema
      : Array.isArray(record.params)
        ? (record.params as SemanticDefinition['params'])
        : [];

    return {
      type: String(def.type),
      label: String(def.label ?? def.type),
      category: String(def.category ?? 'Other'),
      ports: { inputs: [...inputs], outputs: [...outputs] },
      params: [...params],
      aiSummary: createAgentNodeDefinitionSummary({
        type: String(def.type),
        label: String(def.label ?? def.type),
        category: String(def.category ?? 'Other'),
        inputs: [...inputs],
        outputs: [...outputs],
        configSchema: [...params],
        metadata: def.metadata,
        process: () => ({}),
      }),
    };
  });

export const normalizeGroups = (groups: SemanticSnapshotInput['groups'] = []): SemanticGroup[] =>
  groups.map((group) => ({
    id: String(group.id ?? ''),
    parentId: group.parentId ? String(group.parentId) : null,
    name: String(group.name ?? 'Group'),
    nodeIds: Array.isArray(group.nodeIds)
      ? group.nodeIds.map((id) => String(id)).filter(Boolean)
      : [],
    disabled: Boolean(group.disabled),
    kind: group.kind === 'ai-space' ? 'ai-space' : group.kind === 'group' ? 'group' : undefined,
    archived: group.archived === undefined ? undefined : Boolean(group.archived),
    runtimeActive: group.runtimeActive === undefined ? undefined : Boolean(group.runtimeActive),
    owner:
      group.owner && typeof group.owner === 'object'
        ? {
            actorId: String((group.owner as Record<string, unknown>).actorId ?? ''),
            role: String(
              (group.owner as Record<string, unknown>).role ?? 'client'
            ) as ControlPlaneActorRole,
            capabilities: Array.isArray((group.owner as Record<string, unknown>).capabilities)
              ? (((group.owner as Record<string, unknown>).capabilities as unknown[]).map(
                  String
                ) as ControlPlaneCapability[])
              : [],
          }
        : undefined,
    ownerStack: Array.isArray(group.ownerStack)
      ? group.ownerStack.map((owner) => ({
          actorId: String((owner as Record<string, unknown>).actorId ?? ''),
          role: String(
            (owner as Record<string, unknown>).role ?? 'client'
          ) as ControlPlaneActorRole,
          capabilities: Array.isArray((owner as Record<string, unknown>).capabilities)
            ? (((owner as Record<string, unknown>).capabilities as unknown[]).map(
                String
              ) as ControlPlaneCapability[])
            : [],
        }))
      : undefined,
    transferable: group.transferable === undefined ? undefined : Boolean(group.transferable),
    surface: group.surface === 'public' || group.surface === 'internal' ? group.surface : undefined,
    visibility:
      group.visibility && typeof group.visibility === 'object'
        ? {
            defaultAccess: String(
              (group.visibility as Record<string, unknown>).defaultAccess ?? 'visible-readonly'
            ) as ControlPlaneVisibilityAccess,
          }
        : undefined,
    agentInterface: normalizeAgentInterface(group.agentInterface),
    agentPolicy: normalizeAgentPolicy(group.agentPolicy),
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
    customDefinitions: cloneCustomDefinitions(input.customDefinitions),
    agentCapabilities: cloneAgentCapabilities(input.agentCapabilities),
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
