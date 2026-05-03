/**
 * Purpose: FF-09 transactional semantic command bus shared by Canvas, CLI/API, and AI.
 */

import type {
  CommandAuditEntry,
  CommandState,
  RollbackRecoveryStatus,
  SemanticCommand,
  SemanticCommandBus,
  SemanticCommandBusInput,
  SemanticCommandPolicy,
  SemanticActor,
  SemanticGraphSnapshot,
} from './semantic-graph-types.js';
import {
  cloneGraph,
  cloneGroups,
  clonePartitions,
  cloneProposals,
  createSemanticGraphSnapshot,
  normalizeDefinitions,
  normalizeGroups,
} from './semantic-graph-snapshot.js';
import { applySemanticCommand, validateSemanticCommand } from './semantic-command-apply.js';
import { createSemanticHistory, type SemanticHistoryEntry } from './graph-state/history.js';
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

const cloneCommandState = (state: CommandState): CommandState => ({
  graph: cloneGraph(state.graph),
  groups: cloneGroups(state.groups),
  partitions: clonePartitions(state.partitions),
  proposals: cloneProposals(state.proposals),
  revision: state.revision,
});

const recoveryForRollback = (current: CommandState, restored: CommandState): RollbackRecoveryStatus => {
  const currentDeployed = current.partitions
    .filter((partition) => partition.status === 'deployed')
    .map((partition) => partition.id)
    .sort();
  const restoredDeployed = restored.partitions
    .filter((partition) => partition.status === 'deployed')
    .map((partition) => partition.id)
    .sort();

  return {
    status: restoredDeployed.length > 0 ? 'redeployed' : 'stopped',
    stoppedPartitionIds: currentDeployed,
    redeployedPartitionIds: restoredDeployed,
    errors: [],
  };
};

const stateFromHistoryEntry = (
  entry: SemanticHistoryEntry,
  proposals: CommandState['proposals'],
  nextRevision: number
): CommandState => ({
  graph: cloneGraph(entry.graph),
  groups: cloneGroups(entry.groups ?? []),
  partitions: clonePartitions(entry.partitions ?? []),
  proposals: cloneProposals(proposals),
  revision: nextRevision,
});

export function createSemanticCommandBus(input: SemanticCommandBusInput): SemanticCommandBus {
  const definitions = normalizeDefinitions(input.definitions);
  const auditLog: CommandAuditEntry[] = [];
  const history: CommandAuditEntry[] = [];
  const rollbackSnapshots = new Map<string, CommandState>();
  let state: CommandState = {
    graph: cloneGraph(input.graph ?? { nodes: [], connections: [] }),
    groups: normalizeGroups(input.groups),
    partitions: clonePartitions(input.partitions ?? []),
    proposals: cloneProposals(input.proposals ?? []),
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
      groups: state.groups,
      partitions: state.partitions,
      proposals: state.proposals,
      revision: state.revision,
    });

  const dispatch: SemanticCommandBus['dispatch'] = ({ actor, command, dryRun = false }) => {
    const previousRevision = state.revision;
    const rollbackToken = `rollback:${previousRevision}:${history.length + auditLog.length + 1}`;
    const validationError = validateSemanticCommand(state, command, definitions);
    if (validationError) {
      return {
        ok: false,
        command,
        dryRun,
        stage: 'dry-run',
        message: validationError,
        previousRevision,
        appliedRevision: previousRevision,
        snapshot: snapshot(),
      };
    }

    const policyResult = (input.policy ?? defaultPolicy).canExecute({
      actor,
      command,
      snapshot: snapshot(),
    });
    const policy =
      typeof policyResult === 'boolean'
        ? { allowed: policyResult, reason: policyResult ? undefined : 'Policy denied command.' }
        : { allowed: Boolean(policyResult.allowed), reason: policyResult.reason };
    if (!policy.allowed) {
      return {
        ok: false,
        command,
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
      nextState = applySemanticCommand(state, command);
      if (command.type === 'group.reclaim') {
        nextState.groups = nextState.groups.map((group) =>
          group.id === command.groupId
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
        command,
        dryRun,
        stage: 'apply',
        message: err instanceof Error ? err.message : 'Command apply failed.',
        previousRevision,
        appliedRevision: previousRevision,
        snapshot: snapshot(),
      };
    }

    const audit: CommandAuditEntry = {
      id: `audit:${previousRevision}:${commandOperation(command)}:${auditLog.length + 1}`,
      actor: { ...actor },
      command,
      dryRun,
      lifecycle: [...lifecycle],
      policy,
      previousRevision,
      appliedRevision: dryRun ? previousRevision : nextState.revision,
      rollbackToken,
      createdAt: new Date(0).toISOString(),
    };

    auditLog.push(audit);
      if (!dryRun) {
      rollbackSnapshots.set(rollbackToken, cloneCommandState(state));
      state = nextState;
      semanticHistory.record({
        graph: state.graph,
        groups: state.groups,
        partitions: state.partitions,
        revision: state.revision,
      });
      history.push(audit);
    }

    return {
      ok: true,
      command,
      dryRun,
      previousRevision,
      appliedRevision: dryRun ? previousRevision : state.revision,
      rollbackToken,
      audit,
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
      proposals: cloneProposals(previous.proposals),
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
        return { allowed: false, reason: role === 'ai'
          ? 'AI actors must use proposal workflow for direct Canvas mutations.'
          : `Actor lacks ${capability} capability.` };
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
  if (command.type === 'partition.stop') return 'partition.stop';
  return null;
}

function groupForCommand(groups: SemanticGraphSnapshot['groups'], command: SemanticCommand) {
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
