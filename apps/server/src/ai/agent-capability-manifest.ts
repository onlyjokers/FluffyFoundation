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
  const exposedDefinitions = snapshot.definitions.filter((definition) => scopedTypes.has(definition.type));

  return {
    version: 1,
    targetSpace: compactGroup(targetSpace),
    allowedCommands: targetSpace.agentPolicy?.allowedCommands ?? targetSpace.agentInterface?.callableCommands ?? [],
    nodeTypes: exposedDefinitions.map((definition) => ({
      type: definition.type,
      label: definition.label,
      category: definition.category,
      ports: definition.ports,
      params: definition.params,
      aiSummary: definition.aiSummary,
    })),
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
