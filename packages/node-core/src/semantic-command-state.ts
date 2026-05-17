/**
 * Purpose: Clone command-bus state and recover partition lifecycle metadata during rollback.
 */

import type { CommandState, RollbackRecoveryStatus, SemanticHistoryState } from './semantic-graph-types.js';
import {
  cloneGraph,
  cloneAgentCapabilities,
  cloneCustomDefinitions,
  cloneGroups,
  clonePartitions,
  cloneProposals,
  cloneRuntimeStatus,
} from './semantic-graph-snapshot.js';
import type { SemanticHistoryEntry } from './graph-state/history.js';

export const cloneCommandState = (state: CommandState): CommandState => ({
  graph: cloneGraph(state.graph),
  groups: cloneGroups(state.groups),
  partitions: clonePartitions(state.partitions),
  customDefinitions: cloneCustomDefinitions(state.customDefinitions),
  agentCapabilities: cloneAgentCapabilities(state.agentCapabilities),
  proposals: cloneProposals(state.proposals),
  runtimeStatus: cloneRuntimeStatus(state.runtimeStatus),
  revision: state.revision,
});

export const recoveryForRollback = (
  current: CommandState,
  restored: CommandState
): RollbackRecoveryStatus => {
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

export const stateFromHistoryEntry = (
  entry: SemanticHistoryEntry,
  proposals: CommandState['proposals'],
  nextRevision: number
): CommandState => ({
  graph: cloneGraph(entry.graph),
  groups: cloneGroups(entry.groups ?? []),
  partitions: clonePartitions(entry.partitions ?? []),
  customDefinitions: cloneCustomDefinitions(entry.customDefinitions ?? []),
  agentCapabilities: cloneAgentCapabilities(entry.agentCapabilities),
  proposals: cloneProposals(proposals),
  runtimeStatus: defaultHistoryRuntimeStatus(entry),
  revision: nextRevision,
});

const defaultHistoryRuntimeStatus = (entry: SemanticHistoryEntry): CommandState['runtimeStatus'] => {
  const history = entry as SemanticHistoryEntry & Partial<SemanticHistoryState>;
  return cloneRuntimeStatus(history.runtimeStatus ?? { running: false, deployedPartitionIds: [] });
};
