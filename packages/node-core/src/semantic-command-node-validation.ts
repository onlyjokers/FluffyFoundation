/**
 * Purpose: Validate semantic node and connection commands.
 */

import type {
  CommandState,
  SemanticCommand,
  SemanticDefinition,
  SemanticValidationError,
} from './semantic-graph-types.js';
import {
  definitionForNode,
  isCompatiblePortType,
  isNonEmpty,
  paramValidationError,
  portFor,
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
    | { type: 'node.connect' }
    | { type: 'node.disconnect' }
  >,
  definitions: SemanticDefinition[]
): SemanticValidationError[] => {
  const nodeIds = new Set(state.graph.nodes.map((node) => String(node.id)));
  const connIds = new Set(state.graph.connections.map((conn) => String(conn.id)));

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
};

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
