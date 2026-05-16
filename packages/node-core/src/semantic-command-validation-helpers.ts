/**
 * Purpose: Shared helper functions for semantic command validation.
 */

import type { ConfigField, NodeInstance } from './types.js';
import type {
  CommandState,
  SemanticDefinition,
  SemanticValidationError,
} from './semantic-graph-types.js';

export const isNonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const validationError = (
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

export const validateNode = (
  node: NodeInstance,
  definitions: SemanticDefinition[]
): SemanticValidationError | null => {
  if (!isNonEmpty(node.id)) {
    return validationError('GRAPH.MISSING_NODE', 'node.id', 'Node id is required.', ['Provide a non-empty node id.']);
  }
  if (!isNonEmpty(node.type)) {
    return validationError('REGISTRY.NODE_UNAVAILABLE', 'node.type', 'Node type is required.', [
      'Provide a registered node type.',
    ]);
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

export const definitionForNode = (
  state: CommandState,
  definitions: SemanticDefinition[],
  nodeId: string
): SemanticDefinition | null => {
  const node = state.graph.nodes.find((item) => String(item.id) === String(nodeId));
  if (!node) return null;
  return definitions.find((definition) => definition.type === node.type) ?? null;
};

export const portFor = (
  definition: SemanticDefinition | null,
  direction: 'inputs' | 'outputs',
  portId: string
) => definition?.ports[direction].find((port) => String(port.id) === String(portId));

export const isCompatiblePortType = (source: string, target: string): boolean =>
  source === target || source === 'any' || target === 'any';

export const paramValidationError = (
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

const SELECT_VALUE_ALIASES: Record<string, string[]> = {
  off: ['false', 'disabled', 'disable', 'inactive', 'stop', '0'],
  on: ['true', 'enabled', 'enable', 'active', 'start', '1'],
  blink: ['pulse', 'flash', 'flashing'],
};

export const selectFieldOptions = (field: Pick<ConfigField, 'options'>): string[] =>
  (field.options ?? []).map((option) => String(option.value)).filter(Boolean);

export const normalizeSelectFieldValue = (
  field: Pick<ConfigField, 'options'>,
  value: unknown
): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const options = selectFieldOptions(field);
  if (options.includes(trimmed)) return trimmed;

  const lower = trimmed.toLowerCase();
  for (const option of options) {
    if (lower === option.toLowerCase()) return option;
  }

  for (const [canonical, aliases] of Object.entries(SELECT_VALUE_ALIASES)) {
    if (!options.includes(canonical)) continue;
    if (aliases.includes(lower)) return canonical;
  }

  return null;
};
