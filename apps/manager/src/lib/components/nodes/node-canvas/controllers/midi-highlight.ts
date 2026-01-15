/**
 * Purpose: Compute MIDI activity highlight state for node/connection graphs.
 */
import type { Connection, GraphState } from '$lib/nodes/types';
import type { NodeDefinition, NodePort, NodeRegistry } from '@shugu/node-core';

export type MidiHighlightState = {
  nodeIds: Set<string>;
  connectionIds: Set<string>;
  inputPortsByNode: Map<string, Set<string>>;
  outputPortsByNode: Map<string, Set<string>>;
};

export type MidiHighlightOptions = {
  event: { type: string; normalized?: number; isPress?: boolean };
  graph: GraphState;
  disabledNodeIds: Set<string>;
  selectedInputId: string | null;
  sourceNodeTypes: Set<string>;
  traversalStopNodeTypes: Set<string>;
  midiSourceMatchesEvent: (source: unknown, event: unknown, selectedInputId: string | null) => boolean;
  nodeRegistry?: NodeRegistry;
};

type BypassPorts = { inId: string; outId: string };

function inferBypassPorts(def: Pick<NodeDefinition, 'inputs' | 'outputs'>): BypassPorts | null {
  const inputs = Array.isArray(def.inputs) ? def.inputs : [];
  const outputs = Array.isArray(def.outputs) ? def.outputs : [];

  const inPort = inputs.find((p: NodePort) => String(p.id) === 'in') ?? null;
  const outPort = outputs.find((p: NodePort) => String(p.id) === 'out') ?? null;
  if (inPort && outPort && String(inPort.type) === String(outPort.type)) {
    if (inPort.type === 'command' || inPort.type === 'client') return null;
    return { inId: 'in', outId: 'out' };
  }

  if (inputs.length === 1 && outputs.length === 1) {
    const onlyIn = inputs[0];
    const onlyOut = outputs[0];
    if (onlyIn?.id && onlyOut?.id && String(onlyIn.type) === String(onlyOut.type)) {
      if (onlyIn.type === 'command' || onlyIn.type === 'client') return null;
      return { inId: String(onlyIn.id), outId: String(onlyOut.id) };
    }
  }

  const sinkInputs = inputs.filter((p: NodePort) => p.kind === 'sink');
  const sinkOutputs = outputs.filter((p: NodePort) => p.kind === 'sink');
  if (sinkInputs.length === 1 && sinkOutputs.length === 1) {
    const onlyIn = sinkInputs[0];
    const onlyOut = sinkOutputs[0];
    if (onlyIn?.id && onlyOut?.id && String(onlyIn.type) === String(onlyOut.type)) {
      if (onlyIn.type === 'command' || onlyIn.type === 'client') return null;
      return { inId: String(onlyIn.id), outId: String(onlyOut.id) };
    }
  }

  return null;
}

export function computeMidiHighlightState(opts: MidiHighlightOptions): MidiHighlightState | null {
  const {
    event,
    graph,
    disabledNodeIds,
    selectedInputId,
    sourceNodeTypes,
    traversalStopNodeTypes,
    midiSourceMatchesEvent,
    nodeRegistry,
  } = opts;

  const nodeTypeById = new Map((graph.nodes ?? []).map((n) => [String(n.id), String(n.type)]));
  const sourceNodeIds = (graph.nodes ?? [])
    .filter((n) => sourceNodeTypes.has(String(n.type)))
    .filter((n) => midiSourceMatchesEvent((n.config as Record<string, unknown>)?.source, event, selectedInputId))
    .map((n) => String(n.id))
    .filter((id) => !disabledNodeIds.has(id));

  if (sourceNodeIds.length === 0) return null;

  const outsByNode = new Map<string, Connection[]>();
  for (const c of graph.connections ?? []) {
    const src = String(c.sourceNodeId);
    const list = outsByNode.get(src) ?? [];
    list.push(c);
    outsByNode.set(src, list);
  }

  // Disabled nodes usually stop traversal, but if a disabled node is bypass-eligible (same-type in/out),
  // MIDI highlights should "pass through" so the UI reflects the node-as-wire semantics.
  const bypassByNodeId = new Map<string, BypassPorts>();
  if (nodeRegistry) {
    for (const n of graph.nodes ?? []) {
      const nodeId = String(n.id);
      if (!nodeId || !disabledNodeIds.has(nodeId)) continue;
      const def = nodeRegistry.get(String(n.type));
      if (!def) continue;
      const ports = inferBypassPorts(def);
      if (ports) bypassByNodeId.set(nodeId, ports);
    }
  }

  const nextNodeIds = new Set<string>();
  const nextConnIds = new Set<string>();
  const nextInputsByNode = new Map<string, Set<string>>();
  const nextOutputsByNode = new Map<string, Set<string>>();

  const queue: string[] = [];
  let queueIndex = 0;
  const visited = new Set<string>();
  for (const id of sourceNodeIds) {
    nextNodeIds.add(id);
    queue.push(id);
    visited.add(id);
  }

  while (queueIndex < queue.length) {
    const nodeId = queue[queueIndex++]!;
    const bypassPorts = bypassByNodeId.get(nodeId) ?? null;
    for (const conn of outsByNode.get(nodeId) ?? []) {
      const connId = String(conn.id);
      const targetNodeId = String(conn.targetNodeId);
      const sourcePortId = String(conn.sourcePortId);
      const targetPortId = String(conn.targetPortId);
      const targetType = nodeTypeById.get(targetNodeId) ?? '';
      const stopAtTarget = traversalStopNodeTypes.has(targetType);

      if (bypassPorts && sourcePortId !== bypassPorts.outId) continue;

      if (disabledNodeIds.has(targetNodeId)) {
        if (stopAtTarget) continue;

        const targetBypass = bypassByNodeId.get(targetNodeId) ?? null;
        if (!targetBypass) continue;
        if (targetPortId !== targetBypass.inId) continue;
        if (
          (outsByNode.get(targetNodeId) ?? []).every(
            (c) => String(c.sourcePortId) !== String(targetBypass.outId)
          )
        ) {
          continue;
        }

        nextConnIds.add(connId);

        const outSet = nextOutputsByNode.get(nodeId) ?? new Set<string>();
        outSet.add(sourcePortId);
        nextOutputsByNode.set(nodeId, outSet);

        nextNodeIds.add(targetNodeId);

        const inSet = nextInputsByNode.get(targetNodeId) ?? new Set<string>();
        inSet.add(targetPortId);
        nextInputsByNode.set(targetNodeId, inSet);

        const bypassOutSet = nextOutputsByNode.get(targetNodeId) ?? new Set<string>();
        bypassOutSet.add(targetBypass.outId);
        nextOutputsByNode.set(targetNodeId, bypassOutSet);

        if (!visited.has(targetNodeId)) {
          visited.add(targetNodeId);
          queue.push(targetNodeId);
        }

        continue;
      }

      nextConnIds.add(connId);

      const outSet = nextOutputsByNode.get(nodeId) ?? new Set<string>();
      outSet.add(sourcePortId);
      nextOutputsByNode.set(nodeId, outSet);

      if (!stopAtTarget) {
        nextNodeIds.add(targetNodeId);

        const inSet = nextInputsByNode.get(targetNodeId) ?? new Set<string>();
        inSet.add(targetPortId);
        nextInputsByNode.set(targetNodeId, inSet);

        if (!visited.has(targetNodeId)) {
          visited.add(targetNodeId);
          queue.push(targetNodeId);
        }
      }
    }
  }

  return {
    nodeIds: nextNodeIds,
    connectionIds: nextConnIds,
    inputPortsByNode: nextInputsByNode,
    outputPortsByNode: nextOutputsByNode,
  };
}
