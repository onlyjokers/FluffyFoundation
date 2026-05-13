/**
 * Purpose: Disabled-node pass-through helpers for NodeRuntime.
 */
import type { Connection, NodeDefinition, NodeInstance, NodePort } from './types.js';
import type { NodeRegistry } from './registry.js';

export const inferDisabledBypassPorts = (
  def: Pick<NodeDefinition, 'inputs' | 'outputs'>
): { inId: string; outId: string } | null => {
  const inputs = Array.isArray(def.inputs) ? def.inputs : [];
  const outputs = Array.isArray(def.outputs) ? def.outputs : [];

  const inPort = inputs.find((p: NodePort) => p.id === 'in') ?? null;
  const outPort = outputs.find((p: NodePort) => p.id === 'out') ?? null;
  if (inPort && outPort && inPort.type === outPort.type) {
    if (inPort.type === 'command' || inPort.type === 'client') return null;
    return { inId: 'in', outId: 'out' };
  }

  if (inputs.length === 1 && outputs.length === 1) {
    const onlyIn = inputs[0];
    const onlyOut = outputs[0];
    if (onlyIn?.id && onlyOut?.id && onlyIn.type === onlyOut.type) {
      if (onlyIn.type === 'command' || onlyIn.type === 'client') return null;
      return { inId: onlyIn.id, outId: onlyOut.id };
    }
  }

  const sinkInputs = inputs.filter((p: NodePort) => p.kind === 'sink');
  const sinkOutputs = outputs.filter((p: NodePort) => p.kind === 'sink');
  if (sinkInputs.length === 1 && sinkOutputs.length === 1) {
    const onlyIn = sinkInputs[0];
    const onlyOut = sinkOutputs[0];
    if (onlyIn?.id && onlyOut?.id && onlyIn.type === onlyOut.type) {
      if (onlyIn.type === 'command' || onlyIn.type === 'client') return null;
      return { inId: onlyIn.id, outId: onlyOut.id };
    }
  }

  return null;
};

export const computeDisabledBypassOutputs = (
  node: NodeInstance,
  registry: NodeRegistry,
  nodes: ReadonlyMap<string, NodeInstance>,
  connections: readonly Connection[]
): Record<string, unknown> | null => {
  const def = registry.get(node.type);
  if (!def) return null;
  const ports = inferDisabledBypassPorts(def);
  if (!ports) {
    if (['img-scale', 'img-fit', 'img-xy-offset', 'img-transparency'].includes(node.type)) {
      console.warn(
        `[NodeRuntime] Bypass failed for ${node.type} (${node.id}): inferDisabledBypassPorts returned null`
      );
    }
    return null;
  }

  const incoming = connections.filter(
    (c) => c.targetNodeId === node.id && c.targetPortId === ports.inId
  );
  if (incoming.length === 0) return null;

  const outgoing = connections.filter(
    (c) => c.sourceNodeId === node.id && c.sourcePortId === ports.outId
  );
  // Only treat it as a pass-through "wire" when both sides are connected.
  if (outgoing.length === 0) return null;

  let value: unknown = undefined;
  for (const conn of incoming) {
    const sourceNode = nodes.get(conn.sourceNodeId);
    if (!sourceNode) continue;
    const next = sourceNode.outputValues?.[conn.sourcePortId];
    if (value === undefined) value = next;
    else if (Array.isArray(value)) value.push(next);
    else value = [value, next];
  }

  return { [ports.outId]: value };
};
