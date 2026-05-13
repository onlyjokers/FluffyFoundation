/**
 * Purpose: Pure helper functions shared by patch runtime orchestration.
 */
import type { GraphState, NodeDefinition, NodePort } from '$lib/nodes/types';

export type PatchPayloadLike = {
  graph: Pick<GraphState, 'nodes' | 'connections'>;
};

export function computeTopologySignature(payload: Pick<GraphState, 'nodes' | 'connections'>): string {
  const nodes = (payload.nodes ?? []).map((node) => ({
    id: String(node.id),
    type: String(node.type),
  }));
  nodes.sort((a, b) => a.id.localeCompare(b.id));

  const connections = (payload.connections ?? []).map((conn) => ({
    s: String(conn.sourceNodeId),
    sp: String(conn.sourcePortId),
    t: String(conn.targetNodeId),
    tp: String(conn.targetPortId),
  }));
  connections.sort((a, b) => {
    const sa = `${a.s}:${a.sp}->${a.t}:${a.tp}`;
    const sb = `${b.s}:${b.sp}->${b.t}:${b.tp}`;
    return sa.localeCompare(sb);
  });

  return JSON.stringify({ nodes, connections });
}

export function isDefinitionBypassableWhenDisabled(def: NodeDefinition | undefined): boolean {
  if (!def) return false;

  const inputs: NodePort[] = Array.isArray(def.inputs) ? def.inputs : [];
  const outputs: NodePort[] = Array.isArray(def.outputs) ? def.outputs : [];
  const isSafeType = (type: unknown) => String(type) !== 'command' && String(type) !== 'client';

  const inPort = inputs.find((p) => String(p?.id ?? '') === 'in') ?? null;
  const outPort = outputs.find((p) => String(p?.id ?? '') === 'out') ?? null;
  if (inPort && outPort && String(inPort.type) === String(outPort.type) && isSafeType(inPort.type)) {
    return true;
  }

  if (inputs.length === 1 && outputs.length === 1) {
    const onlyIn = inputs[0];
    const onlyOut = outputs[0];
    if (String(onlyIn?.type ?? '') === String(onlyOut?.type ?? '') && isSafeType(onlyIn?.type)) {
      return true;
    }
  }

  const sinkInputs = inputs.filter((p) => p?.kind === 'sink');
  const sinkOutputs = outputs.filter((p) => p?.kind === 'sink');
  if (sinkInputs.length === 1 && sinkOutputs.length === 1) {
    const onlyIn = sinkInputs[0];
    const onlyOut = sinkOutputs[0];
    if (String(onlyIn?.type ?? '') === String(onlyOut?.type ?? '') && isSafeType(onlyIn?.type)) {
      return true;
    }
  }

  return false;
}

export function applyTimeRangePlayheadsToPatchPayload(
  payload: PatchPayloadLike,
  getTimeRangePlayheadSec: (nodeId: string) => number | null
): void {
  const nodes = payload?.graph?.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) return;

  for (const node of nodes) {
    const type = String(node?.type ?? '');
    if (type !== 'load-audio-from-assets' && type !== 'load-video-from-assets') continue;
    const nodeId = String(node?.id ?? '');
    if (!nodeId) continue;
    const playheadSec = getTimeRangePlayheadSec(nodeId);
    if (playheadSec === null) continue;

    node.inputValues = { ...(node.inputValues ?? {}), cursorSec: playheadSec };
  }
}
