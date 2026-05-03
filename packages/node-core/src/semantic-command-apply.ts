/**
 * Purpose: Validate and apply FF-09 semantic graph commands to immutable command state.
 */

import { applyGraphChanges, type GraphChange } from './graph-state/changes.js';
import type { NodeInstance } from './types.js';
import type { CommandState, SemanticCommand, SemanticDefinition } from './semantic-graph-types.js';
import { isExecutionTargetPlatform } from '@shugu/protocol';
import {
  cloneGraph,
  cloneGroups,
  clonePartitions,
  cloneProposals,
} from './semantic-graph-snapshot.js';

const isNonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const validateNode = (node: NodeInstance, definitions: SemanticDefinition[]): string | null => {
  if (!isNonEmpty(node.id)) return 'Node id is required.';
  if (!isNonEmpty(node.type)) return 'Node type is required.';
  if (definitions.length > 0 && !definitions.some((definition) => definition.type === node.type)) {
    return `Unknown node type: ${node.type}`;
  }
  return null;
};

export function validateSemanticCommand(
  state: CommandState,
  command: SemanticCommand,
  definitions: SemanticDefinition[]
): string | null {
  const nodeIds = new Set(state.graph.nodes.map((node) => String(node.id)));
  const connIds = new Set(state.graph.connections.map((conn) => String(conn.id)));
  const groupIds = new Set(state.groups.map((group) => String(group.id)));
  const partitionIds = new Set(state.partitions.map((partition) => String(partition.id)));

  const validateRevision = (partitionId: string, expectedRevision?: number): string | null => {
    if (expectedRevision === undefined) return null;
    const partition = state.partitions.find((item) => item.id === partitionId);
    const actual = partition?.boundRevision ?? state.revision;
    return actual === expectedRevision
      ? null
      : `Partition revision mismatch: expected ${expectedRevision}, got ${actual}.`;
  };

  switch (command.type) {
    case 'node.add':
      return validateNode(command.node, definitions);
    case 'node.remove':
    case 'node.archive':
    case 'node.params.update':
      return nodeIds.has(String(command.nodeId)) ? null : `Node not found: ${command.nodeId}`;
    case 'node.connect': {
      const connection = command.connection;
      if (!isNonEmpty(connection.id)) return 'Connection id is required.';
      if (!nodeIds.has(String(connection.sourceNodeId)))
        return `Source node not found: ${connection.sourceNodeId}`;
      if (!nodeIds.has(String(connection.targetNodeId)))
        return `Target node not found: ${connection.targetNodeId}`;
      const duplicateTarget = state.graph.connections.some(
        (conn) =>
          String(conn.targetNodeId) === String(connection.targetNodeId) &&
          String(conn.targetPortId) === String(connection.targetPortId) &&
          String(conn.id) !== String(connection.id)
      );
      return duplicateTarget ? 'Target port is already connected.' : null;
    }
    case 'node.disconnect':
      return connIds.has(String(command.connectionId))
        ? null
        : `Connection not found: ${command.connectionId}`;
    case 'group.create':
      return isNonEmpty(command.group.id) ? null : 'Group id is required.';
    case 'group.update':
    case 'group.archive':
    case 'group.delete':
    case 'group.restore':
    case 'group.reclaim':
    case 'group.release':
      return groupIds.has(String(command.groupId)) ? null : `Group not found: ${command.groupId}`;
    case 'partition.deploy':
      if (!isNonEmpty(command.partitionId)) return 'Partition id is required.';
      if (command.targetPlatform && !isExecutionTargetPlatform(command.targetPlatform)) {
        return 'Partition target platform is invalid.';
      }
      {
        const revisionError = validateRevision(command.partitionId, command.expectedRevision);
        if (revisionError) return revisionError;
      }
      return command.nodeIds.every((nodeId) => nodeIds.has(String(nodeId)))
        ? null
        : 'Partition references unknown nodes.';
    case 'partition.start':
    case 'partition.redeploy':
    case 'partition.remove':
      if (!isNonEmpty(command.partitionId)) return 'Partition id is required.';
      if (!partitionIds.has(String(command.partitionId))) return `Partition not found: ${command.partitionId}`;
      return validateRevision(command.partitionId, command.expectedRevision);
    case 'partition.stop':
      {
        const revisionError = validateRevision(command.partitionId, command.expectedRevision);
        if (revisionError) return revisionError;
      }
      return isNonEmpty(command.partitionId) ? null : 'Partition id is required.';
    case 'partition.report.failure':
      if (!isNonEmpty(command.partitionId)) return 'Partition id is required.';
      if (!command.report || command.report.kind !== 'partition-failure-report') {
        return 'Partition failure report is required.';
      }
      return null;
    case 'partition.stop.all':
      return null;
    case 'proposal.create':
      return isNonEmpty(command.proposal.id) ? null : 'Proposal id is required.';
    default: {
      const exhaustive: never = command;
      return `Unsupported command: ${String((exhaustive as { type?: unknown }).type)}`;
    }
  }
}

const commandToChanges = (command: SemanticCommand): GraphChange[] => {
  switch (command.type) {
    case 'node.add':
      return [{ type: 'add-node', node: command.node }];
    case 'node.remove':
      return [{ type: 'remove-node', nodeId: command.nodeId }];
    case 'node.archive':
      return [{ type: 'update-node-config', nodeId: command.nodeId, config: { archived: true } }];
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
    revision: state.revision,
  };

  const graphChanges = commandToChanges(command);
  if (graphChanges.length > 0) next.graph = applyGraphChanges(next.graph, graphChanges);

  switch (command.type) {
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
    case 'proposal.create':
      next.proposals = [
        ...next.proposals.filter((proposal) => proposal.id !== command.proposal.id),
        { ...command.proposal, status: command.proposal.status ?? 'proposed' },
      ];
      break;
  }

  next.revision = state.revision + 1;
  return next;
}
