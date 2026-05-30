/**
 * Purpose: Build compact AI-readable semantic capability manifests without canvas layout.
 */

import type { SemanticGraphSnapshot, SemanticGroup } from '@shugu/node-core';

const scopedNodeIdsFor = (space: SemanticGroup): Set<string> =>
  new Set([
    ...space.nodeIds.map(String),
    ...(space.agentPolicy?.targetScope?.nodeIds ?? []).map(String),
  ]);

const compactGroup = (group: SemanticGroup): Record<string, unknown> => {
  const eventBindings = group.agentInterface?.eventBindings?.filter(
    (binding) => binding !== 'client.joined'
  );
  return {
    id: group.id,
    kind: group.kind,
    name: group.name,
    nodeIds: group.nodeIds,
    agentInterface:
      group.agentInterface && eventBindings
        ? { ...group.agentInterface, eventBindings }
        : group.agentInterface,
    agentPolicy: group.agentPolicy,
  };
};

const nodeTypeAllowedByPolicy = (type: string, targetSpace: SemanticGroup): boolean => {
  const allowedNodeTypes = targetSpace.agentPolicy?.targetScope?.allowedNodeTypes ?? [];
  const deniedNodeTypes = targetSpace.agentPolicy?.targetScope?.deniedNodeTypes ?? [];
  if (deniedNodeTypes.includes(type)) return false;
  if (allowedNodeTypes.length > 0) return allowedNodeTypes.includes(type);
  return true;
};

const compactAiSummary = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const summary = value as Record<string, unknown>;
  const compact: Record<string, unknown> = {};
  for (const key of ['description', 'compatibility', 'examples', 'repairHints']) {
    if (summary[key] !== undefined) compact[key] = summary[key];
  }
  return Object.keys(compact).length > 0 ? compact : undefined;
};

const compactNodeDefinition = (definition: {
  type: string;
  label?: string;
  category?: string;
  ports?: unknown;
  params?: unknown;
  aiSummary?: unknown;
}): Record<string, unknown> => ({
  type: definition.type,
  label: definition.label,
  category: definition.category,
  ports: definition.ports,
  params: definition.params,
  aiSummary: compactAiSummary(definition.aiSummary),
});

const compactCreateableNodeTypeIndex = (definition: {
  type: string;
  label?: string;
  category?: string;
}): Record<string, unknown> => ({
  type: definition.type,
  label: definition.label,
  category: definition.category,
});

const fullCreateableNodeTypesBudget = 12_000;
const createableNodeTypeIndexBudget = 1_500;
const preferredCreateableNodeTypeOrder = [
  'client-button',
  'client-input-box',
  'record-sound-button',
  'cmd-aggregator',
  'ui-out',
  'scene-out',
  'proc-display-text',
  'proc-flashlight',
  'proc-screen-color',
  'proc-show-image',
  'proc-play-video',
  'proc-visual-effects',
  'show-anything',
  'string',
  'bool',
  'int',
  'float',
  'independent-variable-name',
  'set-boolean-variable',
  'get-boolean-variable',
] as const;
const preferredCreateableNodeTypes = new Set<string>(preferredCreateableNodeTypeOrder);

const orderedForAgentCreation = (
  definitions: SemanticGraphSnapshot['definitions']
): SemanticGraphSnapshot['definitions'] => {
  const byType = new Map(definitions.map((definition) => [definition.type, definition]));
  const preferred = preferredCreateableNodeTypeOrder.flatMap((type) => {
    const definition = byType.get(type);
    return definition ? [definition] : [];
  });
  const preferredTypes = new Set(preferred.map((definition) => definition.type));
  return [
    ...preferred,
    ...definitions.filter((definition) => !preferredTypes.has(definition.type)),
  ];
};

const selectFullCreateableDefinitions = (
  definitions: SemanticGraphSnapshot['definitions'],
  forceAll: boolean
): Array<Record<string, unknown>> => {
  const candidates = forceAll
    ? definitions
    : orderedForAgentCreation(definitions).filter((definition) =>
        preferredCreateableNodeTypes.has(definition.type)
      );
  const selected: Array<Record<string, unknown>> = [];
  let estimatedSize = 2;
  for (const definition of candidates) {
    const compact = compactNodeDefinition(definition);
    const nextSize = JSON.stringify(compact).length + 1;
    if (!forceAll && selected.length > 0 && estimatedSize + nextSize > fullCreateableNodeTypesBudget) {
      break;
    }
    selected.push(compact);
    estimatedSize += nextSize;
  }
  return selected;
};

const selectCreateableNodeTypeIndex = (
  definitions: SemanticGraphSnapshot['definitions']
): { items: Array<Record<string, unknown>>; truncated: boolean } => {
  const selected: Array<Record<string, unknown>> = [];
  let estimatedSize = 2;
  let truncated = false;

  for (const definition of orderedForAgentCreation(definitions)) {
    const compact = compactCreateableNodeTypeIndex(definition);
    const nextSize = JSON.stringify(compact).length + 1;
    if (selected.length > 0 && estimatedSize + nextSize > createableNodeTypeIndexBudget) {
      truncated = true;
      break;
    }
    selected.push(compact);
    estimatedSize += nextSize;
  }

  return {
    items: selected,
    truncated: truncated || selected.length < definitions.length,
  };
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
  const explicitlyAllowedNodeTypes = targetSpace.agentPolicy?.targetScope?.allowedNodeTypes ?? [];
  const createableDefinitions = targetSpace.agentPolicy?.targetScope?.allowNewNodes === true
    ? snapshot.definitions.filter(
        (definition) =>
          nodeTypeAllowedByPolicy(definition.type, targetSpace) &&
          agentCapabilityForNodeType(snapshot, definition.type).enabled
      )
    : [];
  const scopedDefinitions = snapshot.definitions.filter((definition) => {
    if (!agentCapabilityForNodeType(snapshot, definition.type).enabled) return false;
    return scopedTypes.has(definition.type);
  });
  const includeFullCreateableDefinitions = explicitlyAllowedNodeTypes.length > 0;
  const fullCreateableDefinitions = selectFullCreateableDefinitions(
    createableDefinitions,
    includeFullCreateableDefinitions
  );
  const disabledNodeTypes = snapshot.definitions
    .filter((definition) => !agentCapabilityForNodeType(snapshot, definition.type).enabled)
    .map((definition) => {
      const capability = agentCapabilityForNodeType(snapshot, definition.type);
      return {
        type: definition.type,
        ...(capability.reason ? { reason: capability.reason } : {}),
      };
    });
  const createableNodeTypeIndex = selectCreateableNodeTypeIndex(createableDefinitions);

  return {
    version: 1,
    allowedCommands: targetSpace.agentPolicy?.allowedCommands ?? targetSpace.agentInterface?.callableCommands ?? [],
    nodeTypes: scopedDefinitions.map(compactNodeDefinition),
    createableNodeTypes: fullCreateableDefinitions,
    createableNodeTypeIndex: createableNodeTypeIndex.items,
    createableNodeTypeIndexTruncated: createableNodeTypeIndex.truncated,
    disabledNodeTypes,
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
