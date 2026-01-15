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
import { NodeRuntime } from '@shugu/node-core';
import { CUSTOM_NODE_TYPE_PREFIX, customNodeType } from './custom-node-type';

const buildInternalSignature = (graph: GraphState | null | undefined): string => {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const connections = Array.isArray(graph?.connections) ? graph.connections : [];
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
    });
  } catch {
    return `${nodes.length}:${connections.length}:${Date.now()}`;
  }
};

const createCustomNodeProcess = (definition: CustomNodeDefinition): NodeDefinition['process'] => {
  const runtimeByNodeId = new Map<
    string,
    {
      runtime: NodeRuntime;
      signature: string;
    }
  >();

  const inputPorts = (definition.ports ?? []).filter((p) => String(p?.side ?? '') === 'input');
  const outputPorts = (definition.ports ?? []).filter((p) => String(p?.side ?? '') === 'output');

  return (inputs, config, context) => {
    const state = readCustomNodeState(config ?? {});
    if (!state) return {};

    const gate = inputs?.gate;
    if (gate === false) return {};

    const internal = state.internal ?? { nodes: [], connections: [] };
    const signature = buildInternalSignature(internal);

    const nodeId = String(context?.nodeId ?? '');
    let entry = runtimeByNodeId.get(nodeId);
    if (!entry || entry.signature !== signature) {
      const runtime = new NodeRuntime(nodeRegistry);
      const nodes: NodeInstance[] = (internal.nodes ?? []).map((n) => ({
        ...n,
        id: String(n?.id ?? ''),
        type: String(n?.type ?? ''),
        config: { ...(n?.config ?? {}) },
        inputValues: { ...(n?.inputValues ?? {}) },
        outputValues: {},
      }));
      const connections: Connection[] = (internal.connections ?? []).map((c) => ({
        ...c,
        sourceNodeId: String(c?.sourceNodeId ?? ''),
        sourcePortId: String(c?.sourcePortId ?? ''),
        targetNodeId: String(c?.targetNodeId ?? ''),
        targetPortId: String(c?.targetPortId ?? ''),
      }));
      runtime.loadGraph({ nodes, connections });
      entry = { runtime, signature };
      runtimeByNodeId.set(nodeId, entry);
    }

    const runtime = entry.runtime;
    runtime.clearOverrides();

    for (const port of inputPorts) {
      const portKey = String(port?.portKey ?? '');
      const binding = port?.binding ?? null;
      if (!portKey || !binding?.nodeId || !binding?.portId) continue;
      if (!Object.prototype.hasOwnProperty.call(inputs ?? {}, portKey)) continue;
      runtime.applyOverride(String(binding.nodeId), 'input', String(binding.portId), inputs[portKey]);
    }

    runtime.compileNow();
    runtime.step();

    const outputs: Record<string, unknown> = {};
    for (const port of outputPorts) {
      const portKey = String(port?.portKey ?? '');
      const binding = port?.binding ?? null;
      if (!portKey || !binding?.nodeId || !binding?.portId) continue;
      const node = runtime.getNode(String(binding.nodeId));
      outputs[portKey] = node?.outputValues?.[String(binding.portId)];
    }

    return outputs;
  };
};

export const CUSTOM_NODE_CATEGORY = 'Custom' as const;
export const customNodeDefinitions: Writable<CustomNodeDefinition[]> = writable([]);
export { CUSTOM_NODE_TYPE_PREFIX, customNodeType };

function gatePort(): NodePort {
  return { id: 'gate', label: 'Gate', type: 'boolean', defaultValue: true };
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
  const type = customNodeType(definition.definitionId);
  const { inputs, outputs } = portsFor(definition);
  return {
    type,
    label: String(definition.name ?? 'Custom'),
    category: CUSTOM_NODE_CATEGORY,
    inputs,
    outputs,
    // Custom nodes keep instance state in their node config; no schema fields are exposed in Phase 2.5.
    configSchema: [],
    process: createCustomNodeProcess(definition),
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
  for (const def of definitions) registerCustomNodeDefinition(def);
  customNodeDefinitions.set(definitions);
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
  registerCustomNodeDefinition(definition);
  customNodeDefinitions.set([...get(customNodeDefinitions), definition]);
}

export function upsertCustomNodeDefinition(definition: CustomNodeDefinition): void {
  const id = String(definition?.definitionId ?? '');
  if (!id) return;

  const prev = get(customNodeDefinitions);
  const idx = prev.findIndex((d) => String(d.definitionId) === id);
  if (idx < 0) {
    registerCustomNodeDefinition(definition);
    customNodeDefinitions.set([...prev, definition]);
    return;
  }

  unregisterCustomNodeDefinition(id);
  registerCustomNodeDefinition(definition);
  const next = prev.slice();
  next[idx] = definition;
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
