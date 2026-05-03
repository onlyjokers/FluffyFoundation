/**
 * Purpose: Validate graph state integrity using shared graph + registry metadata contracts.
 */

import type {
  ConfigField,
  GraphState,
  NodeDefinition,
  NodePlatformTarget,
  NodePort,
  NodeSideEffectClass,
  PortType,
} from '../types.js';
import type { SemanticGroup, SemanticPartition } from '../semantic-graph-types.js';

export type GraphValidationErrorCode =
  | 'DUPLICATE_NODE_ID'
  | 'DUPLICATE_CONNECTION_ID'
  | 'UNKNOWN_NODE_TYPE'
  | 'MISSING_SOURCE_NODE'
  | 'MISSING_TARGET_NODE'
  | 'ENDPOINT_NOT_FOUND'
  | 'PORT_TYPE_MISMATCH'
  | 'PARAM_OUT_OF_BOUNDS'
  | 'GROUP_BOUNDARY_VIOLATION'
  | 'PLATFORM_INCOMPATIBLE'
  | 'SIDE_EFFECT_FORBIDDEN'
  | 'CYCLE_DETECTED'
  | 'DISABLED_NODE_CONNECTED'
  | 'DISABLED_NODE_DEPLOYED'
  | 'DEPLOYMENT_SIDE_EFFECT_FORBIDDEN'
  | 'UNDEPLOYABLE_GRAPH';

export type GraphValidationError = {
  code: GraphValidationErrorCode;
  message: string;
  targetId?: string;
  details?: Record<string, unknown>;
};

export type GraphValidationResult = { ok: boolean; errors: GraphValidationError[] };

export type GraphValidationOptions = {
  definitions?: NodeDefinition[];
  groups?: SemanticGroup[];
  partitions?: SemanticPartition[];
  targetPlatform?: NodePlatformTarget;
  allowedSideEffects?: NodeSideEffectClass[];
  deployable?: boolean;
};

const error = (
  code: GraphValidationErrorCode,
  message: string,
  targetId?: string,
  details?: Record<string, unknown>
): GraphValidationError => ({
  code,
  message,
  ...(targetId ? { targetId } : {}),
  ...(details ? { details } : {}),
});

const findPort = (ports: NodePort[] | undefined, portId: string): NodePort | undefined =>
  (ports ?? []).find((port) => String(port.id) === String(portId));

const isCompatiblePortType = (source: PortType, target: PortType): boolean =>
  source === target || source === 'any' || target === 'any';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const validateParamBounds = (
  nodeId: string,
  config: Record<string, unknown>,
  schema: ConfigField[],
  errors: GraphValidationError[]
) => {
  for (const field of schema) {
    if (field.type !== 'number') continue;
    const value = config[field.key];
    if (!isFiniteNumber(value)) continue;
    if (isFiniteNumber(field.min) && value < field.min) {
      errors.push(
        error('PARAM_OUT_OF_BOUNDS', `Param ${field.key} is below minimum ${field.min}.`, nodeId, {
          key: field.key,
          value,
          min: field.min,
        })
      );
    }
    if (isFiniteNumber(field.max) && value > field.max) {
      errors.push(
        error('PARAM_OUT_OF_BOUNDS', `Param ${field.key} is above maximum ${field.max}.`, nodeId, {
          key: field.key,
          value,
          max: field.max,
        })
      );
    }
  }
};

const groupIdByNode = (groups: SemanticGroup[] = []): Map<string, string> => {
  const map = new Map<string, string>();
  for (const group of groups) {
    for (const nodeId of group.nodeIds ?? []) map.set(String(nodeId), String(group.id));
  }
  return map;
};

const disabledNodes = (groups: SemanticGroup[] = []): Set<string> => {
  const disabled = new Set<string>();
  for (const group of groups) {
    if (!group.disabled) continue;
    for (const nodeId of group.nodeIds ?? []) disabled.add(String(nodeId));
  }
  return disabled;
};

const detectsCycle = (state: GraphState, definitions: Map<string, NodeDefinition>): boolean => {
  const edges = new Map<string, string[]>();
  for (const node of state.nodes) edges.set(String(node.id), []);

  for (const conn of state.connections) {
    const targetNode = state.nodes.find((node) => String(node.id) === String(conn.targetNodeId));
    const targetDef = targetNode ? definitions.get(String(targetNode.type)) : undefined;
    const targetPort = findPort(targetDef?.inputs, conn.targetPortId);
    if (targetPort?.kind === 'sink') continue;
    const list = edges.get(String(conn.sourceNodeId));
    if (list) list.push(String(conn.targetNodeId));
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const next of edges.get(nodeId) ?? []) {
      if (visit(next)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };

  for (const nodeId of edges.keys()) {
    if (visit(nodeId)) return true;
  }
  return false;
};

export function validateGraphState(
  state: GraphState,
  options: GraphValidationOptions = {}
): GraphValidationResult {
  const errors: GraphValidationError[] = [];
  const nodeIds = new Set<string>();
  const connectionIds = new Set<string>();
  const definitions = new Map((options.definitions ?? []).map((definition) => [definition.type, definition]));
  const nodeById = new Map<string, (typeof state.nodes)[number]>();
  const groups = options.groups ?? [];
  const nodeGroup = groupIdByNode(groups);
  const disabled = disabledNodes(groups);

  for (const node of state.nodes) {
    const id = String(node.id);
    if (nodeIds.has(id)) errors.push(error('DUPLICATE_NODE_ID', `Duplicate node id: ${id}`, id));
    nodeIds.add(id);
    nodeById.set(id, node);

    const definition = definitions.get(String(node.type));
    if (definitions.size > 0 && !definition) {
      errors.push(error('UNKNOWN_NODE_TYPE', `Unknown node type: ${node.type}`, id));
      continue;
    }

    if (definition) {
      validateParamBounds(id, node.config ?? {}, definition.configSchema ?? [], errors);
      const metadata = definition.metadata;
      if (
        options.targetPlatform &&
        metadata?.platformTargets &&
        !metadata.platformTargets.includes(options.targetPlatform)
      ) {
        errors.push(
          error(
            'PLATFORM_INCOMPATIBLE',
            `Node ${id} cannot run on ${options.targetPlatform}.`,
            id,
            { type: node.type, platforms: metadata.platformTargets }
          )
        );
      }
      if (
        options.allowedSideEffects &&
        metadata?.sideEffectClass &&
        !options.allowedSideEffects.includes(metadata.sideEffectClass)
      ) {
        errors.push(
          error('SIDE_EFFECT_FORBIDDEN', `Node ${id} side effect is not allowed.`, id, {
            type: node.type,
            sideEffectClass: metadata.sideEffectClass,
          })
        );
      }
    }
  }

  for (const connection of state.connections) {
    const id = String(connection.id);
    if (connectionIds.has(id))
      errors.push(error('DUPLICATE_CONNECTION_ID', `Duplicate connection id: ${id}`, id));
    connectionIds.add(id);

    const source = String(connection.sourceNodeId);
    const target = String(connection.targetNodeId);
    if (!nodeIds.has(source)) errors.push(error('MISSING_SOURCE_NODE', `Missing source node: ${source}`, id));
    if (!nodeIds.has(target)) errors.push(error('MISSING_TARGET_NODE', `Missing target node: ${target}`, id));

    const sourceNode = nodeById.get(source);
    const targetNode = nodeById.get(target);
    const sourceDef = sourceNode ? definitions.get(String(sourceNode.type)) : undefined;
    const targetDef = targetNode ? definitions.get(String(targetNode.type)) : undefined;
    const sourcePort = findPort(sourceDef?.outputs, connection.sourcePortId);
    const targetPort = findPort(targetDef?.inputs, connection.targetPortId);

    if (sourceDef && !sourcePort) {
      errors.push(
        error('ENDPOINT_NOT_FOUND', `Source port not found: ${source}:${connection.sourcePortId}`, id, {
          nodeId: source,
          portId: connection.sourcePortId,
        })
      );
    }
    if (targetDef && !targetPort) {
      errors.push(
        error('ENDPOINT_NOT_FOUND', `Target port not found: ${target}:${connection.targetPortId}`, id, {
          nodeId: target,
          portId: connection.targetPortId,
        })
      );
    }
    if (sourcePort && targetPort && !isCompatiblePortType(sourcePort.type, targetPort.type)) {
      errors.push(
        error('PORT_TYPE_MISMATCH', `Cannot connect ${sourcePort.type} to ${targetPort.type}.`, id, {
          sourceType: sourcePort.type,
          targetType: targetPort.type,
        })
      );
    }

    const sourceGroup = nodeGroup.get(source);
    const targetGroup = nodeGroup.get(target);
    if (sourceGroup && targetGroup !== sourceGroup && sourceNode?.type !== 'group-proxy') {
      errors.push(
        error('GROUP_BOUNDARY_VIOLATION', `Connection ${id} leaves group ${sourceGroup} without proxy.`, id, {
          sourceGroup,
          targetGroup: targetGroup ?? null,
        })
      );
    }
    if (disabled.has(source) || disabled.has(target)) {
      errors.push(
        error('DISABLED_NODE_CONNECTED', `Connection ${id} references a disabled group node.`, id, {
          sourceDisabled: disabled.has(source),
          targetDisabled: disabled.has(target),
        })
      );
    }
  }

  if (detectsCycle(state, definitions)) {
    errors.push(error('CYCLE_DETECTED', 'Graph contains a non-sink execution cycle.'));
  }

  for (const partition of options.partitions ?? []) {
    for (const nodeId of partition.nodeIds ?? []) {
      const id = String(nodeId);
      const node = nodeById.get(id);
      if (!node) {
        errors.push(error('UNDEPLOYABLE_GRAPH', `Partition ${partition.id} references unknown node ${id}.`, partition.id));
        continue;
      }
      if (disabled.has(id)) {
        errors.push(
          error('DISABLED_NODE_DEPLOYED', `Partition ${partition.id} deploys disabled node ${id}.`, partition.id, {
            nodeId: id,
          })
        );
      }
      const definition = definitions.get(String(node.type));
      const sideEffect = definition?.metadata?.sideEffectClass;
      if (
        options.deployable &&
        options.allowedSideEffects &&
        sideEffect &&
        !options.allowedSideEffects.includes(sideEffect)
      ) {
        errors.push(
          error(
            'DEPLOYMENT_SIDE_EFFECT_FORBIDDEN',
            `Partition ${partition.id} deploys forbidden side effect ${sideEffect}.`,
            partition.id,
            { nodeId: id, sideEffectClass: sideEffect }
          )
        );
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
