/**
 * Purpose: Import/export helpers for Phase 2.5 Custom Nodes (`*.shugu-node.json`).
 *
 * Export: pick one definition + recursively include dependency definitions.
 * Import: treat as "copy import" (generate new IDs), rewrite nested references,
 * and regenerate instance-level groupIds inside templates to avoid collisions.
 */
import type { GraphState, NodeInstance, PortType } from '$lib/nodes/types';
import { asRecord, getBoolean, getNumber, getString } from '$lib/utils/value-guards';
import { generateCustomNodeGroupId, readCustomNodeState, writeCustomNodeState } from './instance';
import type { CustomNodeInstanceState } from './instance';
import type { CustomNodeDefinition } from './types';
import { customNodeType } from './custom-node-type';
import { dependenciesForDefinition } from './deps';

export type CustomNodeFileV1 = {
  kind: 'shugu-custom-node';
  version: 1;
  exportedAt: number;
  rootDefinitionId: string;
  definitions: CustomNodeDefinition[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function cloneGraphForFile(graph: GraphState): GraphState {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const connections = Array.isArray(graph.connections) ? graph.connections : [];
  return {
    nodes: nodes.flatMap((node) => {
      const record = asRecord(node);
      const id = getString(record.id, '');
      const type = getString(record.type, '');
      if (!id || !type) return [];
      const position = asRecord(record.position);
      return [
        {
          id,
          type,
          position: {
            x: getNumber(position.x, 0),
            y: getNumber(position.y, 0),
          },
          config: { ...asRecord(record.config) },
          inputValues: { ...asRecord(record.inputValues) },
          outputValues: {},
        },
      ];
    }),
    connections: connections.flatMap((conn) => {
      const record = asRecord(conn);
      const id = getString(record.id, '');
      const sourceNodeId = getString(record.sourceNodeId, '');
      const sourcePortId = getString(record.sourcePortId, '');
      const targetNodeId = getString(record.targetNodeId, '');
      const targetPortId = getString(record.targetPortId, '');
      if (!id || !sourceNodeId || !sourcePortId || !targetNodeId || !targetPortId) return [];
      return [
        {
          id,
          sourceNodeId,
          sourcePortId,
          targetNodeId,
          targetPortId,
        },
      ];
    }),
  };
}

export function collectDefinitionClosure(
  definitions: CustomNodeDefinition[],
  rootDefinitionId: string
): CustomNodeDefinition[] {
  const byId = new Map(definitions.map((d) => [String(d.definitionId), d] as const));
  const visited = new Set<string>();
  const ordered: CustomNodeDefinition[] = [];

  const stack = [String(rootDefinitionId ?? '')];
  while (stack.length > 0) {
    const id = String(stack.pop() ?? '');
    if (!id || visited.has(id)) continue;
    visited.add(id);

    const def = byId.get(id) ?? null;
    if (!def) continue;
    ordered.push(def);

    for (const dep of dependenciesForDefinition(def)) {
      if (byId.has(dep)) stack.push(dep);
    }
  }

  return ordered;
}

export function buildCustomNodeFile(definitions: CustomNodeDefinition[], rootDefinitionId: string): CustomNodeFileV1 {
  const root = String(rootDefinitionId ?? '');
  const closure = collectDefinitionClosure(definitions, root);

  return {
    kind: 'shugu-custom-node',
    version: 1,
    exportedAt: Date.now(),
    rootDefinitionId: root,
    definitions: closure.map((def) => ({
      definitionId: String(def.definitionId),
      name: String(def.name ?? ''),
      template: cloneGraphForFile(def.template),
      ports: (def.ports ?? []).map((p) => ({
        portKey: String(p?.portKey ?? ''),
        side: String(p?.side) === 'input' ? 'input' : ('output' as const),
        label: String(p?.label ?? ''),
        type: getString(p?.type, 'any') as PortType,
        pinned: getBoolean(p?.pinned, false),
        y: typeof p?.y === 'number' ? p.y : Number(p?.y ?? 0),
        binding: {
          nodeId: String(p?.binding?.nodeId ?? ''),
          portId: String(p?.binding?.portId ?? ''),
        },
      })),
    })),
  };
}

export function parseCustomNodeFile(payload: unknown): CustomNodeFileV1 | null {
  if (!isRecord(payload)) return null;
  if (payload.kind !== 'shugu-custom-node') return null;
  if (payload.version !== 1) return null;

  const rootDefinitionId = typeof payload.rootDefinitionId === 'string' ? payload.rootDefinitionId : '';
  const exportedAt = typeof payload.exportedAt === 'number' ? payload.exportedAt : 0;
  const definitionsRaw = Array.isArray(payload.definitions) ? payload.definitions : [];
  if (!rootDefinitionId || definitionsRaw.length === 0) return null;

  const defs: CustomNodeDefinition[] = [];
  for (const item of definitionsRaw) {
    if (!isRecord(item)) continue;
    const definitionId = typeof item.definitionId === 'string' ? item.definitionId : '';
    const name = typeof item.name === 'string' ? item.name : '';
    if (!definitionId) continue;

    const templateRaw = isRecord(item.template) ? item.template : null;
    const nodesRaw = Array.isArray(templateRaw?.nodes) ? templateRaw?.nodes : [];
    const connectionsRaw = Array.isArray(templateRaw?.connections) ? templateRaw?.connections : [];
    const template: GraphState = {
      nodes: nodesRaw.flatMap((entry) => {
        const record = asRecord(entry);
        const id = getString(record.id, '');
        const type = getString(record.type, '');
        if (!id || !type) return [];
        const position = asRecord(record.position);
        return [
          {
            id,
            type,
            position: {
              x: getNumber(position.x, 0),
              y: getNumber(position.y, 0),
            },
            config: isRecord(record.config) ? (record.config as Record<string, unknown>) : {},
            inputValues: isRecord(record.inputValues)
              ? (record.inputValues as Record<string, unknown>)
              : {},
            outputValues: {},
          },
        ];
      }),
      connections: connectionsRaw.flatMap((entry) => {
        const record = asRecord(entry);
        const id = getString(record.id, '');
        const sourceNodeId = getString(record.sourceNodeId, '');
        const sourcePortId = getString(record.sourcePortId, '');
        const targetNodeId = getString(record.targetNodeId, '');
        const targetPortId = getString(record.targetPortId, '');
        if (!id || !sourceNodeId || !sourcePortId || !targetNodeId || !targetPortId) return [];
        return [
          {
            id,
            sourceNodeId,
            sourcePortId,
            targetNodeId,
            targetPortId,
          },
        ];
      }),
    };

    const portsRaw = Array.isArray(item.ports) ? item.ports : [];
    const ports = portsRaw
      .map((p) => ({
        portKey: String(p?.portKey ?? ''),
        side: String(p?.side) === 'input' ? 'input' : ('output' as const),
        label: String(p?.label ?? ''),
        type: getString(p?.type, 'any') as PortType,
        pinned: getBoolean(p?.pinned, false),
        y: typeof p?.y === 'number' ? p.y : Number(p?.y ?? 0),
        binding: {
          nodeId: String(p?.binding?.nodeId ?? ''),
          portId: String(p?.binding?.portId ?? ''),
        },
      }))
      .filter((p) => Boolean(p.portKey && p.binding?.nodeId && p.binding?.portId));

    defs.push({ definitionId, name, template, ports });
  }

  return {
    kind: 'shugu-custom-node',
    version: 1,
    exportedAt,
    rootDefinitionId,
    definitions: defs,
  };
}

function rewriteGraphDeep(graph: GraphState, idMap: Map<string, string>): GraphState {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const connections = Array.isArray(graph?.connections) ? graph.connections : [];

  const nextNodes: NodeInstance[] = nodes.map((node) => {
    let type = String(node.type ?? '');
    let config: Record<string, unknown> = { ...(node.config ?? {}) };
    const inputValues: Record<string, unknown> = { ...(node.inputValues ?? {}) };

    const state = readCustomNodeState(config);
    if (!state) {
      return { ...node, type, config, inputValues, outputValues: {} };
    }

    const mappedDefinitionId = idMap.get(String(state.definitionId)) ?? '';
    if (!mappedDefinitionId) {
      throw new Error(`[custom-node-io] missing imported dependency definitionId: ${String(state.definitionId)}`);
    }

    const groupId = generateCustomNodeGroupId();
    const internal = rewriteGraphDeep(state.internal, idMap);
    const nextState: CustomNodeInstanceState = {
      ...state,
      definitionId: mappedDefinitionId,
      groupId,
      internal,
    };

    type = customNodeType(mappedDefinitionId);
    config = writeCustomNodeState(config, nextState);

    return { ...node, type, config, inputValues, outputValues: {} };
  });

  return {
    nodes: nextNodes,
    connections: connections.map((c) => ({ ...c })),
  };
}

export function remapImportedDefinitions(definitions: CustomNodeDefinition[]): {
  definitions: CustomNodeDefinition[];
  idMap: Map<string, string>;
} {
  const idMap = new Map<string, string>();
  for (const def of definitions ?? []) {
    const id = String(def.definitionId ?? '');
    if (!id) continue;
    idMap.set(id, crypto.randomUUID?.() ?? `${Date.now()}`);
  }

  const next = (definitions ?? []).map((def) => {
    const oldId = String(def.definitionId ?? '');
    const nextId = idMap.get(oldId) ?? '';
    if (!nextId) throw new Error(`[custom-node-io] missing id mapping for ${oldId}`);

    const template = rewriteGraphDeep(cloneGraphForFile(def.template), idMap);
    const ports = (def.ports ?? []).map((p) => ({ ...p, binding: { ...p.binding } }));

    return {
      definitionId: nextId,
      name: String(def.name ?? ''),
      template,
      ports,
    } as CustomNodeDefinition;
  });

  return { definitions: next, idMap };
}
