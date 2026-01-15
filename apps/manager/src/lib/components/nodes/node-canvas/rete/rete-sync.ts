/**
 * Purpose: Sync the node engine graph into the Rete editor view.
 */
import { ClassicPreset, type BaseSchemes, type NodeEditor } from 'rete';
import type { AreaPlugin } from 'rete-area-plugin';
import type { NodeRegistry } from '@shugu/node-core';
import type { Connection as EngineConnection, GraphState, NodeInstance } from '$lib/nodes/types';
import { CUSTOM_NODE_TYPE_PREFIX } from '$lib/nodes/custom-nodes/store';

type AnyAreaPlugin = AreaPlugin<BaseSchemes, unknown>;
type AnyRecord = Record<string, unknown>;

type GraphSyncOptions = {
  editor: NodeEditor<BaseSchemes> | null;
  areaPlugin: AnyAreaPlugin | null;
  nodeMap: Map<string, ClassicPreset.Node>;
  connectionMap: Map<string, ClassicPreset.Connection<ClassicPreset.Node, ClassicPreset.Node>>;
  nodeRegistry: NodeRegistry;
  socketFor: (type?: string) => ClassicPreset.Socket;
  buildReteNode: (instance: NodeInstance) => ClassicPreset.Node;
  nodeLabel: (node: NodeInstance) => string;
  applyMidiMapRangeConstraints: (
    state: { nodes: NodeInstance[]; connections: EngineConnection[] },
    areaPlugin: AnyAreaPlugin | null,
    nodeMap: Map<string, ClassicPreset.Node>
  ) => Promise<void>;
  setGraphState: (state: GraphState) => void;
  setNodeCount: (count: number) => void;
  getSelectedNodeId: () => string;
  onAfterSync: () => void;
  isSyncingRef: { value: boolean };
};

export type GraphSyncController = {
  schedule: (state: { nodes: NodeInstance[]; connections: EngineConnection[] }) => Promise<void> | null;
};

export function createGraphSync(opts: GraphSyncOptions): GraphSyncController {
  let queuedGraphState: { nodes: NodeInstance[]; connections: EngineConnection[] } | null = null;
  let syncLoop: Promise<void> | null = null;

  const setEquals = (a: Set<string>, b: Set<string>): boolean => {
    if (a.size !== b.size) return false;
    for (const value of a) {
      if (!b.has(value)) return false;
    }
    return true;
  };

  const shouldRebuildCustomNode = (instance: NodeInstance, reteNode: ClassicPreset.Node): boolean => {
    if (!String(instance.type ?? '').startsWith(CUSTOM_NODE_TYPE_PREFIX)) return false;
    const def = opts.nodeRegistry.get(String(instance.type));
    if (!def) return false;
    const expectedInputs = new Set((def.inputs ?? []).map((p) => String(p.id ?? '')));
    const expectedOutputs = new Set((def.outputs ?? []).map((p) => String(p.id ?? '')));
    const actualInputs = new Set(Object.keys(reteNode?.inputs ?? {}));
    const actualOutputs = new Set(Object.keys(reteNode?.outputs ?? {}));
    return !setEquals(expectedInputs, actualInputs) || !setEquals(expectedOutputs, actualOutputs);
  };

  const ensureCmdAggregatorInputs = async (
    instance: NodeInstance,
    reteNode: ClassicPreset.Node,
    connections: EngineConnection[]
  ) => {
    if (!opts.areaPlugin) return;
    if (String(instance.type) !== 'cmd-aggregator') return;

    const def = opts.nodeRegistry.get('cmd-aggregator');
    if (!def) return;

    const maxFromDef = def.inputs.reduce((best, port) => {
      const match = /^in(\d+)$/.exec(String(port.id));
      if (!match) return best;
      const idx = Number(match[1]);
      if (!Number.isFinite(idx) || idx <= 0) return best;
      return Math.max(best, idx);
    }, 0);
    if (maxFromDef <= 0) return;

    const raw = (instance.config as AnyRecord)?.inCount;
    const fromConfig = typeof raw === 'number' ? raw : Number(raw);
    const configCount = Number.isFinite(fromConfig) ? Math.max(1, Math.floor(fromConfig)) : 1;

    let requiredCount = 1;
    for (const c of connections) {
      if (String(c.targetNodeId) !== String(instance.id)) continue;
      const match = /^in(\d+)$/.exec(String(c.targetPortId));
      if (!match) continue;
      const idx = Number(match[1]);
      if (!Number.isFinite(idx) || idx <= 0) continue;
      requiredCount = Math.max(requiredCount, idx);
    }

    const desiredCount = Math.min(maxFromDef, Math.max(configCount, requiredCount));

    let updated = false;
    for (let i = 1; i <= desiredCount; i += 1) {
      const portId = `in${i}`;
      if (reteNode?.inputs?.[portId]) continue;
      const portDef = def.inputs.find((p) => String(p.id) === portId);
      if (!portDef) continue;
      const input = new ClassicPreset.Input(
        opts.socketFor(portDef.type),
        portDef.label ?? portDef.id,
        true
      );
      reteNode.addInput(portId, input);
      updated = true;
    }

    for (const key of Object.keys(reteNode?.inputs ?? {})) {
      const match = /^in(\d+)$/.exec(String(key));
      if (!match) continue;
      const idx = Number(match[1]);
      if (!Number.isFinite(idx) || idx <= 0) continue;
      if (idx <= desiredCount) continue;
      reteNode.removeInput(key);
      updated = true;
    }

    if (updated) await opts.areaPlugin.update('node', reteNode.id);
  };

  const syncGraph = async (state: { nodes: NodeInstance[]; connections: EngineConnection[] }) => {
    if (!opts.editor || !opts.areaPlugin) return;

    opts.isSyncingRef.value = true;
    try {
      opts.setGraphState(state);
      opts.setNodeCount(state.nodes.length);

      const engineNodeIds = new Set(state.nodes.map((n) => n.id));
      const engineConnIds = new Set(state.connections.map((c) => c.id));

      for (const n of state.nodes) {
        let reteNode = opts.nodeMap.get(n.id);
        if (reteNode && shouldRebuildCustomNode(n, reteNode)) {
          try {
            await opts.editor.removeNode(n.id);
          } catch {
            // ignore
          }
          opts.nodeMap.delete(n.id);
          reteNode = null;
        }
        if (!reteNode) {
          const existing = opts.editor.getNode(n.id);
          if (existing) {
            reteNode = existing;
            opts.nodeMap.set(n.id, reteNode);
          } else {
            reteNode = opts.buildReteNode(n);
            await opts.editor.addNode(reteNode);
            opts.nodeMap.set(n.id, reteNode);
            if (n.id === opts.getSelectedNodeId()) {
              reteNode.selected = true;
              await opts.areaPlugin.update('node', n.id);
            }
          }
        } else {
          const nextLabel = opts.nodeLabel(n);
          if (reteNode.label !== nextLabel) {
            reteNode.label = nextLabel;
            await opts.areaPlugin.update('node', reteNode.id);
          }
        }

        await ensureCmdAggregatorInputs(n, reteNode, state.connections);
        await opts.areaPlugin.translate(reteNode.id, { x: n.position.x, y: n.position.y });
      }

      for (const c of state.connections) {
        if (opts.connectionMap.has(c.id)) continue;
        const existing = opts.editor.getConnection(c.id);
        if (existing) {
          opts.connectionMap.set(c.id, existing);
          continue;
        }
        const src = opts.nodeMap.get(c.sourceNodeId);
        const tgt = opts.nodeMap.get(c.targetNodeId);
        if (!src || !tgt) continue;
        const conn = new ClassicPreset.Connection(src, c.sourcePortId, tgt, c.targetPortId);
        conn.id = c.id;
        await opts.editor.addConnection(conn);
        opts.connectionMap.set(c.id, conn);
      }

      for (const conn of opts.editor.getConnections()) {
        const id = String(conn.id);
        if (engineConnIds.has(id)) continue;
        try {
          await opts.editor.removeConnection(id);
        } catch {
          // ignore
        }
        opts.connectionMap.delete(id);
      }

      for (const node of opts.editor.getNodes()) {
        const id = String(node.id);
        if (engineNodeIds.has(id)) continue;
        try {
          await opts.editor.removeNode(id);
        } catch {
          // ignore
        }
        opts.nodeMap.delete(id);
      }

      const connectedInputs = new Set<string>();
      for (const c of state.connections) connectedInputs.add(`${c.targetNodeId}:${c.targetPortId}`);

      for (const n of state.nodes) {
        const reteNode = opts.nodeMap.get(n.id);
        if (!reteNode) continue;
        const def = opts.nodeRegistry.get(n.type);
        let updated = false;
        for (const port of def?.inputs ?? []) {
          const input = reteNode?.inputs?.[port.id];
          const control = input?.control as { readonly?: boolean } | null;
          if (!control) continue;
          const nextReadonly = connectedInputs.has(`${n.id}:${port.id}`);
          if (Boolean(control.readonly) !== nextReadonly) {
            control.readonly = nextReadonly;
            updated = true;
          }
        }
        if (updated) await opts.areaPlugin.update('node', n.id);
      }

      await opts.applyMidiMapRangeConstraints(state, opts.areaPlugin, opts.nodeMap);
    } finally {
      opts.isSyncingRef.value = false;
      opts.onAfterSync();
    }
  };

  const schedule = (state: { nodes: NodeInstance[]; connections: EngineConnection[] }) => {
    queuedGraphState = state;
    if (syncLoop) return syncLoop;
    syncLoop = (async () => {
      while (queuedGraphState) {
        const next = queuedGraphState;
        queuedGraphState = null;
        try {
          await syncGraph(next);
        } catch (err) {
          console.error('[NodeCanvas] syncGraph failed', err);
        }
      }
    })().finally(() => {
      syncLoop = null;
    });
    return syncLoop;
  };

  return { schedule };
}
