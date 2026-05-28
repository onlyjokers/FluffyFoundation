/**
 * Purpose: Pure local client-loop detection for manager-side node graphs.
 */
import type { GraphState } from './types';

export type LocalLoop = {
  id: string;
  nodeIds: string[];
  connectionIds: string[];
  requiredCapabilities: string[];
  clientsInvolved: string[];
};

export function shouldComputeWhileOffloaded(type: string): boolean {
  // UI/Debug: keep pure nodes running locally so values can be inspected even when a patch/loop is offloaded.
  // This must stay conservative: do not include nodes with side-effects (commands, parameter writes, etc).
  const t = String(type ?? '');
  if (!t) return false;
  if (t.startsWith('logic-')) return true;
  if (t === 'client-button' || t === 'client-input-box' || t === 'record-sound-button') return true;
  if (t === 'generate-tts-audio' || t === 'speech-to-text') return true;
  if (t === 'gpt-image-gen') return true;
  if (t === 'proc-display-text') return true;
  return false;
}

export function capabilityForNodeType(type: string | undefined): string | null {
  if (!type) return null;
  if (type === 'proc-client-sensors') return 'sensors';
  if (type === 'proc-flashlight') return 'flashlight';
  if (type === 'proc-screen-color') return 'screen';
  if (type === 'proc-synth-update') return 'sound';
  if (type === 'tone-osc') return 'sound';
  if (type === 'audio-data') return 'sound';
  if (type === 'tone-delay') return 'sound';
  if (type === 'tone-resonator') return 'sound';
  if (type === 'tone-pitch') return 'sound';
  if (type === 'tone-reverb') return 'sound';
  if (type === 'tone-granular') return 'sound';
  if (type === 'tone-lfo') return 'sound';
  if (type === 'play-media') return 'sound';
  if (type === 'proc-scene-switch') return 'visual';
  if (type === 'audio-out') return 'sound';
  if (type === 'load-audio-from-assets') return 'sound';
  if (type === 'load-audio-from-local') return 'sound';
  if (type === 'load-image-from-assets') return 'visual';
  if (type === 'load-image-from-local') return 'visual';
  if (type === 'load-video-from-assets') return 'visual';
  if (type === 'load-video-from-local') return 'visual';
  if (type === 'proc-show-image') return 'visual';
  if (type === 'proc-play-video') return 'visual';
  if (type === 'proc-visual-effects') return 'visual';
  if (type === 'scene-out') return 'visual';
  if (type === 'ui-out') return 'visual';
  return null;
}

export function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

export function detectLocalClientLoops(graph: Pick<GraphState, 'nodes' | 'connections'>): LocalLoop[] {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const connections = Array.isArray(graph.connections) ? graph.connections : [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const conn of connections) {
    const outs = adj.get(conn.sourceNodeId) ?? [];
    outs.push(conn.targetNodeId);
    adj.set(conn.sourceNodeId, outs);
  }

  const isClient = (id: string) => nodeById.get(id)?.type === 'client-loader';
  const isClientSensors = (id: string) => nodeById.get(id)?.type === 'proc-client-sensors';

  const indexById = new Map<string, number>();
  const lowById = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  let index = 0;
  const sccs: string[][] = [];

  const strongconnect = (v: string) => {
    indexById.set(v, index);
    lowById.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) ?? []) {
      if (!indexById.has(w)) {
        strongconnect(w);
        lowById.set(v, Math.min(lowById.get(v)!, lowById.get(w)!));
      } else if (onStack.has(w)) {
        lowById.set(v, Math.min(lowById.get(v)!, indexById.get(w)!));
      }
    }

    if (lowById.get(v) === indexById.get(v)) {
      const component: string[] = [];
      while (stack.length > 0) {
        const w = stack.pop()!;
        onStack.delete(w);
        component.push(w);
        if (w === v) break;
      }
      sccs.push(component);
    }
  };

  for (const n of nodes) {
    if (!indexById.has(n.id)) strongconnect(n.id);
  }

  const loops: LocalLoop[] = [];
  for (const component of sccs) {
    if (component.length === 0) continue;
    const nodeSet = new Set(component);

    if (component.length === 1) {
      const only = component[0];
      const hasSelf = connections.some((c) => c.sourceNodeId === only && c.targetNodeId === only);
      if (!hasSelf) continue;
    }

    const clientNodes = component.filter(isClient);
    if (clientNodes.length !== 1) continue;
    const hasSensors = component.some(isClientSensors);
    if (!hasSensors) continue;

    const connIds = connections
      .filter((c) => nodeSet.has(c.sourceNodeId) && nodeSet.has(c.targetNodeId))
      .map((c) => c.id);

    const caps = new Set<string>();
    for (const nid of component) {
      const cap = capabilityForNodeType(nodeById.get(nid)?.type);
      if (cap) caps.add(cap);
    }

    const key = component.slice().sort().join(',');
    const loopId = `loop:${clientNodes[0]}:${hashString(key)}`;

    loops.push({
      id: loopId,
      nodeIds: component.slice(),
      connectionIds: connIds,
      requiredCapabilities: Array.from(caps),
      clientsInvolved: clientNodes,
    });
  }

  loops.sort((a, b) => a.id.localeCompare(b.id));
  return loops;
}
