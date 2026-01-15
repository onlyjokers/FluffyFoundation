import { browser } from '$app/environment';
import { nodeEngine } from '$lib/nodes';
import type { GraphState, PortType } from '$lib/nodes/types';
import { parameterRegistry } from '$lib/parameters/registry';
import { minimapPreferences, type MinimapPreferences } from './uiState';
import { nodeGroupsState } from './nodeGraphUiState';
import { customNodeDefinitions, replaceCustomNodeDefinitions } from '$lib/nodes/custom-nodes/store';
import type { CustomNodeDefinition } from '$lib/nodes/custom-nodes/types';
import { definitionsInCycles } from '$lib/nodes/custom-nodes/deps';
import { get } from 'svelte/store';

const STORAGE_KEY = 'shugu-project-v1';

interface ProjectSnapshot {
  version: 1 | 2;
  savedAt: number;
  graph: GraphState;
  parameters: ReturnType<typeof parameterRegistry.snapshot>;
  groups?: unknown;
  customNodes?: unknown;
  ui?: {
    minimap?: MinimapPreferences;
  };
}

function safeGetStorage(): Storage | null {
  if (!browser) return null;
  try {
    return window.localStorage;
  } catch (err) {
    console.warn('[ProjectManager] localStorage unavailable', err);
    return null;
  }
}

function buildSnapshot(): ProjectSnapshot {
  const groups = (get(nodeGroupsState) ?? []).map((g) => ({
    id: String(g.id),
    parentId: g.parentId ? String(g.parentId) : null,
    name: String(g.name ?? ''),
    nodeIds: (g.nodeIds ?? []).map((id) => String(id)).filter(Boolean),
    disabled: Boolean(g.disabled),
    minimized: Boolean(g.minimized),
    runtimeActive: typeof g.runtimeActive === 'boolean' ? g.runtimeActive : undefined,
  }));
  const customNodes = (get(customNodeDefinitions) ?? []).map((def) => ({
    definitionId: String(def.definitionId ?? ''),
    name: String(def.name ?? ''),
    template: {
      nodes: (def.template?.nodes ?? []).map((n) => ({ ...n, outputValues: {} })),
      connections: (def.template?.connections ?? []).map((c) => ({ ...c })),
    },
    ports: (def.ports ?? []).map((p) => ({
      portKey: String(p.portKey ?? ''),
      side: p.side === 'input' ? 'input' : 'output',
      label: String(p.label ?? ''),
      type: String(p.type ?? 'any'),
      pinned: Boolean(p.pinned),
      y: typeof p.y === 'number' ? p.y : Number(p.y ?? 0),
      binding: {
        nodeId: String(p.binding?.nodeId ?? ''),
        portId: String(p.binding?.portId ?? ''),
      },
    })),
  }));
  return {
    version: 2,
    savedAt: Date.now(),
    graph: nodeEngine.exportGraph(),
    parameters: parameterRegistry.snapshot(),
    groups,
    customNodes,
    ui: { minimap: get(minimapPreferences) },
  };
}

export function saveLocalProject(reason = 'auto'): void {
  const storage = safeGetStorage();
  if (!storage) return;
  const snapshot = buildSnapshot();
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (err) {
    console.warn('[ProjectManager] Failed to save project', reason, err);
  }
}

export function loadLocalProject(): boolean {
  const storage = safeGetStorage();
  if (!storage) return false;
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return false;

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value && typeof value === 'object' && !Array.isArray(value));

  type ParsedGroup = {
    id: string;
    parentId: string | null;
    name: string;
    nodeIds: string[];
    disabled: boolean;
    minimized: boolean;
    runtimeActive?: boolean;
  };

  const parseNodeGroups = (value: unknown): ParsedGroup[] => {
    if (!Array.isArray(value)) return [];
    const groups: ParsedGroup[] = [];
    for (const item of value) {
      if (!isRecord(item)) continue;
      const id = typeof item.id === 'string' ? item.id : '';
      if (!id) continue;
      const name = typeof item.name === 'string' ? item.name : String(item.name ?? '');
      const parentIdRaw = item.parentId;
      const parentId = typeof parentIdRaw === 'string' && parentIdRaw ? parentIdRaw : null;
      const nodeIdsRaw = Array.isArray(item.nodeIds) ? item.nodeIds : [];
      const nodeIds = nodeIdsRaw.map((v) => String(v)).filter(Boolean);
      const disabled = Boolean(item.disabled);
      const minimized = Boolean(item.minimized);
      const runtimeActive = typeof item.runtimeActive === 'boolean' ? item.runtimeActive : undefined;
      groups.push({ id, parentId, name, nodeIds, disabled, minimized, runtimeActive });
    }
    return groups;
  };

  const parseCustomNodes = (value: unknown): CustomNodeDefinition[] => {
    if (!Array.isArray(value)) return [];
    const defs: CustomNodeDefinition[] = [];
    for (const item of value) {
      if (!isRecord(item)) continue;
      const definitionId = typeof item.definitionId === 'string' ? item.definitionId : '';
      if (!definitionId) continue;
      const name = typeof item.name === 'string' ? item.name : String(item.name ?? '');

      const templateRaw = isRecord(item.template) ? item.template : null;
      const nodesRaw = Array.isArray(templateRaw?.nodes) ? templateRaw?.nodes : [];
      const connectionsRaw = Array.isArray(templateRaw?.connections) ? templateRaw?.connections : [];

      const template: GraphState = {
        nodes: nodesRaw
          .map((n) => {
            const nodeRecord = isRecord(n) ? n : null;
            const positionRecord = isRecord(nodeRecord?.position) ? nodeRecord?.position : null;
            const config = isRecord(nodeRecord?.config) ? nodeRecord.config : {};
            const inputValues = isRecord(nodeRecord?.inputValues) ? nodeRecord.inputValues : {};
            return {
              ...(nodeRecord ?? {}),
              id: String(nodeRecord?.id ?? ''),
              type: String(nodeRecord?.type ?? ''),
              position: {
                x: typeof positionRecord?.x === 'number' ? positionRecord.x : Number(positionRecord?.x ?? 0),
                y: typeof positionRecord?.y === 'number' ? positionRecord.y : Number(positionRecord?.y ?? 0),
              },
              config,
              inputValues,
              outputValues: {},
            };
          })
          .filter((n) => Boolean(n.id && n.type)),
        connections: connectionsRaw
          .map((c) => {
            const connectionRecord = isRecord(c) ? c : null;
            return {
              ...(connectionRecord ?? {}),
              id: String(connectionRecord?.id ?? ''),
              sourceNodeId: String(connectionRecord?.sourceNodeId ?? ''),
              sourcePortId: String(connectionRecord?.sourcePortId ?? ''),
              targetNodeId: String(connectionRecord?.targetNodeId ?? ''),
              targetPortId: String(connectionRecord?.targetPortId ?? ''),
            };
          })
          .filter((c) => Boolean(c.id && c.sourceNodeId && c.targetNodeId && c.sourcePortId && c.targetPortId)),
      };

      const portsRaw = Array.isArray(item.ports) ? item.ports : [];
      const ports = portsRaw
        .map((p) => {
          const portRecord = isRecord(p) ? p : null;
          const bindingRecord = isRecord(portRecord?.binding) ? portRecord?.binding : null;
          return {
            portKey: String(portRecord?.portKey ?? ''),
            side: String(portRecord?.side) === 'input' ? 'input' : ('output' as const),
            label: String(portRecord?.label ?? ''),
            type: String(portRecord?.type ?? 'any') as PortType,
            pinned: Boolean(portRecord?.pinned),
            y: typeof portRecord?.y === 'number' ? portRecord.y : Number(portRecord?.y ?? 0),
            binding: {
              nodeId: String(bindingRecord?.nodeId ?? ''),
              portId: String(bindingRecord?.portId ?? ''),
            },
          };
        })
        .filter((p) => Boolean(p.portKey && p.binding?.nodeId && p.binding?.portId));

      defs.push({ definitionId, name, template, ports });
    }
    return defs;
  };

  try {
    const snapshot = JSON.parse(raw) as ProjectSnapshot;

    // Restore Custom Node definitions before loading the graph so custom node types
    // aren't dropped as "unknown node types" during `nodeEngine.loadGraph()`.
    {
      const defs = parseCustomNodes(snapshot?.customNodes);
      const inCycle = definitionsInCycles(defs);
      if (inCycle.size > 0) {
        console.warn('[ProjectManager] Dropping cyclic custom node definitions:', Array.from(inCycle));
      }
      replaceCustomNodeDefinitions(defs.filter((d) => !inCycle.has(String(d.definitionId))));
    }

    if (snapshot?.graph) {
      nodeEngine.loadGraph(snapshot.graph);
    }

    // Restore groups immediately after graph load so group-port normalization doesn't delete
    // gate/proxy nodes as "orphans" due to missing group metadata.
    nodeGroupsState.set(parseNodeGroups(snapshot?.groups));

    if (snapshot?.parameters?.length) {
      for (const p of snapshot.parameters) {
        const param = parameterRegistry.get(p.path);
        if (param) {
          // Restore base value
          param.setValue(p.baseValue, 'SYSTEM');

          // Restore modulation offsets if present
          if (p.modulators) {
            Object.entries(p.modulators).forEach(([sourceId, offset]) => {
              param.setModulation(sourceId, offset, 'SYSTEM');
            });
          }
        }
      }
    }

    const mini = snapshot?.ui?.minimap;
    if (
      mini &&
      typeof mini === 'object' &&
      typeof (mini as Record<string, unknown>).x === 'number' &&
      typeof (mini as Record<string, unknown>).y === 'number' &&
      typeof (mini as Record<string, unknown>).size === 'number'
    ) {
      minimapPreferences.set({
        x: Number((mini as Record<string, unknown>).x),
        y: Number((mini as Record<string, unknown>).y),
        size: Number((mini as Record<string, unknown>).size),
      });
    }
    return true;
  } catch (err) {
    console.warn('[ProjectManager] Failed to load project', err);
    return false;
  }
}

let unsubscribeGraph: (() => void) | null = null;
let unsubscribeUi: (() => void) | null = null;
let unsubscribeGroups: (() => void) | null = null;
let unsubscribeCustomNodes: (() => void) | null = null;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startAutoSave(intervalMs = 1000): void {
  const storage = safeGetStorage();
  if (!storage) return;

  // Throttle via simple timer instead of debouncing every graph update.
  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      saveLocalProject('graph-change');
      pending = false;
    }, intervalMs);
  };

  unsubscribeGraph?.();
  unsubscribeGraph = nodeEngine.graphState.subscribe(() => schedule());

  unsubscribeUi?.();
  unsubscribeUi = minimapPreferences.subscribe(() => schedule());

  unsubscribeGroups?.();
  unsubscribeGroups = nodeGroupsState.subscribe(() => schedule());

  unsubscribeCustomNodes?.();
  unsubscribeCustomNodes = customNodeDefinitions.subscribe(() => schedule());

  intervalHandle && clearInterval(intervalHandle);
  intervalHandle = setInterval(() => saveLocalProject('interval'), intervalMs * 5);
}

export function stopAutoSave(): void {
  unsubscribeGraph?.();
  unsubscribeGraph = null;
  unsubscribeUi?.();
  unsubscribeUi = null;
  unsubscribeGroups?.();
  unsubscribeGroups = null;
  unsubscribeCustomNodes?.();
  unsubscribeCustomNodes = null;
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
