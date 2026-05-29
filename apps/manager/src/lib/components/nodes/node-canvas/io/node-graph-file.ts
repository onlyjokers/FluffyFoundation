/**
 * Purpose: Pure node-graph file parsing and serialization helpers for Manager import/export.
 */
import type { NodeGroup } from '../controllers/group-controller';

type NodeGraphUiV1 = { collapsedNodeIds?: string[] };

type NodeGraphFileV2 = {
  version: 1 | 2;
  kind: 'node-graph';
  graph: unknown;
  groups?: unknown;
  customNodes?: unknown;
  ui?: unknown;
};

type ParsedNodeGraphFile = {
  graph: { nodes: unknown[]; connections: unknown[] };
  groups: NodeGroup[];
  customNodes: unknown[];
  collapsedNodeIds: string[];
};

type TemplateImportPayloadKind = 'midi-template' | 'node-graph' | 'unsupported';

const cloneJsonValue = <T>(value: T): T =>
  value == null ? value : (JSON.parse(JSON.stringify(value)) as T);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

function remapNodeIdList(value: unknown, nodeIdMap: Map<string, string>): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const remapped = value
    .map((id) => nodeIdMap.get(String(id)))
    .filter(Boolean) as string[];
  return Array.from(new Set(remapped));
}

function remapAgentInterface(
  value: NodeGroup['agentInterface'],
  nodeIdMap: Map<string, string>
): NodeGroup['agentInterface'] {
  if (value === undefined) return undefined;
  const next = cloneJsonValue(value);
  const exposedNodeIds = remapNodeIdList(value.exposedNodeIds, nodeIdMap);
  if (exposedNodeIds) next.exposedNodeIds = exposedNodeIds;
  return next;
}

function remapAgentPolicy(
  value: NodeGroup['agentPolicy'],
  nodeIdMap: Map<string, string>
): NodeGroup['agentPolicy'] {
  if (value === undefined) return undefined;
  const next = cloneJsonValue(value);
  const targetScopeNodeIds = remapNodeIdList(value.targetScope?.nodeIds, nodeIdMap);
  if (targetScopeNodeIds) {
    next.targetScope = {
      ...(next.targetScope ?? {}),
      nodeIds: targetScopeNodeIds,
    };
  }
  return next;
}

export function parseNodeGroups(value: unknown): NodeGroup[] {
  if (!Array.isArray(value)) return [];
  const groups: NodeGroup[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === 'string' ? item.id : '';
    if (!id) continue;
    const name = typeof item.name === 'string' ? item.name : '';
    const parentIdRaw = item.parentId;
    const parentId = typeof parentIdRaw === 'string' && parentIdRaw ? parentIdRaw : null;
    const nodeIdsRaw = Array.isArray(item.nodeIds) ? item.nodeIds : [];
    const nodeIds = nodeIdsRaw.map((v) => String(v)).filter(Boolean);
    const disabled = Boolean(item.disabled);
    const minimized = Boolean(item.minimized);
    groups.push({
      id,
      parentId,
      name,
      nodeIds,
      disabled,
      kind: item.kind === 'ai-space' ? 'ai-space' : item.kind === 'group' ? 'group' : undefined,
      minimized,
      runtimeActive:
        typeof item.runtimeActive === 'boolean' ? Boolean(item.runtimeActive) : undefined,
      agentInterface:
        item.agentInterface !== undefined
          ? (cloneJsonValue(item.agentInterface) as NodeGroup['agentInterface'])
          : undefined,
      agentPolicy:
        item.agentPolicy !== undefined
          ? (cloneJsonValue(item.agentPolicy) as NodeGroup['agentPolicy'])
          : undefined,
    });
  }
  return groups;
}

export function serializeNodeGroups(groups: NodeGroup[]): NodeGroup[] {
  return (Array.isArray(groups) ? groups : []).map((group) => ({
    id: String(group.id),
    parentId: group.parentId ? String(group.parentId) : null,
    name: String(group.name ?? ''),
    nodeIds: (group.nodeIds ?? []).map((id) => String(id)).filter(Boolean),
    disabled: Boolean(group.disabled),
    kind: group.kind === 'ai-space' ? 'ai-space' : group.kind === 'group' ? 'group' : undefined,
    minimized: Boolean(group.minimized),
    runtimeActive:
      typeof group.runtimeActive === 'boolean' ? Boolean(group.runtimeActive) : undefined,
      agentInterface:
        group.agentInterface !== undefined ? cloneJsonValue(group.agentInterface) : undefined,
    agentPolicy: group.agentPolicy !== undefined ? cloneJsonValue(group.agentPolicy) : undefined,
  }));
}

export function parseNodeGraphFile(payload: unknown): ParsedNodeGraphFile | null {
  if (!isRecord(payload)) return null;
  const wrapped = payload as NodeGraphFileV2;
  const kind = wrapped.kind;
  const version = wrapped.version;
  const graphValue = wrapped.graph;
  if (
    kind === 'node-graph' &&
    (version === 1 || version === 2) &&
    isRecord(graphValue) &&
    Array.isArray(graphValue.nodes) &&
    Array.isArray(graphValue.connections)
  ) {
    return {
      graph: graphValue as { nodes: unknown[]; connections: unknown[] },
      groups: parseNodeGroups(wrapped.groups),
      customNodes: Array.isArray(wrapped.customNodes) ? wrapped.customNodes : [],
      collapsedNodeIds: parseCollapsedNodeIds(wrapped.ui),
    };
  }

  if (
    Array.isArray((payload as Record<string, unknown>).nodes) &&
    Array.isArray((payload as Record<string, unknown>).connections)
  ) {
    return {
      graph: payload as { nodes: unknown[]; connections: unknown[] },
      groups: parseNodeGroups((payload as Record<string, unknown>).groups),
      customNodes: Array.isArray((payload as Record<string, unknown>).customNodes)
        ? ((payload as Record<string, unknown>).customNodes as unknown[])
        : [],
      collapsedNodeIds: parseCollapsedNodeIds((payload as Record<string, unknown>).ui),
    };
  }

  return null;
}

export function getTemplateImportPayloadKind(payload: unknown): TemplateImportPayloadKind {
  if (parseNodeGraphFile(payload)) return 'node-graph';
  if (isRecord(payload) && payload.version === 1 && Array.isArray(payload.bindings)) {
    return 'midi-template';
  }
  return 'unsupported';
}

export function remapImportedGroups(
  sourceGroups: NodeGroup[],
  nodeIdMap: Map<string, string>,
  createGroupId: (group?: NodeGroup) => string
): { groups: NodeGroup[]; groupIdMap: Map<string, string> } {
  const kept: NodeGroup[] = [];
  for (const group of sourceGroups) {
    const id = String(group.id ?? '');
    if (!id) continue;
    const name = typeof group.name === 'string' ? group.name : String(group.name ?? '');
    const parentId = group.parentId ? String(group.parentId) : null;
    const nodeIds = (group.nodeIds ?? [])
      .map((nid) => nodeIdMap.get(String(nid)))
      .filter(Boolean) as string[];
    const uniqueNodeIds = Array.from(new Set(nodeIds));
    if (uniqueNodeIds.length === 0) continue;
    kept.push({
      id,
      parentId,
      name,
      nodeIds: uniqueNodeIds,
      disabled: Boolean(group.disabled),
      kind: group.kind === 'ai-space' ? 'ai-space' : group.kind === 'group' ? 'group' : undefined,
      minimized: Boolean(group.minimized),
      runtimeActive:
        typeof group.runtimeActive === 'boolean' ? Boolean(group.runtimeActive) : undefined,
      agentInterface: remapAgentInterface(group.agentInterface, nodeIdMap),
      agentPolicy: remapAgentPolicy(group.agentPolicy, nodeIdMap),
    });
  }

  if (kept.length === 0)
    return { groups: [] as NodeGroup[], groupIdMap: new Map<string, string>() };

  const groupIdMap = new Map<string, string>();
  for (const group of kept) groupIdMap.set(String(group.id), createGroupId(group));

  const remapped: NodeGroup[] = kept.map((group) => ({
    id: groupIdMap.get(String(group.id)) ?? createGroupId(group),
    parentId:
      group.parentId && groupIdMap.has(String(group.parentId))
        ? groupIdMap.get(String(group.parentId))!
        : null,
    name: String(group.name ?? ''),
    nodeIds: (group.nodeIds ?? []).map(String),
    disabled: Boolean(group.disabled),
    kind: group.kind === 'ai-space' ? 'ai-space' : group.kind === 'group' ? 'group' : undefined,
    minimized: Boolean(group.minimized),
    runtimeActive:
      typeof group.runtimeActive === 'boolean' ? Boolean(group.runtimeActive) : undefined,
    agentInterface:
      group.agentInterface !== undefined ? cloneJsonValue(group.agentInterface) : undefined,
    agentPolicy: group.agentPolicy !== undefined ? cloneJsonValue(group.agentPolicy) : undefined,
  }));

  const byId = new Map(remapped.map((g) => [String(g.id), g] as const));
  const childrenByParent = new Map<string, string[]>();
  for (const g of remapped) {
    if (!g.parentId) continue;
    const pid = String(g.parentId);
    const list = childrenByParent.get(pid) ?? [];
    list.push(String(g.id));
    childrenByParent.set(pid, list);
  }

  const visiting = new Set<string>();
  const computeUnion = (id: string): Set<string> => {
    if (visiting.has(id)) return new Set();
    visiting.add(id);
    const group = byId.get(id);
    const base = new Set((group?.nodeIds ?? []).map(String));
    for (const childId of childrenByParent.get(id) ?? []) {
      const childUnion = computeUnion(String(childId));
      for (const nid of childUnion) base.add(nid);
    }
    if (group) group.nodeIds = Array.from(base);
    visiting.delete(id);
    return base;
  };

  for (const g of remapped) {
    if (g.parentId) continue;
    computeUnion(String(g.id));
  }

  return { groups: remapped, groupIdMap };
}

function parseCollapsedNodeIds(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const raw = value.collapsedNodeIds;
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v)).filter(Boolean);
}

export type { NodeGraphUiV1, NodeGraphFileV2, ParsedNodeGraphFile, TemplateImportPayloadKind };
