/**
 * Purpose: Validate semantic graph commands before immutable command-state apply.
 */

import type {
  CommandState,
  SemanticCommand,
  SemanticDefinition,
  SemanticValidationError,
} from './semantic-graph-types.js';
import { isExecutionTargetPlatform } from '@shugu/protocol';
import { validateNodeCommand } from './semantic-command-node-validation.js';
import { validateRuntimeCommand } from './semantic-command-runtime-validation.js';

export function validateSemanticCommandDetailed(
  state: CommandState,
  command: SemanticCommand,
  definitions: SemanticDefinition[]
): SemanticValidationError[] {
  switch (command.type) {
    case 'graph.snapshot':
    case 'definition.custom.upsert':
    case 'definition.custom.remove':
    case 'agent.capability.set':
      return [];
    case 'graph.replace':
      return [];
    case 'node.add':
    case 'node.remove':
    case 'node.archive':
    case 'node.restore':
    case 'node.params.update':
    case 'node.inputs.update':
    case 'node.connect':
    case 'node.disconnect':
      return validateNodeCommand(state, command, definitions);
    case 'group.create':
    case 'group.update':
    case 'group.archive':
    case 'group.delete':
    case 'group.restore':
    case 'group.reclaim':
    case 'group.release':
    case 'partition.deploy':
    case 'partition.start':
    case 'partition.redeploy':
    case 'partition.remove':
    case 'partition.stop':
    case 'partition.report.failure':
    case 'partition.stop.all':
    case 'runtime.override.set':
    case 'runtime.override.clear':
    case 'proposal.create':
    case 'proposal.approve':
      return validateRuntimeCommand(state, command);
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
