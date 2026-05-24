/**
 * Purpose: Validate semantic node and connection commands.
 */

import type {
  CommandState,
  SemanticCommand,
  SemanticDefinition,
  SemanticValidationError,
} from './semantic-graph-types.js';
import type { NodePort } from './types.js';
import {
  definitionForNode,
  isCompatiblePortType,
  isNonEmpty,
  normalizeSelectFieldValue,
  paramValidationError,
  portFor,
  selectFieldOptions,
  validateNode,
  validationError,
} from './semantic-command-validation-helpers.js';

export const missingNode = (
  nodeId: string,
  role: 'node' | 'source' | 'target'
): SemanticValidationError =>
  validationError(
    'GRAPH.MISSING_NODE',
    `nodes.${nodeId}`,
    `${role === 'node' ? 'Node' : role === 'source' ? 'Source node' : 'Target node'} not found: ${nodeId}`,
    ['Refresh the semantic snapshot and choose an existing node id.']
  );

export const validateNodeCommand = (
  state: CommandState,
  command: Extract<
    SemanticCommand,
    | { type: 'node.add' }
    | { type: 'node.remove' }
    | { type: 'node.archive' }
    | { type: 'node.restore' }
    | { type: 'node.params.update' }
    | { type: 'node.inputs.update' }
    | { type: 'node.connect' }
    | { type: 'node.disconnect' }
  >,
  definitions: SemanticDefinition[]
): SemanticValidationError[] => {
  const nodeIds = new Set(state.graph.nodes.map((node) => String(node.id)));
  const connIds = new Set(state.graph.connections.map((conn) => String(conn.id)));
  const scopeErrors = validateScopeGroup(state, command);
  if (scopeErrors.length > 0) return scopeErrors;

  switch (command.type) {
    case 'node.add': {
      const error = validateNode(command.node, definitions);
      return error ? [error] : [];
    }
    case 'node.remove':
    case 'node.archive':
    case 'node.restore':
      return nodeIds.has(String(command.nodeId)) ? [] : [missingNode(String(command.nodeId), 'node')];
    case 'node.params.update':
      return validateParamUpdate(state, command, definitions, nodeIds);
    case 'node.inputs.update':
      return validateInputUpdate(state, command, definitions, nodeIds);
    case 'node.connect':
      return validateConnect(state, command, definitions, nodeIds);
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
  }
};

const validateScopeGroup = (
  state: CommandState,
  command: Extract<
    SemanticCommand,
    | { type: 'node.add' }
    | { type: 'node.remove' }
    | { type: 'node.archive' }
    | { type: 'node.restore' }
    | { type: 'node.params.update' }
    | { type: 'node.inputs.update' }
    | { type: 'node.connect' }
    | { type: 'node.disconnect' }
  >
): SemanticValidationError[] => {
  if (!command.scopeGroupId) return [];
  return state.groups.some((group) => group.id === command.scopeGroupId)
    ? []
    : [
        validationError('GRAPH.MISSING_GROUP', `groups.${command.scopeGroupId}`, `Group not found: ${command.scopeGroupId}`, [
          'Refresh the snapshot and choose an existing scopeGroupId.',
        ]),
      ];
};

const validateParamUpdate = (
  state: CommandState,
  command: Extract<SemanticCommand, { type: 'node.params.update' }>,
  definitions: SemanticDefinition[],
  nodeIds: Set<string>
): SemanticValidationError[] => {
  if (!nodeIds.has(String(command.nodeId))) return [missingNode(String(command.nodeId), 'node')];
  const definition = definitionForNode(state, definitions, String(command.nodeId));
  if (!definition) return [];
  const errors: SemanticValidationError[] = [];
  for (const field of definition.params) {
    if (!(field.key in command.params)) continue;
    const value = command.params[field.key];
    if (field.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      if (typeof field.min === 'number' && value < field.min) {
        errors.push(paramValidationError(String(command.nodeId), field.key, value, 'min', field.min));
      }
      if (typeof field.max === 'number' && value > field.max) {
        errors.push(paramValidationError(String(command.nodeId), field.key, value, 'max', field.max));
      }
    }
    if (field.type === 'select') {
      if (normalizeSelectFieldValue(field, value) !== null) continue;
      errors.push(
        validationError(
          'GRAPH.PARAM_INVALID',
          `nodes.${command.nodeId}.params.${field.key}`,
          `Param ${field.key} is not supported.`,
          [
            `Choose one of: ${(field.options ?? []).map((option) => String(option.value)).join(', ')}`,
          ],
          `Unsupported value: ${String(value)}`
        )
      );
    }
  }
  return errors;
};

const validateInputUpdate = (
  state: CommandState,
  command: Extract<SemanticCommand, { type: 'node.inputs.update' }>,
  definitions: SemanticDefinition[],
  nodeIds: Set<string>
): SemanticValidationError[] => {
  if (!nodeIds.has(String(command.nodeId))) return [missingNode(String(command.nodeId), 'node')];
  const definition = definitionForNode(state, definitions, String(command.nodeId));
  if (!definition) return [];
  const errors: SemanticValidationError[] = [];
  for (const [portId, value] of Object.entries(command.inputValues)) {
    const port = portFor(definition, 'inputs', portId);
    if (!port) {
      errors.push(
        validationError(
          'GRAPH.PORT_NOT_FOUND',
          `nodes.${command.nodeId}.inputs.${portId}`,
          `Input port not found: ${command.nodeId}:${portId}`,
          ['Choose an input port from the node definition.']
        )
      );
      continue;
    }
    const valueError = validateInputValue(String(command.nodeId), port, value);
    if (valueError) errors.push(valueError);
  }
  return errors;
};

const validateInputValue = (
  nodeId: string,
  port: NodePort,
  value: unknown
): SemanticValidationError | null => {
  if (port.type === 'any') return null;
  if (port.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return inputValidationError(nodeId, port.id, 'number', value);
    }
    if (typeof port.min === 'number' && value < port.min) {
      return inputRangeValidationError(nodeId, port.id, value, 'min', port.min);
    }
    if (typeof port.max === 'number' && value > port.max) {
      return inputRangeValidationError(nodeId, port.id, value, 'max', port.max);
    }
    return null;
  }
  if (port.type === 'boolean') {
    return typeof value === 'boolean' ? null : inputValidationError(nodeId, port.id, 'boolean', value);
  }
  if (port.type === 'string' || port.type === 'color' || port.type === 'asset') {
    if (typeof value !== 'string') return inputValidationError(nodeId, port.id, 'string', value);
    if (port.options && port.options.length > 0 && !selectFieldOptions(port).includes(value)) {
      return validationError(
        'GRAPH.INPUT_INVALID',
        `nodes.${nodeId}.inputs.${port.id}`,
        `Input ${port.id} is not supported.`,
        [`Choose one of: ${selectFieldOptions(port).join(', ')}`],
        `Unsupported value: ${String(value)}`
      );
    }
    return null;
  }
  if (port.type === 'array') {
    return Array.isArray(value) ? null : inputValidationError(nodeId, port.id, 'array', value);
  }
  return null;
};

const inputValidationError = (
  nodeId: string,
  portId: string,
  expected: string,
  value: unknown
): SemanticValidationError =>
  validationError(
    'GRAPH.INPUT_INVALID',
    `nodes.${nodeId}.inputs.${portId}`,
    `Input ${portId} must be a ${expected}.`,
    [`Use a ${expected} value for input port ${portId}.`],
    `Unsupported value: ${String(value)}`
  );

const inputRangeValidationError = (
  nodeId: string,
  portId: string,
  value: number,
  bound: 'min' | 'max',
  limit: number
): SemanticValidationError =>
  validationError(
    'GRAPH.INPUT_OUT_OF_RANGE',
    `nodes.${nodeId}.inputs.${portId}`,
    `Input ${portId} is ${bound === 'min' ? 'below minimum' : 'above maximum'} ${limit}.`,
    [`Use a value ${bound === 'min' ? 'greater than or equal to' : 'less than or equal to'} ${limit}.`],
    `${value} violates ${bound} ${limit}.`
  );

const validateConnect = (
  state: CommandState,
  command: Extract<SemanticCommand, { type: 'node.connect' }>,
  definitions: SemanticDefinition[],
  nodeIds: Set<string>
): SemanticValidationError[] => {
  const connection = command.connection;
  if (!isNonEmpty(connection.id)) {
    return [
      validationError('GRAPH.INVALID_CONNECTION', 'connections.id', 'Connection id is required.', [
        'Provide a non-empty connection id.',
      ]),
    ];
  }
  if (!nodeIds.has(String(connection.sourceNodeId))) return [missingNode(String(connection.sourceNodeId), 'source')];
  if (!nodeIds.has(String(connection.targetNodeId))) return [missingNode(String(connection.targetNodeId), 'target')];

  const duplicateTarget = state.graph.connections.some(
    (conn) =>
      String(conn.targetNodeId) === String(connection.targetNodeId) &&
      String(conn.targetPortId) === String(connection.targetPortId) &&
      String(conn.id) !== String(connection.id)
  );
  if (duplicateTarget) {
    return [
      validationError(
        'GRAPH.PORT_ALREADY_CONNECTED',
        `connections.${connection.id}.targetPortId`,
        'Target port is already connected.',
        ['Disconnect the existing target port connection before reconnecting.']
      ),
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
};
