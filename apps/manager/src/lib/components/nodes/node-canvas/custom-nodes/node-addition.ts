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

const BOOLEAN_VARIABLE_NODE_TYPES = new Set(['set-boolean-variable', 'get-boolean-variable']);

function uniqueVariableName(
  type: string,
  config: Record<string, unknown>,
  graph: GraphState | null
): string | null {
  if (!BOOLEAN_VARIABLE_NODE_TYPES.has(String(type))) return null;
  const baseRaw = typeof config.name === 'string' ? config.name.trim() : '';
  const base = baseRaw || 'variable';
  const used = new Set<string>();
  for (const node of graph?.nodes ?? []) {
    if (!BOOLEAN_VARIABLE_NODE_TYPES.has(String(node.type))) continue;
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
  wouldCreateCycle: (definitions: unknown[], parentDefinitionId: string, childDefinitionId: string) => boolean;
  getGroupFrames: () => unknown[];
  expandedCustomByGroupId: Map<string, ExpandedCustomNodeFrame>;
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
    const hintedHost = hintedGroupId
      ? (opts.expandedCustomByGroupId.get(hintedGroupId) ?? null)
      : null;

    const host = position
      ? findExpandedCustomHost({
          position,
          frames: opts.getGroupFrames(),
          expandedCustomByGroupId: opts.expandedCustomByGroupId,
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

      const groupId = opts.generateCustomNodeGroupId();
      const internal = opts.cloneInternalGraphForNewInstance(def.template, groupId);
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
