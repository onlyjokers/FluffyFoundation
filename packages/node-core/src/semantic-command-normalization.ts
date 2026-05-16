/**
 * Purpose: Normalize semantic graph commands before validation and mutation.
 */

import type {
  CommandState,
  SemanticCommand,
  SemanticDefinition,
  SemanticWarning,
} from './semantic-graph-types.js';
import {
  definitionForNode,
  normalizeSelectFieldValue,
} from './semantic-command-validation-helpers.js';

export type NormalizedSemanticCommand = {
  command: SemanticCommand;
  warnings: SemanticWarning[];
};

const clamp = (value: number, min?: number, max?: number): number => {
  if (typeof min === 'number' && value < min) return min;
  if (typeof max === 'number' && value > max) return max;
  return value;
};

export const normalizeSemanticCommand = (
  state: CommandState,
  command: SemanticCommand,
  definitions: SemanticDefinition[]
): NormalizedSemanticCommand => {
  if (command.type === 'runtime.override.set') {
    const definition = definitionForNode(state, definitions, String(command.nodeId));
    if (!definition) return { command, warnings: [] };
    if ((command.kind ?? 'input') !== 'param') return { command, warnings: [] };
    const field = definition.params.find((param) => param.key === command.portId);
    if (!field || field.type !== 'number') return { command, warnings: [] };
    const value = command.value;
    if (typeof value !== 'number' || !Number.isFinite(value)) return { command, warnings: [] };
    const normalizedValue = clamp(value, field.min, field.max);
    if (normalizedValue === value) return { command, warnings: [] };
    return {
      command: { ...command, value: normalizedValue },
      warnings: [
        {
          code: 'SEMANTIC.PARAM_CLAMPED',
          path: `nodes.${command.nodeId}.params.${field.key}`,
          message: `Parameter ${field.key} was clamped from ${value} to ${normalizedValue}.`,
        },
      ],
    };
  }

  if (command.type !== 'node.params.update') {
    return { command, warnings: [] };
  }

  const definition = definitionForNode(state, definitions, String(command.nodeId));
  if (!definition) return { command, warnings: [] };

  const params = { ...command.params };
  const warnings: SemanticWarning[] = [];

  for (const field of definition.params) {
    if (field.type !== 'number' || !(field.key in params)) continue;
    const value = params[field.key];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const normalizedValue = clamp(value, field.min, field.max);
    if (normalizedValue === value) continue;
    params[field.key] = normalizedValue;
    warnings.push({
      code: 'SEMANTIC.PARAM_CLAMPED',
      path: `nodes.${command.nodeId}.params.${field.key}`,
      message: `Parameter ${field.key} was clamped from ${value} to ${normalizedValue}.`,
    });
  }

  for (const field of definition.params) {
    if (field.type !== 'select' || !(field.key in params)) continue;
    const normalizedValue = normalizeSelectFieldValue(field, params[field.key]);
    if (normalizedValue === null || normalizedValue === params[field.key]) continue;
    params[field.key] = normalizedValue;
    warnings.push({
      code: 'SEMANTIC.PARAM_NORMALIZED',
      path: `nodes.${command.nodeId}.params.${field.key}`,
      message: `Parameter ${field.key} was normalized to ${normalizedValue}.`,
    });
  }

  return {
    command: { ...command, params },
    warnings,
  };
};
