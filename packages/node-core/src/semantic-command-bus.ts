/**
 * Purpose: FF-09 transactional semantic command bus shared by Canvas, CLI/API, and AI.
 */

import type {
  CommandAuditEntry,
  CommandState,
  SemanticCommand,
  SemanticCommandBus,
  SemanticCommandBusInput,
  SemanticCommandPolicy,
  SemanticActor,
  SemanticGraphSnapshot,
  SemanticGroup,
} from './semantic-graph-types.js';
import {
  cloneGraph,
  cloneAgentCapabilities,
  cloneCustomDefinitions,
  cloneGroups,
  clonePartitions,
  cloneProposals,
  cloneRuntimeStatus,
  createSemanticGraphSnapshot,
  normalizeDefinitions,
  normalizeGroups,
} from './semantic-graph-snapshot.js';
import { applySemanticCommand, validateSemanticCommandDetailed } from './semantic-command-apply.js';
import { normalizeSemanticCommand } from './semantic-command-normalization.js';
import { createSemanticHistory } from './graph-state/history.js';
import {
  cloneCommandState,
  recoveryForRollback,
  stateFromHistoryEntry,
} from './semantic-command-state.js';
import {
  CONTROL_PLANE_CAPABILITIES_BY_ROLE,
  type ControlPlaneActorRole,
  type ControlPlaneCapability,
} from '@shugu/protocol';

export * from './semantic-graph-types.js';
export { createSemanticGraphSnapshot } from './semantic-graph-snapshot.js';

const lifecycle: CommandAuditEntry['lifecycle'] = [
  'dry-run',
  'policy',
  'apply',
  'audit',
  'history',
  'rollback-token',
];

const defaultPolicy: SemanticCommandPolicy = { canExecute: () => true };

const commandOperation = (command: SemanticCommand): string => command.type;

export function createSemanticCommandBus(input: SemanticCommandBusInput): SemanticCommandBus {
  const definitions = normalizeDefinitions(input.definitions);
  const auditLog: CommandAuditEntry[] = [];
  const history: CommandAuditEntry[] = [];
  const rollbackSnapshots = new Map<string, CommandState>();
  let state: CommandState = {
    graph: cloneGraph(input.graph ?? { nodes: [], connections: [] }),
    groups: normalizeGroups(input.groups),
    partitions: clonePartitions(input.partitions ?? []),
    customDefinitions: cloneCustomDefinitions(input.customDefinitions),
    agentCapabilities: cloneAgentCapabilities(input.agentCapabilities),
    proposals: cloneProposals(input.proposals ?? []),
    runtimeStatus: cloneRuntimeStatus(input.runtimeStatus),
    revision: Number.isFinite(input.revision) ? Number(input.revision) : 0,
  };
  const semanticHistory = createSemanticHistory({
    graph: state.graph,
    groups: state.groups,
    partitions: state.partitions,
    revision: state.revision,
  });

  const snapshot = () =>
    createSemanticGraphSnapshot({
      ...input,
      graph: state.graph,
      definitions,
      customDefinitions: state.customDefinitions,
      agentCapabilities: state.agentCapabilities,
      groups: state.groups,
      partitions: state.partitions,
      proposals: state.proposals,
      runtimeStatus: state.runtimeStatus,
      revision: state.revision,
    });

  const dispatch: SemanticCommandBus['dispatch'] = ({ actor, command, dryRun = false }) => {
    const previousRevision = state.revision;
    const rollbackToken = `rollback:${previousRevision}:${history.length + auditLog.length + 1}`;
    const normalized = normalizeSemanticCommand(state, command, definitions);
    const validationErrors = validateSemanticCommandDetailed(
      state,
      normalized.command,
      definitions
    );
    if (validationErrors.length > 0) {
      return {
        ok: false,
        command: normalized.command,
        dryRun,
        stage: 'dry-run',
        message: validationErrors[0].message,
        validationErrors,
        previousRevision,
        appliedRevision: previousRevision,
        snapshot: snapshot(),
      };
    }

    const policyResult = (input.policy ?? defaultPolicy).canExecute({
      actor,
      command: normalized.command,
      snapshot: snapshot(),
    });
    const policy =
      typeof policyResult === 'boolean'
        ? { allowed: policyResult, reason: policyResult ? undefined : 'Policy denied command.' }
        : { allowed: Boolean(policyResult.allowed), reason: policyResult.reason };
    if (!policy.allowed) {
      return {
        ok: false,
        command: normalized.command,
        dryRun,
        stage: 'policy',
        message: policy.reason ?? 'Policy denied command.',
        previousRevision,
        appliedRevision: previousRevision,
        snapshot: snapshot(),
      };
    }

    let nextState: CommandState;
    try {
      nextState = applySemanticCommand(state, normalized.command);
      if (normalized.command.type === 'group.reclaim') {
        const groupId = normalized.command.groupId;
        nextState.groups = nextState.groups.map((group) =>
          group.id === groupId
            ? {
                ...group,
                owner: ownershipActorForSemanticActor(actor),
              }
            : group
        );
      }
    } catch (err) {
      return {
        ok: false,
        command: normalized.command,
        dryRun,
        stage: 'apply',
        message: err instanceof Error ? err.message : 'Command apply failed.',
        previousRevision,
        appliedRevision: previousRevision,
        snapshot: snapshot(),
      };
    }

    const audit: CommandAuditEntry = {
      id: `audit:${previousRevision}:${commandOperation(normalized.command)}:${auditLog.length + 1}`,
      actor: { ...actor },
      command: normalized.command,
      dryRun,
      lifecycle: [...lifecycle],
      policy,
      previousRevision,
      appliedRevision: dryRun ? previousRevision : nextState.revision,
      rollbackToken,
      createdAt: new Date(0).toISOString(),
    };

    auditLog.push(audit);
    if (!dryRun && normalized.command.type !== 'graph.snapshot') {
      rollbackSnapshots.set(rollbackToken, cloneCommandState(state));
      state = nextState;
      semanticHistory.record({
        graph: state.graph,
        groups: state.groups,
        partitions: state.partitions,
        customDefinitions: state.customDefinitions,
        agentCapabilities: state.agentCapabilities,
        revision: state.revision,
      });
      history.push(audit);
    }

    return {
      ok: true,
      command: normalized.command,
      dryRun,
      previousRevision,
      appliedRevision: dryRun ? previousRevision : state.revision,
      rollbackToken,
      audit,
      ...(normalized.warnings.length > 0 ? { warnings: normalized.warnings } : {}),
      snapshot: snapshot(),
    };
  };

  const rollback: SemanticCommandBus['rollback'] = (rollbackToken) => {
    const previous = rollbackSnapshots.get(String(rollbackToken));
    if (!previous) return { ok: false, message: 'Rollback token not found.', snapshot: snapshot() };
    const recovery = recoveryForRollback(state, previous);
    state = {
      graph: cloneGraph(previous.graph),
      groups: cloneGroups(previous.groups),
      partitions: clonePartitions(previous.partitions),
      customDefinitions: cloneCustomDefinitions(previous.customDefinitions),
      agentCapabilities: cloneAgentCapabilities(previous.agentCapabilities),
      proposals: cloneProposals(previous.proposals),
      runtimeStatus: cloneRuntimeStatus(previous.runtimeStatus),
      revision: state.revision + 1,
    };
    semanticHistory.record({
      graph: state.graph,
      groups: state.groups,
      partitions: state.partitions,
      revision: state.revision,
    });
    return { ok: true, recovery, snapshot: snapshot() };
  };

  const rollbackToRevision: SemanticCommandBus['rollbackToRevision'] = (revision) => {
    const targetRevision = Number(revision);
    if (!Number.isFinite(targetRevision)) {
      return { ok: false, message: 'Rollback revision is invalid.', snapshot: snapshot() };
    }
    const previous = semanticHistory.getRevision(targetRevision);
    if (!previous) {
      return { ok: false, message: 'Semantic revision not found.', snapshot: snapshot() };
    }
    const restored = stateFromHistoryEntry(previous, state.proposals, state.revision + 1);
    const recovery = recoveryForRollback(state, restored);
    state = restored;
    semanticHistory.record({
      graph: state.graph,
      groups: state.groups,
      partitions: state.partitions,
      revision: state.revision,
    });
    return { ok: true, recovery, snapshot: snapshot() };
  };

  return {
    dispatch,
    rollback,
    rollbackToRevision,
    getSnapshot: snapshot,
    getHistory: () => [...history],
    getAuditLog: () => [...auditLog],
  };
}

export function createGroupSovereigntyPolicy(): SemanticCommandPolicy {
  return {
    canExecute: ({ actor, command, snapshot }) => {
      const role = normalizeRole(actor.role);
      const capabilities = new Set(CONTROL_PLANE_CAPABILITIES_BY_ROLE[role] ?? []);

      if (command.type === 'proposal.create') {
        return capabilities.has('proposal.create')
          ? { allowed: true }
          : { allowed: false, reason: 'Actor lacks proposal.create capability.' };
      }

      if (command.type === 'proposal.approve') {
        return role === 'manager' || role === 'root' || role === 'service'
          ? { allowed: true }
          : { allowed: false, reason: 'Manager, service, or root approval authority is required.' };
      }

      if (command.type === 'partition.stop.all') {
        return role === 'root' && capabilities.has('root.stopAll')
          ? { allowed: true }
          : { allowed: false, reason: 'Root stop-all emergency authority is required.' };
      }

      const group = groupForCommand(snapshot.groups, command);
      if (!group) {
        const capability = requiredCapability(command);
        return capability && !capabilities.has(capability)
          ? { allowed: false, reason: `Actor lacks ${capability} capability.` }
          : { allowed: true };
      }

      if (role === 'ai' && group.kind === 'ai-space' && group.agentPolicy?.enabled) {
        return evaluateAgentGroupPolicy({ actor, command, group, snapshot });
      }

      if (role === 'root') return { allowed: true };

      if (command.type === 'group.reclaim') {
        if (!capabilities.has('group.reclaim')) {
          return { allowed: false, reason: 'Actor lacks group.reclaim capability.' };
        }
        if (!group.transferable) {
          return { allowed: false, reason: 'Group is not transferable.' };
        }
        return { allowed: true };
      }

      if (command.type === 'group.release') {
        if (!isOwner(actor.id, group)) {
          return { allowed: false, reason: 'Only the current Group owner can release ownership.' };
        }
        return capabilities.has('group.release')
          ? { allowed: true }
          : { allowed: false, reason: 'Actor lacks group.release capability.' };
      }

      const capability = requiredCapability(command);
      if (capability && !capabilities.has(capability)) {
        return {
          allowed: false,
          reason:
            role === 'ai'
              ? 'AI actors must use proposal workflow for direct Canvas mutations.'
              : `Actor lacks ${capability} capability.`,
        };
      }

      if (!isOwner(actor.id, group)) {
        const access = group.visibility?.defaultAccess ?? 'visible-readonly';
        return {
          allowed: false,
          reason: `Group is ${access}; actor is not the owner.`,
        };
      }

      return { allowed: true };
    },
  };
}

function normalizeRole(role: string): ControlPlaneActorRole {
  return role === 'root' ||
    role === 'manager' ||
    role === 'client' ||
    role === 'service' ||
    role === 'ai'
    ? role
    : 'client';
}

function ownershipActorForSemanticActor(actor: SemanticActor) {
  const role = normalizeRole(actor.role);
  return {
    actorId: actor.id,
    role,
    capabilities: [...(CONTROL_PLANE_CAPABILITIES_BY_ROLE[role] ?? [])],
  };
}

function isOwner(actorId: string, group: { owner?: { actorId: string } }): boolean {
  return group.owner?.actorId === actorId;
}

function requiredCapability(command: SemanticCommand): ControlPlaneCapability | null {
  if (command.type.startsWith('node.') || command.type === 'group.update') return 'group.mutate';
  if (command.type === 'group.archive' || command.type === 'group.delete') return 'group.archive';
  if (command.type === 'group.restore') return 'group.restore';
  if (command.type === 'partition.deploy') return 'partition.deploy';
  if (command.type === 'partition.redeploy') return 'partition.deploy';
  if (
    command.type === 'partition.start' ||
    command.type === 'partition.stop' ||
    command.type === 'partition.remove' ||
    command.type === 'partition.report.failure'
  )
    return 'partition.stop';
  return null;
}

function groupForCommand(groups: SemanticGraphSnapshot['groups'], command: SemanticCommand) {
  const scopedGroupId = scopeGroupIdFor(command);
  if (scopedGroupId) {
    return groups.find((group) => group.id === scopedGroupId) ?? null;
  }
  if ('groupId' in command) {
    return groups.find((group) => group.id === command.groupId) ?? null;
  }
  if ('nodeId' in command) {
    return groups.find((group) => group.nodeIds.includes(command.nodeId)) ?? null;
  }
  if (command.type === 'node.connect') {
    return groups.find((group) => group.nodeIds.includes(command.connection.sourceNodeId)) ?? null;
  }
  if (command.type === 'node.add') return null;
  return null;
}

function scopeGroupIdFor(command: SemanticCommand): string | null {
  return 'scopeGroupId' in command &&
    typeof command.scopeGroupId === 'string' &&
    command.scopeGroupId.length > 0
    ? command.scopeGroupId
    : null;
}

function commandSurface(command: SemanticCommand): string | null {
  if (command.type.startsWith('partition.')) return 'partition';
  if (command.type.startsWith('runtime.override.')) return 'device';
  if (command.type.startsWith('node.') || command.type.startsWith('group.')) return 'canvas';
  return null;
}

function targetNodeIdsForCommand(
  command: SemanticCommand,
  snapshot: SemanticGraphSnapshot
): string[] {
  if (command.type === 'node.add') return [command.node.id];
  if ('nodeId' in command) return [String(command.nodeId)];
  if (command.type === 'node.connect') {
    return [String(command.connection.sourceNodeId), String(command.connection.targetNodeId)];
  }
  if (command.type === 'node.disconnect') {
    const connection = snapshot.connections.find((item) => item.id === command.connectionId);
    return connection ? [String(connection.sourceNodeId), String(connection.targetNodeId)] : [];
  }
  if (command.type === 'partition.deploy') return command.nodeIds.map(String);
  return [];
}

function countGroupConnections(snapshot: SemanticGraphSnapshot, group: SemanticGroup): number {
  const nodeIds = new Set(group.nodeIds);
  return snapshot.connections.filter(
    (connection) =>
      nodeIds.has(String(connection.sourceNodeId)) && nodeIds.has(String(connection.targetNodeId))
  ).length;
}

function evaluateAgentGroupPolicy(input: {
  actor: SemanticActor;
  command: SemanticCommand;
  group: SemanticGroup;
  snapshot: SemanticGraphSnapshot;
}): { allowed: boolean; reason?: string } {
  const policy = input.group.agentPolicy;
  if (!policy?.enabled) return { allowed: false, reason: 'AI Space policy is disabled.' };

  if (policy.allowedActorIds && !policy.allowedActorIds.includes(input.actor.id)) {
    return { allowed: false, reason: 'AI actor is not assigned to this AI Space sandbox.' };
  }

  if (policy.allowedCommands && !policy.allowedCommands.includes(input.command.type)) {
    return {
      allowed: false,
      reason: `Command ${input.command.type} is not allowed by AI Space policy.`,
    };
  }

  if (policy.approvalRequired) {
    return {
      allowed: false,
      reason: 'AI Space policy requires proposal approval for this command.',
    };
  }

  const surface = commandSurface(input.command);
  if (surface && policy.deniedSurfaces?.includes(surface as never)) {
    return { allowed: false, reason: `AI Space policy denies ${surface} surface commands.` };
  }

  const scopedNodes = new Set([
    ...input.group.nodeIds.map(String),
    ...(policy.targetScope?.nodeIds ?? []).map(String),
  ]);
  const targetNodeIds = targetNodeIdsForCommand(input.command, input.snapshot);
  if (input.command.type === 'node.add') {
    if (!policy.targetScope?.allowNewNodes) {
      return { allowed: false, reason: 'AI Space policy does not allow new nodes.' };
    }
    const nodeType = String(input.command.node.type);
    const allowedNodeTypes = policy.targetScope?.allowedNodeTypes ?? [];
    if (allowedNodeTypes.length > 0 && !allowedNodeTypes.includes(nodeType)) {
      return {
        allowed: false,
        reason: `AI Space policy does not allow node type ${nodeType}.`,
      };
    }
    const deniedNodeTypes = policy.targetScope?.deniedNodeTypes ?? [];
    if (deniedNodeTypes.includes(nodeType)) {
      return {
        allowed: false,
        reason: `AI Space policy denies node type ${nodeType}.`,
      };
    }
  } else {
    const outOfScope = targetNodeIds.find((nodeId) => !scopedNodes.has(nodeId));
    if (outOfScope) {
      return { allowed: false, reason: `Target ${outOfScope} is outside AI Space scope.` };
    }
  }

  const budgets = policy.budgets ?? {};
  if (
    input.command.type === 'node.params.update' &&
    typeof budgets.maxParamsPerCommand === 'number' &&
    Object.keys(input.command.params).length > budgets.maxParamsPerCommand
  ) {
    return { allowed: false, reason: 'AI Space budget maxParamsPerCommand exceeded.' };
  }

  if (input.command.type === 'node.add' && typeof budgets.maxNodes === 'number') {
    const nextNodeIds = new Set(input.group.nodeIds.map(String));
    nextNodeIds.add(String(input.command.node.id));
    if (nextNodeIds.size > budgets.maxNodes) {
      return { allowed: false, reason: 'AI Space budget maxNodes exceeded.' };
    }
  }

  if (input.command.type === 'node.connect' && typeof budgets.maxConnections === 'number') {
    const nextConnectionCount = countGroupConnections(input.snapshot, input.group) + 1;
    if (nextConnectionCount > budgets.maxConnections) {
      return { allowed: false, reason: 'AI Space budget maxConnections exceeded.' };
    }
  }

  return { allowed: true };
}
