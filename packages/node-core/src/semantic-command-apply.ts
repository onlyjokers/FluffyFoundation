/**
 * Purpose: Validate and apply FF-09 semantic graph commands to immutable command state.
 */

import { applyGraphChanges, type GraphChange } from './graph-state/changes.js';
import type { NodeInstance } from './types.js';
import type {
  CommandState,
  SemanticCommand,
  SemanticDefinition,
  SemanticValidationError,
} from './semantic-graph-types.js';
import { isExecutionTargetPlatform } from '@shugu/protocol';
import {
  cloneGraph,
  cloneGroups,
  clonePartitions,
  cloneProposals,
} from './semantic-graph-snapshot.js';

const isNonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const validationError = (
  code: string,
  path: string,
  message: string,
  repairOptions: string[],
  machineReason?: string
): SemanticValidationError => ({
  code,
  path,
  severity: 'error',
  message,
  ...(machineReason ? { machineReason } : {}),
  repairOptions,
});

const validateNode = (node: NodeInstance, definitions: SemanticDefinition[]): SemanticValidationError | null => {
  if (!isNonEmpty(node.id)) {
    return validationError('GRAPH.MISSING_NODE', 'node.id', 'Node id is required.', ['Provide a non-empty node id.']);
  }
  if (!isNonEmpty(node.type)) {
    return validationError('REGISTRY.NODE_UNAVAILABLE', 'node.type', 'Node type is required.', ['Provide a registered node type.']);
  }
  if (definitions.length > 0 && !definitions.some((definition) => definition.type === node.type)) {
    return validationError(
      'REGISTRY.NODE_UNAVAILABLE',
      `definitions.${node.type}`,
      `Unknown node type: ${node.type}`,
      ['Choose a node type from the registry summaries.'],
      'Node type is not registered.'
    );
  }
  return null;
};

const definitionForNode = (
  state: CommandState,
  definitions: SemanticDefinition[],
  nodeId: string
): SemanticDefinition | null => {
  const node = state.graph.nodes.find((item) => String(item.id) === String(nodeId));
  if (!node) return null;
  return definitions.find((definition) => definition.type === node.type) ?? null;
};

const portFor = (
  definition: SemanticDefinition | null,
  direction: 'inputs' | 'outputs',
  portId: string
) => definition?.ports[direction].find((port) => String(port.id) === String(portId));

const isCompatiblePortType = (source: string, target: string): boolean =>
  source === target || source === 'any' || target === 'any';

const paramValidationError = (
  nodeId: string,
  key: string,
  value: number,
  bound: 'min' | 'max',
  limit: number
): SemanticValidationError =>
  validationError(
    'GRAPH.PARAM_OUT_OF_RANGE',
    `nodes.${nodeId}.params.${key}`,
    `Param ${key} is ${bound === 'min' ? 'below minimum' : 'above maximum'} ${limit}.`,
    [`Use a value ${bound === 'min' ? 'greater than or equal to' : 'less than or equal to'} ${limit}.`],
    `${value} violates ${bound} ${limit}.`
  );

export function validateSemanticCommandDetailed(
  state: CommandState,
  command: SemanticCommand,
  definitions: SemanticDefinition[]
): SemanticValidationError[] {
  const nodeIds = new Set(state.graph.nodes.map((node) => String(node.id)));
  const connIds = new Set(state.graph.connections.map((conn) => String(conn.id)));
  const groupIds = new Set(state.groups.map((group) => String(group.id)));
  const partitionIds = new Set(state.partitions.map((partition) => String(partition.id)));

  const missingNode = (nodeId: string, role: 'node' | 'source' | 'target'): SemanticValidationError =>
    validationError(
      'GRAPH.MISSING_NODE',
      `nodes.${nodeId}`,
      `${role === 'node' ? 'Node' : role === 'source' ? 'Source node' : 'Target node'} not found: ${nodeId}`,
      ['Refresh the semantic snapshot and choose an existing node id.']
    );

  const validateRevision = (partitionId: string, expectedRevision?: number): SemanticValidationError | null => {
    if (expectedRevision === undefined) return null;
    const partition = state.partitions.find((item) => item.id === partitionId);
    const actual = partition?.boundRevision ?? state.revision;
    return actual === expectedRevision
      ? null
      : validationError(
          'GRAPH.REVISION_MISMATCH',
          `partitions.${partitionId}.boundRevision`,
          `Partition revision mismatch: expected ${expectedRevision}, got ${actual}.`,
          ['Refresh the snapshot and retry with the current partition revision.']
        );
  };

  switch (command.type) {
    case 'node.add': {
      const error = validateNode(command.node, definitions);
      return error ? [error] : [];
    }
    case 'node.remove':
    case 'node.archive':
      return nodeIds.has(String(command.nodeId)) ? [] : [missingNode(String(command.nodeId), 'node')];
    case 'node.params.update': {
      if (!nodeIds.has(String(command.nodeId))) return [missingNode(String(command.nodeId), 'node')];
      const definition = definitionForNode(state, definitions, String(command.nodeId));
      if (!definition) return [];
      const errors: SemanticValidationError[] = [];
      for (const field of definition.params) {
        if (field.type !== 'number' || !(field.key in command.params)) continue;
        const value = command.params[field.key];
        if (typeof value !== 'number' || !Number.isFinite(value)) continue;
        if (typeof field.min === 'number' && value < field.min) {
          errors.push(paramValidationError(String(command.nodeId), field.key, value, 'min', field.min));
        }
        if (typeof field.max === 'number' && value > field.max) {
          errors.push(paramValidationError(String(command.nodeId), field.key, value, 'max', field.max));
        }
      }
      return errors;
    }
    case 'node.connect': {
      const connection = command.connection;
      if (!isNonEmpty(connection.id)) {
        return [
          validationError('GRAPH.INVALID_CONNECTION', 'connections.id', 'Connection id is required.', [
            'Provide a non-empty connection id.',
          ]),
        ];
      }
      if (!nodeIds.has(String(connection.sourceNodeId))) {
        return [missingNode(String(connection.sourceNodeId), 'source')];
      }
      if (!nodeIds.has(String(connection.targetNodeId))) {
        return [missingNode(String(connection.targetNodeId), 'target')];
      }
      const duplicateTarget = state.graph.connections.some(
        (conn) =>
          String(conn.targetNodeId) === String(connection.targetNodeId) &&
          String(conn.targetPortId) === String(connection.targetPortId) &&
          String(conn.id) !== String(connection.id)
      );
      if (duplicateTarget) {
        return [
          validationError('GRAPH.PORT_ALREADY_CONNECTED', `connections.${connection.id}.targetPortId`, 'Target port is already connected.', [
            'Disconnect the existing target port connection before reconnecting.',
          ]),
        ];
      }

      const sourceDefinition = definitionForNode(state, definitions, String(connection.sourceNodeId));
      const targetDefinition = definitionForNode(state, definitions, String(connection.targetNodeId));
      const sourcePort = portFor(sourceDefinition, 'outputs', String(connection.sourcePortId));
      const targetPort = portFor(targetDefinition, 'inputs', String(connection.targetPortId));
      if (!sourcePort) {
        return [
          validationError(
            'GRAPH.PORT_NOT_FOUND',
            `connections.${connection.id}.sourcePortId`,
            `Source port not found: ${connection.sourceNodeId}:${connection.sourcePortId}`,
            ['Choose an output port from the source node definition.']
          ),
        ];
      }
      if (!targetPort) {
        return [
          validationError(
            'GRAPH.PORT_NOT_FOUND',
            `connections.${connection.id}.targetPortId`,
            `Target port not found: ${connection.targetNodeId}:${connection.targetPortId}`,
            ['Choose an input port from the target node definition.']
          ),
        ];
      }
      if (!isCompatiblePortType(String(sourcePort.type), String(targetPort.type))) {
        return [
          validationError(
            'GRAPH.PORT_INCOMPATIBLE',
            `connections.${connection.id}`,
            `Cannot connect ${sourcePort.type} to ${targetPort.type}.`,
            ['Insert a compatible conversion node or choose ports with matching types.'],
            `${connection.sourcePortId}:${sourcePort.type} -> ${connection.targetPortId}:${targetPort.type}`
          ),
        ];
      }
      return [];
    }
    case 'node.disconnect':
      return connIds.has(String(command.connectionId))
        ? []
        : [
            validationError(
              'GRAPH.CONNECTION_NOT_FOUND',
              `connections.${command.connectionId}`,
              `Connection not found: ${command.connectionId}`,
              ['Refresh the snapshot and choose an existing connection id.']
            ),
          ];
    case 'group.create':
      return isNonEmpty(command.group.id)
        ? []
        : [validationError('GRAPH.INVALID_GROUP', 'groups.id', 'Group id is required.', ['Provide a non-empty group id.'])];
    case 'group.update':
    case 'group.archive':
    case 'group.delete':
    case 'group.restore':
    case 'group.reclaim':
    case 'group.release':
      return groupIds.has(String(command.groupId))
        ? []
        : [
            validationError('GRAPH.MISSING_GROUP', `groups.${command.groupId}`, `Group not found: ${command.groupId}`, [
              'Refresh the snapshot and choose an existing group id.',
            ]),
          ];
    case 'partition.deploy': {
      if (!isNonEmpty(command.partitionId)) {
        return [
          validationError('EXECUTION.INVALID_PARTITION', 'partitions.id', 'Partition id is required.', [
            'Provide a non-empty partition id.',
          ]),
        ];
      }
      if (command.targetPlatform && !isExecutionTargetPlatform(command.targetPlatform)) {
        return [
          validationError(
            'EXECUTION.INVALID_TARGET_PLATFORM',
            `partitions.${command.partitionId}.targetPlatform`,
            'Partition target platform is invalid.',
            ['Choose one of the supported execution target platforms.'],
            `Unsupported targetPlatform: ${String(command.targetPlatform)}`
          ),
        ];
      }
      const revisionError = validateRevision(command.partitionId, command.expectedRevision);
      if (revisionError) return [revisionError];
      if (!command.nodeIds.every((nodeId) => nodeIds.has(String(nodeId)))) {
        return [
          validationError('EXECUTION.UNDEPLOYABLE_GRAPH', `partitions.${command.partitionId}.nodeIds`, 'Partition references unknown nodes.', [
            'Remove missing node ids from the partition command.',
          ]),
        ];
      }
      return [];
    }
    case 'partition.start':
    case 'partition.redeploy':
    case 'partition.remove': {
      if (!isNonEmpty(command.partitionId)) {
        return [
          validationError('EXECUTION.INVALID_PARTITION', 'partitions.id', 'Partition id is required.', [
            'Provide a non-empty partition id.',
          ]),
        ];
      }
      if (!partitionIds.has(String(command.partitionId))) {
        return [
          validationError(
            'EXECUTION.PARTITION_NOT_FOUND',
            `partitions.${command.partitionId}`,
            `Partition not found: ${command.partitionId}`,
            ['Deploy the partition before starting, redeploying, or removing it.']
          ),
        ];
      }
      const revisionError = validateRevision(command.partitionId, command.expectedRevision);
      return revisionError ? [revisionError] : [];
    }
    case 'partition.stop': {
      if (!isNonEmpty(command.partitionId)) {
        return [
          validationError('EXECUTION.INVALID_PARTITION', 'partitions.id', 'Partition id is required.', [
            'Provide a non-empty partition id.',
          ]),
        ];
      }
      const revisionError = validateRevision(command.partitionId, command.expectedRevision);
      return revisionError ? [revisionError] : [];
    }
    case 'partition.report.failure':
      if (!isNonEmpty(command.partitionId)) {
        return [
          validationError('EXECUTION.INVALID_PARTITION', 'partitions.id', 'Partition id is required.', [
            'Provide a non-empty partition id.',
          ]),
        ];
      }
      return command.report && command.report.kind === 'partition-failure-report'
        ? []
        : [
            validationError(
              'EXECUTION.INVALID_FAILURE_REPORT',
              `partitions.${command.partitionId}.failureReport`,
              'Partition failure report is required.',
              ['Attach a structured partition-failure-report object.']
            ),
          ];
    case 'partition.stop.all':
      return [];
    case 'proposal.create':
      return isNonEmpty(command.proposal.id)
        ? []
        : [
            validationError('POLICY.INVALID_PROPOSAL', 'proposals.id', 'Proposal id is required.', [
              'Provide a non-empty proposal id.',
            ]),
          ];
  }
}

export function validateSemanticCommand(
  state: CommandState,
  command: SemanticCommand,
  definitions: SemanticDefinition[]
): string | null {
  if (command.type === 'partition.deploy' && command.targetPlatform && !isExecutionTargetPlatform(command.targetPlatform)) {
    return 'Partition target platform is invalid.';
  }
  return validateSemanticCommandDetailed(state, command, definitions)[0]?.message ?? null;
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
