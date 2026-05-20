/**
 * Purpose: Normalize semantic graph commands before validation and mutation.
 */

import type {
  CommandState,
  SemanticCommand,
  SemanticDefinition,
  SemanticWarning,
} from './semantic-graph-types.js';
import type { ConfigField, GraphState, NodeDefinition, NodeInstance } from './types.js';
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

type NormalizableDefinition = Pick<NodeDefinition, 'type'> &
  Partial<Pick<NodeDefinition, 'configSchema'>> &
  Partial<Pick<SemanticDefinition, 'params'>>;

const paramsForDefinition = (definition: NormalizableDefinition): ConfigField[] =>
  (definition.params ?? definition.configSchema ?? []) as ConfigField[];

const normalizeNodeConfig = (
  node: Pick<NodeInstance, 'type' | 'config'>,
  definitions: NormalizableDefinition[]
): { config: Record<string, unknown>; warnings: SemanticWarning[] } => {
  const definition = definitions.find((item) => item.type === String(node.type)) ?? null;
  if (!definition) return { config: { ...(node.config ?? {}) }, warnings: [] };

  const params = { ...(node.config ?? {}) };
  const warnings: SemanticWarning[] = [];

  for (const field of paramsForDefinition(definition)) {
    if (field.defaultValue === undefined || field.key in params) continue;
    params[field.key] = field.defaultValue;
  }

  for (const field of paramsForDefinition(definition)) {
    if (field.type !== 'number' || !(field.key in params)) continue;
    const value = params[field.key];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const normalizedValue = clamp(value, field.min, field.max);
    if (normalizedValue === value) continue;
    params[field.key] = normalizedValue;
    warnings.push({
      code: 'SEMANTIC.PARAM_CLAMPED',
      path: `node.config.${field.key}`,
      message: `Parameter ${field.key} was clamped from ${value} to ${normalizedValue}.`,
    });
  }

  for (const field of paramsForDefinition(definition)) {
    if (field.type !== 'select' || !(field.key in params)) continue;
    const normalizedValue = normalizeSelectFieldValue(field, params[field.key]);
    if (normalizedValue === null || normalizedValue === params[field.key]) continue;
    params[field.key] = normalizedValue;
    warnings.push({
      code: 'SEMANTIC.PARAM_NORMALIZED',
      path: `node.config.${field.key}`,
      message: `Parameter ${field.key} was normalized to ${normalizedValue}.`,
    });
  }

  return { config: params, warnings };
};

export const normalizeNodeConfigForDefinition = (
  type: string,
  config: Record<string, unknown>,
  definitions: NormalizableDefinition[]
): { config: Record<string, unknown>; warnings: SemanticWarning[] } =>
  normalizeNodeConfig({ type, config }, definitions);

const normalizeGraphReplaceGraph = (
  graph: GraphState,
  definitions: SemanticDefinition[]
): { graph: GraphState; warnings: SemanticWarning[] } => {
  const warnings: SemanticWarning[] = [];
  return {
    graph: {
      nodes: graph.nodes.map((node) => {
        const normalized = normalizeNodeConfig(node, definitions);
        warnings.push(...normalized.warnings);
        return { ...node, config: normalized.config };
      }),
      connections: graph.connections.map((connection) => ({ ...connection })),
    },
    warnings,
  };
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

  if (command.type === 'node.add') {
    const normalizedNode = normalizeNodeConfig(command.node, definitions);
    return {
      command: {
        ...command,
        node: {
          ...command.node,
          config: normalizedNode.config,
        },
      },
      warnings: normalizedNode.warnings,
    };
  }

  if (command.type !== 'node.params.update') {
    if (command.type !== 'graph.replace') {
      return { command, warnings: [] };
    }
    const normalizedGraph = normalizeGraphReplaceGraph(command.graph, definitions);
    return {
      command: {
        ...command,
        graph: normalizedGraph.graph,
        groups: command.groups ? [...command.groups] : undefined,
        partitions: command.partitions ? [...command.partitions] : undefined,
      },
      warnings: normalizedGraph.warnings,
    };
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
