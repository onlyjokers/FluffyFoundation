/**
 * Purpose: Validate semantic Group, partition, and proposal commands.
 */

import { isExecutionTargetPlatform } from '@shugu/protocol';
import type {
  CommandState,
  SemanticCommand,
  SemanticValidationError,
} from './semantic-graph-types.js';
import {
  isNonEmpty,
  validationError,
} from './semantic-command-validation-helpers.js';

export const validateRuntimeCommand = (
  state: CommandState,
  command: Exclude<
    SemanticCommand,
    | { type: 'node.add' }
    | { type: 'node.remove' }
    | { type: 'node.archive' }
    | { type: 'node.restore' }
    | { type: 'node.params.update' }
    | { type: 'node.connect' }
    | { type: 'node.disconnect' }
  >
): SemanticValidationError[] => {
  const nodeIds = new Set(state.graph.nodes.map((node) => String(node.id)));
  const groupIds = new Set(state.groups.map((group) => String(group.id)));
  const partitionIds = new Set(state.partitions.map((partition) => String(partition.id)));

  switch (command.type) {
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
    case 'partition.deploy':
      return validatePartitionDeploy(state, command, nodeIds);
    case 'partition.start':
    case 'partition.redeploy':
    case 'partition.remove':
      return validateExistingPartitionCommand(state, command, partitionIds);
    case 'partition.stop':
      return validatePartitionId(command.partitionId, state, command.expectedRevision);
    case 'partition.report.failure':
      return validateFailureReport(command);
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
    case 'proposal.approve':
      return isNonEmpty(command.proposalId) && state.proposals.some((proposal) => proposal.id === command.proposalId)
        ? []
        : [
            validationError('POLICY.PROPOSAL_NOT_FOUND', `proposals.${command.proposalId}`, 'Proposal not found.', [
              'Refresh proposals and choose an existing proposal id.',
            ]),
          ];
  }
};

const validateRevision = (
  state: CommandState,
  partitionId: string,
  expectedRevision?: number
): SemanticValidationError | null => {
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

const validatePartitionId = (
  partitionId: string,
  state: CommandState,
  expectedRevision?: number
): SemanticValidationError[] => {
  if (!isNonEmpty(partitionId)) {
    return [
      validationError('EXECUTION.INVALID_PARTITION', 'partitions.id', 'Partition id is required.', [
        'Provide a non-empty partition id.',
      ]),
    ];
  }
  const revisionError = validateRevision(state, partitionId, expectedRevision);
  return revisionError ? [revisionError] : [];
};

const validatePartitionDeploy = (
  state: CommandState,
  command: Extract<SemanticCommand, { type: 'partition.deploy' }>,
  nodeIds: Set<string>
): SemanticValidationError[] => {
  const idErrors = validatePartitionId(command.partitionId, state, command.expectedRevision);
  if (idErrors.length > 0) return idErrors;
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
  if (!command.nodeIds.every((nodeId) => nodeIds.has(String(nodeId)))) {
    return [
      validationError('EXECUTION.UNDEPLOYABLE_GRAPH', `partitions.${command.partitionId}.nodeIds`, 'Partition references unknown nodes.', [
        'Remove missing node ids from the partition command.',
      ]),
    ];
  }
  return [];
};

const validateExistingPartitionCommand = (
  state: CommandState,
  command: Extract<SemanticCommand, { type: 'partition.start' | 'partition.redeploy' | 'partition.remove' }>,
  partitionIds: Set<string>
): SemanticValidationError[] => {
  const idErrors = validatePartitionId(command.partitionId, state, command.expectedRevision);
  if (idErrors.length > 0) return idErrors;
  return partitionIds.has(String(command.partitionId))
    ? []
    : [
        validationError(
          'EXECUTION.PARTITION_NOT_FOUND',
          `partitions.${command.partitionId}`,
          `Partition not found: ${command.partitionId}`,
          ['Deploy the partition before starting, redeploying, or removing it.']
        ),
      ];
};

const validateFailureReport = (
  command: Extract<SemanticCommand, { type: 'partition.report.failure' }>
): SemanticValidationError[] => {
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
};
