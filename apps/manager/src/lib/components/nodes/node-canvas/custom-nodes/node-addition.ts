// Purpose: Build the NodeCanvas add-node command while keeping Custom Node safeguards isolated.
import { get, type Readable } from 'svelte/store';
import { asRecord } from '$lib/utils/value-guards';
import type { GraphState, NodeInstance } from '$lib/nodes/types';

type Position = { x: number; y: number };
type ExpandedCustomNodeFrame = { groupId: string; nodeId: string };

type NodeDefinitionLike = {
  configSchema: Array<{ key: string; defaultValue: unknown }>;
};

type NodeRegistryLike = {
  get: (type: string) => NodeDefinitionLike | undefined;
};

type NodeEngineLike = {
  getNode: (id: string) => NodeInstance | undefined;
  lastError?: { set?: (message: string) => void };
};

type CustomNodeDefinition = {
  template: GraphState;
};

const VARIABLE_NAME_NODE_TYPES = new Set([
  'set-boolean-variable',
  'get-boolean-variable',
  'independent-variable-name',
]);

function uniqueVariableName(
  type: string,
  config: Record<string, unknown>,
  graph: GraphState | null
): string | null {
  if (!VARIABLE_NAME_NODE_TYPES.has(String(type))) return null;
  const baseRaw = typeof config.name === 'string' ? config.name.trim() : '';
  const base = baseRaw || 'variable';
  const used = new Set<string>();
  for (const node of graph?.nodes ?? []) {
    if (!VARIABLE_NAME_NODE_TYPES.has(String(node.type))) continue;
    const name = typeof node.config?.name === 'string' ? node.config.name.trim() : '';
    if (name) used.add(name);
  }
  if (!used.has(base)) return base;
  for (let index = 1; index < 10000; index += 1) {
    const candidate = `${base}_${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`;
}

function collectVariableNamesFromGraph(
  graph: GraphState | null | undefined,
  out = new Set<string>()
): Set<string> {
  for (const node of graph?.nodes ?? []) {
    if (VARIABLE_NAME_NODE_TYPES.has(String(node.type))) {
      const name = typeof node.config?.name === 'string' ? node.config.name.trim() : '';
      if (name) out.add(name);
    }
    const state = asRecord(node.config).customNode;
    const internal = asRecord(state).internal;
    if (
      internal &&
      typeof internal === 'object' &&
      Array.isArray(internal.nodes) &&
      Array.isArray(internal.connections)
    ) {
      collectVariableNamesFromGraph(internal as GraphState, out);
    }
  }
  return out;
}

function nextUniqueVariableName(baseValue: unknown, used: Set<string>): string {
  const baseRaw = typeof baseValue === 'string' ? baseValue.trim() : '';
  const base = baseRaw || 'variable';
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  for (let index = 1; index < 10000; index += 1) {
    const candidate = `${base}_${index}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  const candidate = `${base}_${Date.now()}`;
  used.add(candidate);
  return candidate;
}

function findCurrentMotherInternalGraph(
  definitionId: string,
  graph: GraphState | null | undefined,
  readCustomNodeState: (
    config: Record<string, unknown>
  ) => { definitionId: string; role?: string; internal?: GraphState } | null
): GraphState | null {
  for (const node of graph?.nodes ?? []) {
    const state = readCustomNodeState(asRecord(node.config));
    if (
      state &&
      String(state.definitionId) === String(definitionId) &&
      String(state.role ?? '') === 'mother' &&
      Array.isArray(state.internal?.nodes) &&
      Array.isArray(state.internal?.connections)
    ) {
      return state.internal;
    }
  }
  return null;
}

function refreshIndependentVariableNames(graph: GraphState, used: Set<string>): GraphState {
  return {
    ...graph,
    nodes: (graph.nodes ?? []).map((node) => {
      let config = { ...(node.config ?? {}) };
      const rawState = asRecord(config).customNode;
      const internal = asRecord(rawState).internal;

      if (String(node.type) === 'independent-variable-name') {
        config = { ...config, name: nextUniqueVariableName(config.name, used) };
      } else if (
        internal &&
        typeof internal === 'object' &&
        Array.isArray(internal.nodes) &&
        Array.isArray(internal.connections)
      ) {
        config = {
          ...config,
          customNode: {
            ...rawState,
            internal: refreshIndependentVariableNames(internal as GraphState, used),
          },
        };
      }

      return { ...node, config };
    }),
  };
}

export function createNodeAdder(opts: {
  nodeRegistry: NodeRegistryLike;
  nodeEngine: NodeEngineLike;
  customNodeTypePrefix: string;
  getCustomNodeDefinition: (definitionId: string) => CustomNodeDefinition | undefined;
  cloneInternalGraphForNewInstance: (graph: GraphState, groupId?: string) => GraphState;
  generateCustomNodeGroupId: () => string;
  readCustomNodeState: (config: Record<string, unknown>) => { definitionId: string } | null;
  writeCustomNodeState: (
    config: Record<string, unknown>,
    state: Record<string, unknown>
  ) => Record<string, unknown>;
  customNodeDefinitions: Readable<unknown[]>;
  wouldCreateCycle: (
    definitions: unknown[],
    parentDefinitionId: string,
    childDefinitionId: string
  ) => boolean;
  getGroupFrames: () => unknown[];
  expandedCustomByGroupId: Map<string, ExpandedCustomNodeFrame>;
  isExpandedCustomEditable?: (groupId: string) => boolean;
  getGraphState?: () => GraphState;
  getNodeCount: () => number;
  generateId: () => string;
  addNodeCommand: (node: NodeInstance) => boolean | void;
  addProjectionNodeCommand?: (ownerNodeId: string, node: NodeInstance) => string | undefined;
}) {
  const fallbackPosition = (): Position => {
    const nodeCount = opts.getNodeCount();
    return { x: 120 + nodeCount * 10, y: 120 + nodeCount * 6 };
  };

  return (
    type: string,
    position?: Position,
    configPatch?: Record<string, unknown>
  ): string | undefined => {
    const fallback = fallbackPosition();
    const hintedGroupId = String(asRecord(configPatch).groupId ?? '');
    const canEditExpandedCustom = (groupId: string) =>
      opts.isExpandedCustomEditable?.(String(groupId)) ?? true;
    const hintedHost =
      hintedGroupId && canEditExpandedCustom(hintedGroupId)
        ? (opts.expandedCustomByGroupId.get(hintedGroupId) ?? null)
        : null;

    const host = position
      ? findExpandedCustomHost({
          position,
          frames: opts.getGroupFrames(),
          expandedCustomByGroupId: opts.expandedCustomByGroupId,
          isExpandedCustomEditable: canEditExpandedCustom,
        })
      : hintedHost;
    const targetHost = host ?? hintedHost;

    if (String(type).startsWith(opts.customNodeTypePrefix)) {
      const definitionId = String(type).slice(opts.customNodeTypePrefix.length);
      const def = opts.getCustomNodeDefinition(definitionId);
      if (!def) return undefined;

      // Prevent cyclic nesting when creating custom nodes inside an expanded mother definition.
      if (targetHost) {
        const hostNode = opts.nodeEngine.getNode(String(targetHost.nodeId));
        const hostState = hostNode ? opts.readCustomNodeState(asRecord(hostNode.config)) : null;
        if (hostState) {
          const defs = get(opts.customNodeDefinitions) ?? [];
          if (opts.wouldCreateCycle(defs, hostState.definitionId, definitionId)) {
            opts.nodeEngine.lastError?.set?.('Cyclic custom node nesting is not allowed.');
            return undefined;
          }
        }
      }

      const graph = opts.getGraphState?.() ?? null;
      const groupId = opts.generateCustomNodeGroupId();
      const sourceTemplate =
        findCurrentMotherInternalGraph(definitionId, graph, opts.readCustomNodeState) ?? def.template;
      const internal = refreshIndependentVariableNames(
        opts.cloneInternalGraphForNewInstance(sourceTemplate, groupId),
        collectVariableNamesFromGraph(graph)
      );
      const state = {
        definitionId,
        groupId,
        role: 'child',
        manualGate: true,
        internal,
      };

      const newNode: NodeInstance = {
        id: opts.generateId(),
        type,
        position: position ?? fallback,
        config: opts.writeCustomNodeState({ ...(configPatch ?? {}) }, state),
        inputValues: {},
        outputValues: {},
      };
      if (targetHost && opts.addProjectionNodeCommand) {
        return opts.addProjectionNodeCommand(String(targetHost.nodeId), newNode);
      }
      return opts.addNodeCommand(newNode) === false ? undefined : newNode.id;
    }

    const def = opts.nodeRegistry.get(type);
    if (!def) return undefined;
    const config: Record<string, unknown> = {};
    for (const field of def.configSchema) {
      config[field.key] = field.defaultValue;
    }
    const nextConfig = { ...config, ...(configPatch ?? {}) };
    const variableName = uniqueVariableName(type, nextConfig, opts.getGraphState?.() ?? null);
    if (variableName) nextConfig.name = variableName;
    const newNode: NodeInstance = {
      id: opts.generateId(),
      type,
      position: position ?? fallback,
      config: nextConfig,
      inputValues: {},
      outputValues: {},
    };
    if (targetHost && opts.addProjectionNodeCommand) {
      return opts.addProjectionNodeCommand(String(targetHost.nodeId), newNode);
    }
    return opts.addNodeCommand(newNode) === false ? undefined : newNode.id;
  };
}

function findExpandedCustomHost(opts: {
  position: Position;
  frames: unknown[];
  expandedCustomByGroupId: Map<string, ExpandedCustomNodeFrame>;
  isExpandedCustomEditable?: (groupId: string) => boolean;
}): ExpandedCustomNodeFrame | null {
  let host: ExpandedCustomNodeFrame | null = null;
  let bestDepth = -1;
  for (const rawFrame of opts.frames ?? []) {
    const frame = asRecord(rawFrame);
    const group = asRecord(frame.group);
    const gid = String(group.id ?? '');
    if (!gid) continue;
    const expanded = opts.expandedCustomByGroupId.get(gid) ?? null;
    if (!expanded) continue;
    if (opts.isExpandedCustomEditable && !opts.isExpandedCustomEditable(gid)) continue;

    const left = Number(frame.left ?? 0);
    const top = Number(frame.top ?? 0);
    const width = Number(frame.width ?? 0);
    const height = Number(frame.height ?? 0);
    const right = left + width;
    const bottom = top + height;
    if (
      opts.position.x < left ||
      opts.position.x > right ||
      opts.position.y < top ||
      opts.position.y > bottom
    ) {
      continue;
    }

    const depth = Number(frame.depth ?? 0) || 0;
    if (depth <= bestDepth) continue;
    bestDepth = depth;
    host = { groupId: gid, nodeId: expanded.nodeId };
  }

  return host;
}
