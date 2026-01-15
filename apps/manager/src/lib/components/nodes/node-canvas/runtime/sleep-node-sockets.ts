/**
 * Purpose: Keep the `logic-sleep` node output socket type in sync with its wired input.
 */

import type { Connection, GraphState, PortType } from '$lib/nodes/types';

type NodeRegistryLike = {
  get(type: string): { outputs?: { id: string; type?: PortType }[] } | undefined;
};

type AnyAreaPlugin = { update(kind: 'node', nodeId: string): Promise<void> } | null;
type AnyRecord = Record<string, unknown>;

const asRecord = (value: unknown): AnyRecord | null =>
  value && typeof value === 'object' ? (value as AnyRecord) : null;

export type SleepOutputType = { type: PortType; hasInput: boolean };

export interface SleepNodeSocketSync {
  resolveSleepOutputType(nodeId: string): SleepOutputType;
  syncSleepNodeSockets(state: GraphState): Promise<void>;
}

export interface CreateSleepNodeSocketSyncOptions {
  getGraphState: () => GraphState;
  nodeRegistry: NodeRegistryLike;
  sockets: Record<string, unknown>;
  getAreaPlugin: () => AnyAreaPlugin;
  getNodeMap: () => Map<string, AnyRecord>;
}

export function createSleepNodeSocketSync(opts: CreateSleepNodeSocketSyncOptions): SleepNodeSocketSync {
  const { getGraphState, nodeRegistry, sockets, getAreaPlugin, getNodeMap } = opts;

  const getOutputPortType = (nodeId: string, portId: string): PortType => {
    const state = getGraphState();
    const node = (state.nodes ?? []).find((n) => String(n.id) === String(nodeId));
    if (!node) return 'any';
    const def = nodeRegistry.get(String(node.type));
    const port = def?.outputs?.find((p) => p.id === portId);
    return (port?.type ?? 'any') as PortType;
  };

  const resolveSleepOutputType = (nodeId: string): SleepOutputType => {
    const state = getGraphState();
    const conn = (state.connections ?? []).find(
      (c: Connection) => String(c.targetNodeId) === String(nodeId) && String(c.targetPortId) === 'input'
    );
    if (!conn) return { type: 'any', hasInput: false };
    return {
      type: getOutputPortType(String(conn.sourceNodeId), String(conn.sourcePortId)),
      hasInput: true,
    };
  };

  const syncSleepNodeSockets = async (state: GraphState) => {
    const areaPlugin = getAreaPlugin();
    if (!areaPlugin) return;
    const nodes = state.nodes ?? [];
    if (nodes.length === 0) return;

    const nodeMap = getNodeMap();
    for (const node of nodes) {
      if (String(node.type) !== 'logic-sleep') continue;
      const reteNode = nodeMap.get(String(node.id));
      const reteRecord = asRecord(reteNode);
      const outputs = asRecord(reteRecord?.outputs);
      const output = asRecord(outputs?.output);
      if (!reteNode || !output) continue;

      const { type, hasInput } = resolveSleepOutputType(String(node.id));
      const socketMap = sockets as Record<string, unknown>;
      const nextSocket = socketMap[type] ?? socketMap.any;
      const nextDisabled = !hasInput;
      const prevSocket = output.socket;
      const prevDisabled = Boolean(output.disabled);

      if (prevSocket !== nextSocket || prevDisabled !== nextDisabled) {
        output.socket = nextSocket;
        output.disabled = nextDisabled;
        await areaPlugin.update('node', String(node.id));
      }
    }
  };

  return { resolveSleepOutputType, syncSleepNodeSockets };
}
