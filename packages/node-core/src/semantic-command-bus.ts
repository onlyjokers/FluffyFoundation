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
