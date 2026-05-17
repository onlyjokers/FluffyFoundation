/**
 * Purpose: Build compact AI-readable semantic capability manifests without canvas layout.
 */

import type { SemanticGraphSnapshot, SemanticGroup } from '@shugu/node-core';

const scopedNodeIdsFor = (space: SemanticGroup): Set<string> =>
  new Set([
    ...space.nodeIds.map(String),
    ...(space.agentPolicy?.targetScope?.nodeIds ?? []).map(String),
  ]);

const compactGroup = (group: SemanticGroup): Record<string, unknown> => ({
  id: group.id,
  kind: group.kind,
  name: group.name,
  nodeIds: group.nodeIds,
  agentInterface: group.agentInterface,
  agentPolicy: group.agentPolicy,
});

const nodeTypeAllowedByPolicy = (type: string, targetSpace: SemanticGroup): boolean => {
  const allowedNodeTypes = targetSpace.agentPolicy?.targetScope?.allowedNodeTypes ?? [];
  const deniedNodeTypes = targetSpace.agentPolicy?.targetScope?.deniedNodeTypes ?? [];
  if (deniedNodeTypes.includes(type)) return false;
  if (allowedNodeTypes.length > 0) return allowedNodeTypes.includes(type);
  return true;
};

export const agentCapabilityForNodeType = (
  snapshot: Pick<SemanticGraphSnapshot, 'agentCapabilities'>,
  type: string
): { enabled: boolean; reason?: string } => {
  const setting = (snapshot.agentCapabilities?.nodes ?? []).find(
    (entry) => String(entry.nodeType) === String(type)
  );
  if (!setting) return { enabled: true };
  return {
    enabled: setting.enabled !== false,
    ...(setting.disabledReason ? { reason: setting.disabledReason } : {}),
  };
};

export const compactSemanticSnapshot = (
  snapshot: SemanticGraphSnapshot,
  targetSpace?: SemanticGroup
): Record<string, unknown> => {
  const scopedNodeIds = targetSpace ? scopedNodeIdsFor(targetSpace) : null;
  const nodes = scopedNodeIds
    ? snapshot.nodes.filter((node) => scopedNodeIds.has(String(node.id)))
    : snapshot.nodes;
  const connections = scopedNodeIds
    ? snapshot.connections.filter(
        (connection) =>
          scopedNodeIds.has(String(connection.sourceNodeId)) &&
          scopedNodeIds.has(String(connection.targetNodeId))
      )
    : snapshot.connections;

  return {
    revision: snapshot.revision,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      params: node.params,
      inputValues: node.inputValues,
      outputValues: node.outputValues,
    })),
    connections,
    groups: targetSpace ? [compactGroup(targetSpace)] : snapshot.groups.map(compactGroup),
    runtimeStatus: snapshot.runtimeStatus,
    deviceCapabilities: snapshot.deviceCapabilities,
    errors: snapshot.errors,
  };
};

export const buildCapabilityManifest = (
  snapshot: SemanticGraphSnapshot,
  targetSpace: SemanticGroup
): Record<string, unknown> => {
  const scopedNodeIds = scopedNodeIdsFor(targetSpace);
  const scopedNodes = snapshot.nodes.filter((node) => scopedNodeIds.has(String(node.id)));
  const scopedTypes = new Set(scopedNodes.map((node) => String(node.type)));
  const createableDefinitions = targetSpace.agentPolicy?.targetScope?.allowNewNodes === true
    ? snapshot.definitions.filter(
        (definition) =>
          nodeTypeAllowedByPolicy(definition.type, targetSpace) &&
          agentCapabilityForNodeType(snapshot, definition.type).enabled
      )
    : [];
  const visibleDefinitions = snapshot.definitions.filter((definition) => {
    if (!agentCapabilityForNodeType(snapshot, definition.type).enabled) return false;
    if (scopedTypes.has(definition.type)) return true;
    return createableDefinitions.some((item) => item.type === definition.type);
  });
  const disabledNodeTypes = snapshot.definitions
    .filter((definition) => !agentCapabilityForNodeType(snapshot, definition.type).enabled)
    .map((definition) => {
      const capability = agentCapabilityForNodeType(snapshot, definition.type);
      return {
        type: definition.type,
        ...(capability.reason ? { reason: capability.reason } : {}),
      };
    });

  return {
    version: 1,
    targetSpace: compactGroup(targetSpace),
    allowedCommands: targetSpace.agentPolicy?.allowedCommands ?? targetSpace.agentInterface?.callableCommands ?? [],
    nodeTypes: visibleDefinitions.map((definition) => ({
      type: definition.type,
      label: definition.label,
      category: definition.category,
      ports: definition.ports,
      params: definition.params,
      aiSummary: definition.aiSummary,
    })),
    createableNodeTypes: createableDefinitions.map((definition) => ({
      type: definition.type,
      label: definition.label,
      category: definition.category,
      ports: definition.ports,
      params: definition.params,
      aiSummary: definition.aiSummary,
    })),
    disabledNodeTypes,
    nodes: scopedNodes.map((node) => {
      const incoming = snapshot.connections
        .filter((connection) => String(connection.targetNodeId) === String(node.id))
        .map((connection) => ({
          targetPortId: connection.targetPortId,
          sourceNodeId: connection.sourceNodeId,
          sourcePortId: connection.sourcePortId,
        }));
      return {
        id: node.id,
        type: node.type,
        params: node.params,
        inputValues: node.inputValues,
        outputValues: node.outputValues,
        incoming,
      };
    }),
    connections: snapshot.connections.filter(
      (connection) =>
        scopedNodeIds.has(String(connection.sourceNodeId)) &&
        scopedNodeIds.has(String(connection.targetNodeId))
    ),
  };
};

export const nodeTypesFor = (snapshot: SemanticGraphSnapshot, targetSpace?: SemanticGroup): string[] => {
  if (!targetSpace) return [...new Set(snapshot.nodes.map((node) => node.type).filter(Boolean))];
  const scopedNodeIds = scopedNodeIdsFor(targetSpace);
  return [
    ...new Set(
      snapshot.nodes
        .filter((node) => scopedNodeIds.has(String(node.id)))
        .map((node) => node.type)
        .filter(Boolean)
    ),
  ];
};
