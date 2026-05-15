/**
 * Purpose: Apply validated semantic graph commands to immutable command state.
 */

import { applyGraphChanges, type GraphChange } from './graph-state/changes.js';
import type { CommandState, SemanticCommand } from './semantic-graph-types.js';
import {
  cloneGraph,
  cloneGroups,
  clonePartitions,
  cloneProposals,
  cloneRuntimeStatus,
} from './semantic-graph-snapshot.js';

const commandToChanges = (command: SemanticCommand): GraphChange[] => {
  switch (command.type) {
    case 'node.add':
      return [{ type: 'add-node', node: command.node }];
    case 'node.remove':
      return [{ type: 'remove-node', nodeId: command.nodeId }];
    case 'node.archive':
      return [{ type: 'update-node-config', nodeId: command.nodeId, config: { archived: true } }];
    case 'node.restore':
      return [{ type: 'update-node-config', nodeId: command.nodeId, config: { archived: false } }];
    case 'node.connect':
      return [{ type: 'add-connection', connection: command.connection }];
    case 'node.disconnect':
      return [{ type: 'remove-connection', connectionId: command.connectionId }];
    default:
      return [];
  }
};

export function applySemanticCommand(state: CommandState, command: SemanticCommand): CommandState {
  const next: CommandState = {
    graph: cloneGraph(state.graph),
    groups: cloneGroups(state.groups),
    partitions: clonePartitions(state.partitions),
    proposals: cloneProposals(state.proposals),
    runtimeStatus: cloneRuntimeStatus(state.runtimeStatus),
    revision: state.revision,
  };

  if (command.type === 'graph.snapshot') return next;
  if (command.type === 'graph.replace') {
    return {
      graph: cloneGraph(command.graph),
      groups: cloneGroups(command.groups ?? []),
      partitions: clonePartitions(command.partitions ?? []),
      proposals: [],
      runtimeStatus: cloneRuntimeStatus({ running: false, deployedPartitionIds: [] }),
      revision: state.revision + 1,
    };
  }

  const graphChanges = commandToChanges(command);
  if (graphChanges.length > 0) next.graph = applyGraphChanges(next.graph, graphChanges);

  switch (command.type) {
    case 'node.add':
      if (command.scopeGroupId) {
        next.groups = next.groups.map((group) =>
          group.id === command.scopeGroupId && !group.nodeIds.includes(command.node.id)
            ? { ...group, nodeIds: [...group.nodeIds, command.node.id] }
            : group
        );
      }
      break;
    case 'node.params.update':
      next.graph = {
        ...next.graph,
        nodes: next.graph.nodes.map((node) =>
          String(node.id) === String(command.nodeId)
            ? { ...node, config: { ...(node.config ?? {}), ...command.params } }
            : node
        ),
      };
      break;
    case 'node.archive':
      next.graph.nodes = next.graph.nodes.map((node) =>
        String(node.id) === String(command.nodeId)
          ? { ...node, config: { ...(node.config ?? {}), archived: true } }
          : node
      );
      break;
    case 'node.restore':
      next.graph.nodes = next.graph.nodes.map((node) =>
        String(node.id) === String(command.nodeId)
          ? { ...node, config: { ...(node.config ?? {}), archived: false } }
          : node
      );
      break;
    case 'group.create':
      next.groups = [
        ...next.groups.filter((group) => group.id !== command.group.id),
        { ...command.group },
      ];
      break;
    case 'group.update':
      next.groups = next.groups.map((group) =>
        group.id === command.groupId
          ? {
              ...group,
              ...command.patch,
              nodeIds: command.patch.nodeIds ? [...command.patch.nodeIds] : group.nodeIds,
            }
          : group
      );
      break;
    case 'group.archive':
    case 'group.delete':
      next.groups = next.groups.map((group) =>
        group.id === command.groupId ? { ...group, archived: true } : group
      );
      break;
    case 'group.restore':
      next.groups = next.groups.map((group) =>
        group.id === command.groupId ? { ...group, archived: false } : group
      );
      break;
    case 'group.reclaim':
      next.groups = next.groups.map((group) => {
        if (group.id !== command.groupId) return group;
        return {
          ...group,
          ownerStack: group.owner ? [...(group.ownerStack ?? []), group.owner] : [...(group.ownerStack ?? [])],
          owner: undefined,
        };
      });
      break;
    case 'group.release':
      next.groups = next.groups.map((group) => {
        if (group.id !== command.groupId) return group;
        const ownerStack = [...(group.ownerStack ?? [])];
        const owner = ownerStack.pop();
        return {
          ...group,
          owner,
          ownerStack,
        };
      });
      break;
    case 'partition.deploy':
      next.partitions = [
        ...next.partitions.filter((partition) => partition.id !== command.partitionId),
        {
          id: command.partitionId,
          nodeIds: [...command.nodeIds],
          targetPlatform: command.targetPlatform ?? 'manager',
          status: 'deployed',
          boundRevision: state.revision + 1,
          requiredCapabilities: command.requiredCapabilities
            ? [...command.requiredCapabilities]
            : undefined,
          resourceBudget: command.resourceBudget ? { ...command.resourceBudget } : undefined,
          watchdog: command.watchdog ? { ...command.watchdog } : undefined,
        },
      ];
      break;
    case 'partition.start':
      next.partitions = next.partitions.map((partition) =>
        partition.id === command.partitionId
          ? { ...partition, status: 'running', boundRevision: state.revision + 1 }
          : partition
      );
      break;
    case 'partition.stop':
      next.partitions = next.partitions.map((partition) =>
        partition.id === command.partitionId
          ? { ...partition, status: 'stopped', boundRevision: state.revision + 1 }
          : partition
      );
      if (!next.partitions.some((partition) => partition.id === command.partitionId)) {
        next.partitions.push({
          id: command.partitionId,
          nodeIds: [],
          targetPlatform: 'manager',
          status: 'stopped',
          boundRevision: state.revision + 1,
        });
      }
      break;
    case 'partition.remove':
      next.partitions = next.partitions.map((partition) =>
        partition.id === command.partitionId
          ? { ...partition, status: 'removed', boundRevision: state.revision + 1 }
          : partition
      );
      break;
    case 'partition.redeploy':
      next.partitions = next.partitions.map((partition) =>
        partition.id === command.partitionId
          ? { ...partition, status: 'deployed', boundRevision: state.revision + 1 }
          : partition
      );
      break;
    case 'partition.report.failure':
      next.partitions = next.partitions.map((partition) =>
        partition.id === command.partitionId
          ? {
              ...partition,
              status: 'error',
              failureReport: { ...command.report },
              error: command.report.message,
              boundRevision: state.revision + 1,
            }
          : partition
      );
      if (!next.partitions.some((partition) => partition.id === command.partitionId)) {
        next.partitions.push({
          id: command.partitionId,
          nodeIds: [],
          targetPlatform: command.report.targetPlatform,
          status: 'error',
          failureReport: { ...command.report },
          error: command.report.message,
          boundRevision: state.revision + 1,
        });
      }
      break;
    case 'partition.stop.all':
      next.partitions = next.partitions.map((partition) => ({
        ...partition,
        status: 'stopped',
        boundRevision: state.revision + 1,
      }));
      break;
    case 'runtime.override.set':
      next.runtimeStatus = {
        ...next.runtimeStatus,
        runtimeOverrides: [
          ...(next.runtimeStatus.runtimeOverrides ?? []).filter(
            (override) =>
              override.nodeId !== command.nodeId ||
              override.portId !== command.portId ||
              (override.kind ?? 'input') !== (command.kind ?? 'input')
          ),
          {
            nodeId: command.nodeId,
            portId: command.portId,
            kind: command.kind ?? 'input',
            value: command.value,
            ...(command.ttlMs === undefined ? {} : { ttlMs: command.ttlMs }),
            updatedAtRevision: state.revision + 1,
          },
        ],
      };
      break;
    case 'runtime.override.clear':
      next.runtimeStatus = {
        ...next.runtimeStatus,
        runtimeOverrides: (next.runtimeStatus.runtimeOverrides ?? []).filter(
          (override) =>
            override.nodeId !== command.nodeId ||
            override.portId !== command.portId ||
            (override.kind ?? 'input') !== (command.kind ?? 'input')
        ),
      };
      break;
    case 'proposal.create':
      next.proposals = [
        ...next.proposals.filter((proposal) => proposal.id !== command.proposal.id),
        { ...command.proposal, status: command.proposal.status ?? 'proposed' },
      ];
      break;
    case 'proposal.approve':
      next.proposals = next.proposals.map((proposal) =>
        proposal.id === command.proposalId
          ? { ...proposal, status: 'accepted', ...(command.approvedBy ? { approvedBy: command.approvedBy } : {}) }
          : proposal
      );
      break;
  }

  next.revision = state.revision + 1;
  return next;
}
