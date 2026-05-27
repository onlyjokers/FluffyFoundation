/**
 * Purpose: Manager-side Custom Node library store + NodeRegistry registration helpers.
 *
 * Custom Node definitions are user-authored subgraph templates that are registered
 * into the runtime NodeRegistry as `custom:<definitionId>` types.
 */
import { get, writable, type Writable } from 'svelte/store';
import type { Connection, GraphState, NodeDefinition, NodePort, NodeInstance, PortType } from '$lib/nodes/types';
import { nodeRegistry } from '$lib/nodes/registry';
import type { CustomNodeDefinition } from './types';
import { readCustomNodeState } from './instance';
import { NodeRuntime, type NodeVariableStore } from '@shugu/node-core';
import { CUSTOM_NODE_TYPE_PREFIX, customNodeType } from './custom-node-type';
import {
  normalizeLegacyCustomNodeDefinition,
  normalizeLegacyCustomNodeGraph,
} from './legacy-migration';

const buildInternalSignature = (graph: GraphState | null | undefined): string => {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const connections = Array.isArray(graph?.connections) ? graph.connections : [];
  const groups = Array.isArray(graph?.groups) ? graph.groups : [];
  try {
    return JSON.stringify({
      n: nodes.map((n) => ({
        id: String(n?.id ?? ''),
        type: String(n?.type ?? ''),
        config: n?.config ?? {},
        inputValues: n?.inputValues ?? {},
      })),
      c: connections.map((c) => ({
        s: String(c?.sourceNodeId ?? ''),
        sp: String(c?.sourcePortId ?? ''),
        t: String(c?.targetNodeId ?? ''),
        tp: String(c?.targetPortId ?? ''),
      })),
      g: groups.map((g) => ({
        id: String(g?.id ?? ''),
        parentId: g?.parentId ? String(g.parentId) : null,
        nodeIds: (g?.nodeIds ?? []).map(String),
        disabled: Boolean(g?.disabled),
        minimized: Boolean(g?.minimized),
      })),
    });
  } catch {
    return `${nodes.length}:${connections.length}:${Date.now()}`;
  }
};

const materializeInternalNodeId = (customNodeId: string, internalNodeId: string): string =>
  `cn:${String(customNodeId ?? '')}:${String(internalNodeId ?? '')}`;

const materializeInternalGroupId = (customNodeId: string, groupId: string): string =>
  `cn:${String(customNodeId ?? '')}:group:${String(groupId ?? '')}`;

const createCustomNodeProcess = (definition: CustomNodeDefinition): NodeDefinition['process'] => {
  const runtimeByNodeId = new Map<
    string,
    {
      runtime: NodeRuntime;
      signature: string;
      variableStore?: NodeVariableStore;
    }
  >();

  const inputPorts = (definition.ports ?? []).filter((p) => String(p?.side ?? '') === 'input');
  const outputPorts = (definition.ports ?? []).filter((p) => String(p?.side ?? '') === 'output');

  return (inputs, config, context) => {
    const state = readCustomNodeState(config ?? {});
    if (!state) return {};

    const gate = inputs?.gate;
    if (gate === false) return {};

    const internal = normalizeLegacyCustomNodeGraph(
      state.internal ?? { nodes: [], connections: [] }
    );
    const signature = buildInternalSignature(internal);

    const nodeId = String(context?.nodeId ?? '');
    const variableStore = context?.variableStore;
    let entry = runtimeByNodeId.get(nodeId);
    if (!entry || entry.signature !== signature || entry.variableStore !== variableStore) {
      const runtime = new NodeRuntime(nodeRegistry, { variableStore });
      const internalGroups = Array.isArray(internal.groups) ? internal.groups : [];
      const internalGroupIds = new Set(
        internalGroups.map((group) => String(group?.id ?? '')).filter(Boolean)
      );
      const fallbackInternalGroupId =
        internalGroups.length === 1 ? String(internalGroups[0]?.id ?? '') : '';
      const resolveInternalPortGroupId = (rawGroupId: string): string => {
        const id = String(rawGroupId ?? '');
        if (internalGroupIds.has(id)) return id;
        if (fallbackInternalGroupId && id && id === String(state.groupId ?? '')) {
          return fallbackInternalGroupId;
        }
        return id;
      };
      const nodes: NodeInstance[] = (internal.nodes ?? []).map((n) => {
        const id = String(n?.id ?? '');
        const type = String(n?.type ?? '');
        const config = { ...(n?.config ?? {}) };
        const rawGroupId = resolveInternalPortGroupId(String(config.groupId ?? ''));
        if ((type === 'group-gate' || type === 'group-proxy') && internalGroupIds.has(rawGroupId)) {
          config.groupId = materializeInternalGroupId(nodeId, rawGroupId);
        }
        return {
          ...n,
          id: materializeInternalNodeId(nodeId, id),
          type,
          config,
          inputValues: { ...(n?.inputValues ?? {}) },
          outputValues: {},
        };
      });
      const connections: Connection[] = (internal.connections ?? []).map((c) => ({
        ...c,
        sourceNodeId: materializeInternalNodeId(nodeId, String(c?.sourceNodeId ?? '')),
        sourcePortId: String(c?.sourcePortId ?? ''),
        targetNodeId: materializeInternalNodeId(nodeId, String(c?.targetNodeId ?? '')),
        targetPortId: String(c?.targetPortId ?? ''),
      }));
      const groups = internalGroups.flatMap((group) => {
        const id = String(group?.id ?? '');
        if (!id) return [];
        const parentId = group?.parentId ? String(group.parentId) : '';
        return [
          {
            id: materializeInternalGroupId(nodeId, id),
            parentId:
              parentId && internalGroupIds.has(parentId)
                ? materializeInternalGroupId(nodeId, parentId)
                : null,
            name: String(group?.name ?? 'Group'),
            nodeIds: (group?.nodeIds ?? []).map((innerId) =>
              materializeInternalNodeId(nodeId, String(innerId))
            ),
            disabled: Boolean(group?.disabled),
            minimized: Boolean(group?.minimized),
          },
        ];
      });
      runtime.loadGraph({ nodes, connections, ...(groups.length > 0 ? { groups } : {}) });
      entry = { runtime, signature, variableStore };
      runtimeByNodeId.set(nodeId, entry);
    }

    const runtime = entry.runtime;
    runtime.clearOverrides();

    for (const port of inputPorts) {
      const portKey = String(port?.portKey ?? '');
      const binding = port?.binding ?? null;
      if (!portKey || !binding?.nodeId || !binding?.portId) continue;
      if (!Object.prototype.hasOwnProperty.call(inputs ?? {}, portKey)) continue;
      runtime.applyOverride(
        materializeInternalNodeId(nodeId, String(binding.nodeId)),
        'input',
        String(binding.portId),
        inputs[portKey]
      );
    }

    runtime.compileNow();
    runtime.step();

    const outputs: Record<string, unknown> = {};
    for (const port of outputPorts) {
      const portKey = String(port?.portKey ?? '');
      const binding = port?.binding ?? null;
      if (!portKey || !binding?.nodeId || !binding?.portId) continue;
      const node = runtime.getNode(materializeInternalNodeId(nodeId, String(binding.nodeId)));
      outputs[portKey] = node?.outputValues?.[String(binding.portId)];
    }

    return outputs;
  };
};

export const CUSTOM_NODE_CATEGORY = 'Custom' as const;
export const customNodeDefinitions: Writable<CustomNodeDefinition[]> = writable([]);
export { CUSTOM_NODE_TYPE_PREFIX, customNodeType };

function gatePort(): NodePort {
  return { id: 'gate', label: 'Active', type: 'boolean', defaultValue: true };
}

function portsFor(definition: CustomNodeDefinition): { inputs: NodePort[]; outputs: NodePort[] } {
  const inputs: NodePort[] = [gatePort()];
  const outputs: NodePort[] = [];

  for (const port of definition.ports ?? []) {
      const id = String(port?.portKey ?? '');
      if (!id) continue;
      const def: NodePort = {
        id,
        label: String(port?.label ?? id),
        type: (port?.type ?? 'any') as PortType,
      };
    if (String(port?.side) === 'input') inputs.push(def);
    else outputs.push(def);
  }

  return { inputs, outputs };
}

function definitionToNodeDefinition(definition: CustomNodeDefinition): NodeDefinition {
  const normalizedDefinition = normalizeLegacyCustomNodeDefinition(definition);
  const type = customNodeType(normalizedDefinition.definitionId);
  const { inputs, outputs } = portsFor(normalizedDefinition);
  return {
    type,
    label: String(normalizedDefinition.name ?? 'Custom'),
    category: CUSTOM_NODE_CATEGORY,
    inputs,
    outputs,
    // Custom nodes keep instance state in their node config; no schema fields are exposed in Phase 2.5.
    configSchema: [],
    process: createCustomNodeProcess(normalizedDefinition),
  };
}

export function registerCustomNodeDefinition(definition: CustomNodeDefinition): void {
  nodeRegistry.register(definitionToNodeDefinition(definition));
}

export function unregisterCustomNodeDefinition(definitionId: string): void {
  nodeRegistry.unregister(customNodeType(definitionId));
}

export function replaceCustomNodeDefinitions(definitions: CustomNodeDefinition[]): void {
  const prev = get(customNodeDefinitions);
  for (const def of prev) unregisterCustomNodeDefinition(def.definitionId);
  const normalizedDefinitions = definitions.map(normalizeLegacyCustomNodeDefinition);
  for (const def of normalizedDefinitions) registerCustomNodeDefinition(def);
  customNodeDefinitions.set(normalizedDefinitions);
}

export function getCustomNodeDefinition(definitionId: string): CustomNodeDefinition | null {
  const id = String(definitionId ?? '');
  if (!id) return null;
  return get(customNodeDefinitions).find((d) => String(d.definitionId) === id) ?? null;
}

export function addCustomNodeDefinition(definition: CustomNodeDefinition): void {
  const id = String(definition?.definitionId ?? '');
  if (!id) return;
  if (getCustomNodeDefinition(id)) return;
  const normalizedDefinition = normalizeLegacyCustomNodeDefinition(definition);
  registerCustomNodeDefinition(normalizedDefinition);
  customNodeDefinitions.set([...get(customNodeDefinitions), normalizedDefinition]);
}

export function upsertCustomNodeDefinition(definition: CustomNodeDefinition): void {
  const id = String(definition?.definitionId ?? '');
  if (!id) return;

  const prev = get(customNodeDefinitions);
  const idx = prev.findIndex((d) => String(d.definitionId) === id);
  if (idx < 0) {
    const normalizedDefinition = normalizeLegacyCustomNodeDefinition(definition);
    registerCustomNodeDefinition(normalizedDefinition);
    customNodeDefinitions.set([...prev, normalizedDefinition]);
    return;
  }

  unregisterCustomNodeDefinition(id);
  const normalizedDefinition = normalizeLegacyCustomNodeDefinition(definition);
  registerCustomNodeDefinition(normalizedDefinition);
  const next = prev.slice();
  next[idx] = normalizedDefinition;
  customNodeDefinitions.set(next);
}

export function removeCustomNodeDefinition(definitionId: string): void {
  const id = String(definitionId ?? '');
  if (!id) return;
  const prev = get(customNodeDefinitions);
  if (!prev.some((d) => String(d.definitionId) === id)) return;
  unregisterCustomNodeDefinition(id);
  customNodeDefinitions.set(prev.filter((d) => String(d.definitionId) !== id));
}
