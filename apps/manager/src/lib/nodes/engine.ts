/**
 * NodeEngine - Headless Singleton for Node Graph Execution (Manager)
 *
 * Wraps @shugu/node-core's NodeRuntime and keeps Manager-only concerns here:
 * - Svelte stores for UI observation
 * - Local loop detection + deployment/offload bookkeeping
 * - Parameter registry modulation cleanup
 */
import { get, writable, type Writable } from 'svelte/store';
import { PROTOCOL_VERSION } from '@shugu/protocol';
import { applyGraphChanges, NodeRuntime } from '@shugu/node-core';

import type { Connection, GraphChange, GraphState, NodeInstance, PortType } from './types';
import { nodeRegistry } from './registry';
import { getSelectOptionsForInput } from './selection-options';
import { parameterRegistry } from '../parameters/registry';
import { exportGraphForPatch } from './patch-export';
import { customNodeDefinitions } from './custom-nodes/store';
import { compileGraphForPatch } from './custom-nodes/flatten';
import { diffGraphState } from './graph-changes';

export type LocalLoop = {
  id: string;
  nodeIds: string[];
  connectionIds: string[];
  requiredCapabilities: string[];
  clientsInvolved: string[]; // list of client-node ids (usually one)
};

const TICK_INTERVAL = 33; // ~30 FPS

function shouldComputeWhileOffloaded(type: string): boolean {
  // UI/Debug: keep pure nodes running locally so values can be inspected even when a patch/loop is offloaded.
  // This must stay conservative: do not include nodes with side-effects (commands, parameter writes, etc).
  const t = String(type ?? '');
  if (!t) return false;
  if (t.startsWith('logic-')) return true;
  return false;
}

function capabilityForNodeType(type: string | undefined): string | null {
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
  if (type === 'image-out') return 'visual';
  if (type === 'video-out') return 'visual';
  if (type === 'effect-out') return 'visual';
  if (type === 'scene-out') return 'visual';
  return null;
}

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

const LEGACY_TONE_FIELDS_BY_TYPE = new Map<string, string[]>([
  ['tone-delay', ['bus', 'order', 'enabled']],
  ['tone-resonator', ['bus', 'order', 'enabled']],
  ['tone-pitch', ['bus', 'order', 'enabled']],
  ['tone-reverb', ['bus', 'order', 'enabled']],
  ['tone-osc', ['bus', 'enabled']],
  ['tone-granular', ['bus', 'enabled']],
  ['tone-lfo', ['enabled']],
  ['load-audio-from-assets', ['bus']],
  ['load-audio-from-local', ['bus']],
]);

function stripLegacyToneFields(
  type: string,
  config: Record<string, unknown>,
  inputValues: Record<string, unknown>
): void {
  const keys = LEGACY_TONE_FIELDS_BY_TYPE.get(String(type ?? ''));
  if (!keys || keys.length === 0) return;
  for (const key of keys) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    if (Object.prototype.hasOwnProperty.call(config, key)) delete config[key];
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    if (Object.prototype.hasOwnProperty.call(inputValues, key)) delete inputValues[key];
  }
}

class NodeEngineClass {
  private runtime: NodeRuntime;

  // Nodes that are offloaded to a client runtime (skip execution on manager)
  private offloadedNodeIds = new Set<string>();
  private offloadedPatchNodeIds = new Set<string>();
  private deployedLoopIds = new Set<string>();
  private disabledNodeIds = new Set<string>();
  // Track UI-only playheads for time-range controls (e.g. asset playback) so patch retargets can resume mid-play.
  private timeRangePlayheadSecByNodeId = new Map<string, number>();

  // Stores for UI observation
  public graphState: Writable<GraphState> = writable({ nodes: [], connections: [] });
  public graphChanges: Writable<GraphChange[]> = writable([]);
  public isRunning: Writable<boolean> = writable(false);
  public lastError: Writable<string | null> = writable(null);
  // Emits on every tick so the UI can render live values without forcing full graphState updates.
  public tickTime: Writable<number> = writable(0);
  public localLoops: Writable<LocalLoop[]> = writable([]);
  public deployedLoops: Writable<string[]> = writable([]);

  constructor() {
    this.runtime = new NodeRuntime(nodeRegistry, {
      tickIntervalMs: TICK_INTERVAL,
      isNodeEnabled: (nodeId) => !this.disabledNodeIds.has(nodeId),
      isComputeEnabled: (nodeId) => {
        if (this.offloadedNodeIds.has(nodeId)) {
          // UI/Debug: allow lightweight timeline simulation for asset playback nodes even when a
          // sensor loop is deployed, so their Finish ports can be observed in manager.
          const type = this.runtime.getNode(nodeId)?.type ?? '';
          if (
            type === 'load-audio-from-assets' ||
            type === 'load-audio-from-local' ||
            type === 'load-video-from-assets' ||
            type === 'load-video-from-local'
          ) {
            return true;
          }
          if (shouldComputeWhileOffloaded(type)) return true;
          return false;
        }
        if (this.offloadedPatchNodeIds.has(nodeId)) {
          // UI/Debug: keep lightweight timeline simulation for asset playback nodes even when the
          // patch is offloaded to the client, so their Finish ports can be observed in manager.
          const type = this.runtime.getNode(nodeId)?.type ?? '';
          if (
            type === 'load-audio-from-assets' ||
            type === 'load-audio-from-local' ||
            type === 'load-video-from-assets' ||
            type === 'load-video-from-local'
          ) {
            return true;
          }
          if (shouldComputeWhileOffloaded(type)) return true;
          return false;
        }
        return true;
      },
      isSinkEnabled: () => true,
      onTick: ({ time }) => {
        this.tickTime.set(time);
      },
      onWatchdog: (info) => {
        const message = info?.message ? String(info.message) : 'watchdog triggered';
        console.warn('[NodeEngine] watchdog triggered:', info?.reason, message, info?.diagnostics);
        this.lastError.set(message);
        this.isRunning.set(false);
      },
    });

    this.syncGraphState();
    this.updateLocalLoops();
  }

  // ========== UI Playheads ==========

  setTimeRangePlayheadSec(nodeId: string, cursorSec: number | null | undefined): void {
    const id = String(nodeId ?? '');
    if (!id) return;
    if (cursorSec === null || cursorSec === undefined) {
      this.timeRangePlayheadSecByNodeId.delete(id);
      return;
    }
    const next = typeof cursorSec === 'number' ? cursorSec : Number(cursorSec);
    if (!Number.isFinite(next) || next < 0) return;
    this.timeRangePlayheadSecByNodeId.set(id, next);
  }

  getTimeRangePlayheadSec(nodeId: string): number | null {
    const id = String(nodeId ?? '');
    if (!id) return null;
    const value = this.timeRangePlayheadSecByNodeId.get(id);
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  // ========== Graph Manipulation ==========

  addNode(node: NodeInstance): void {
    const snapshot = this.runtime.exportGraph();
    const config = { ...(node.config ?? {}) };
    const inputValues = { ...(node.inputValues ?? {}) };
    stripLegacyToneFields(String(node.type), config, inputValues);
    const sanitizedNode: NodeInstance = {
      ...node,
      config,
      inputValues,
      outputValues: { ...(node.outputValues ?? {}) },
    };
    const next = applyGraphChanges(snapshot, [{ type: 'add-node', node: sanitizedNode }]);

    this.runtime.loadGraph(next);
    this.syncGraphState();
    this.emitGraphChanges(snapshot, next);
    this.updateLocalLoops();
  }

  removeNode(nodeId: string): void {
    const snapshot = this.runtime.exportGraph();
    const next = applyGraphChanges(snapshot, [{ type: 'remove-node', nodeId }]);

    this.cleanupGraphTransition(snapshot, next, { reason: 'removeNode' });
    this.runtime.loadGraph(next);
    this.syncGraphState();
    this.emitGraphChanges(snapshot, next);
    this.updateLocalLoops();

    // Clear any modulation offsets contributed by this node
    const sourceId = `node-${nodeId}`;
    parameterRegistry.list().forEach((param) => param.clearModulation?.(sourceId, 'NODE'));
  }

  updateNodeConfig(nodeId: string, config: Record<string, unknown>): void {
    const node = this.runtime.getNode(nodeId);
    if (!node) return;
    const nextConfig = { ...node.config, ...config };
    node.config = nextConfig;
    this.syncGraphState();
    this.graphChanges.set([{ type: 'update-node-config', nodeId, config: nextConfig }]);
  }

  updateNodeType(nodeId: string, type: string): void {
    const nextType = String(type ?? '');
    if (!nextType) return;
    if (!nodeRegistry.get(nextType)) return;

    const node = this.runtime.getNode(nodeId);
    if (!node) return;
    if (String(node.type) === nextType) return;

    node.type = nextType;
    stripLegacyToneFields(nextType, node.config ?? {}, node.inputValues ?? {});
    this.syncGraphState();
    this.graphChanges.set([{ type: 'update-node-type', nodeId, nodeType: nextType }]);
    this.updateLocalLoops();
  }

  updateNodeInputValue(nodeId: string, portId: string, value: unknown): void {
    const node = this.runtime.getNode(nodeId);
    if (!node) return;
    node.inputValues[portId] = value;
    // UI invalidation: graphState holds live references, but Svelte won't react to deep mutations
    // unless some store updates. Use tickTime as a lightweight "pulse" so controls that read
    // live node state can refresh without syncing the whole graph.
    this.tickTime.set(Date.now());
  }

  updateNodePosition(nodeId: string, position: { x: number; y: number }): void {
    const node = this.runtime.getNode(nodeId);
    if (!node) return;
    node.position = position;
    this.graphChanges.set([{ type: 'update-node-position', nodeId, position }]);
    // Don't sync graph state for position-only changes (performance)
  }

  private applySelectionMapOptions(state: GraphState): GraphState {
    const nodes = Array.isArray(state.nodes) ? state.nodes : [];
    const connections = Array.isArray(state.connections) ? state.connections : [];
    const selectionNodes = new Set(
      nodes.filter((node) => node.type === 'midi-select-map').map((node) => String(node.id))
    );

    if (selectionNodes.size === 0 || connections.length === 0) return state;

    const nodeById = new Map(nodes.map((node) => [String(node.id), node]));
    const nextOptionsByNodeId = new Map<string, string[]>();

    for (const c of connections) {
      const sourceId = String(c.sourceNodeId);
      if (!selectionNodes.has(sourceId)) continue;
      const target = nodeById.get(String(c.targetNodeId));
      if (!target) continue;
      const options = getSelectOptionsForInput(target.type, String(c.targetPortId)) ?? [];
      nextOptionsByNodeId.set(sourceId, options);
    }

    if (nextOptionsByNodeId.size === 0) return state;

    const optionsEqual = (a: string[], b: string[]) =>
      a.length === b.length && a.every((value, idx) => value === b[idx]);

    let changed = false;
    const nextNodes = nodes.map((node) => {
      const nextOptions = nextOptionsByNodeId.get(String(node.id));
      if (!nextOptions) return node;
      const configRecord =
        node.config && typeof node.config === 'object' ? (node.config as Record<string, unknown>) : null;
      const raw = Array.isArray(configRecord?.options) ? configRecord.options : [];
      const currentOptions = raw.map((value) => String(value)).filter((value) => value !== '');
      if (optionsEqual(currentOptions, nextOptions)) return node;
      changed = true;
      return {
        ...node,
        config: { ...(node.config ?? {}), options: nextOptions },
      };
    });

    return changed ? { ...state, nodes: nextNodes } : state;
  }

  private countSinkConnectionsByNodeId(
    state: Pick<GraphState, 'nodes' | 'connections'>
  ): Map<string, number> {
    const nodes = Array.isArray(state.nodes) ? state.nodes : [];
    const connections = Array.isArray(state.connections) ? state.connections : [];

    const nodeById = new Map(nodes.map((node) => [String(node.id), node]));
    const counts = new Map<string, number>();
    for (const node of nodes) counts.set(String(node.id), 0);

    for (const conn of connections) {
      const targetId = String(conn.targetNodeId ?? '');
      if (!targetId) continue;

      const targetNode = nodeById.get(targetId);
      if (!targetNode) continue;

      const def = nodeRegistry.get(String(targetNode.type));
      if (!def) continue;

      const targetPortId = String(conn.targetPortId ?? '');
      const port = def.inputs?.find((p) => String(p.id) === targetPortId);
      if (!port || port.kind !== 'sink') continue;

      counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
    }

    return counts;
  }

  private runOnDisableForNodeIds(nodeIds: string[], opts?: { reason?: string }): void {
    const now = Date.now();
    for (const nodeId of nodeIds) {
      const node = this.runtime.getNode(nodeId);
      if (!node) continue;

      const def = nodeRegistry.get(node.type);
      if (!def?.onDisable) continue;

      const computedInputs = this.runtime.getLastComputedInputs(nodeId) ?? null;
      const fullInputs: Record<string, unknown> = {};
      for (const port of def.inputs) {
        if (port.kind === 'sink') {
          fullInputs[port.id] = node.inputValues?.[port.id];
          continue;
        }
        if (computedInputs && Object.prototype.hasOwnProperty.call(computedInputs, port.id)) {
          fullInputs[port.id] = computedInputs[port.id];
        } else {
          fullInputs[port.id] = node.inputValues?.[port.id] ?? port.defaultValue;
        }
      }

      try {
        def.onDisable(fullInputs, node.config ?? {}, { nodeId, time: now, deltaTime: 0 });
      } catch (err) {
        const reason = opts?.reason ? ` (${opts.reason})` : '';
        console.error(`[NodeEngine] onDisable error in ${node.type} (${node.id})${reason}`, err);
      }
    }
  }

  private cleanupGraphTransition(
    prev: GraphState,
    next: GraphState,
    opts?: { reason?: string }
  ): void {
    const prevNodes = Array.isArray(prev.nodes) ? prev.nodes : [];
    const nextNodes = Array.isArray(next.nodes) ? next.nodes : [];
    const prevNodeIds = new Set(prevNodes.map((node) => String(node.id)));
    const nextNodeIds = new Set(nextNodes.map((node) => String(node.id)));

    const prevSinkCounts = this.countSinkConnectionsByNodeId(prev);
    const nextSinkCounts = this.countSinkConnectionsByNodeId(next);

    const toDisable = new Set<string>();

    // Nodes removed from the graph should clean up any long-lived effects.
    for (const id of prevNodeIds) {
      if (nextNodeIds.has(id)) continue;
      toDisable.add(id);
    }

    // Nodes that lose all sink connections should clean up (pipeline semantics).
    for (const [id, count] of prevSinkCounts) {
      if (count <= 0) continue;
      const nextCount = nextSinkCounts.get(id) ?? 0;
      if (nextCount <= 0) toDisable.add(id);
    }

    if (toDisable.size === 0) return;
    this.runOnDisableForNodeIds(Array.from(toDisable), opts);
  }

  addConnection(connection: Connection): boolean {
    const snapshot = this.runtime.exportGraph();

    const inputAlreadyConnected = snapshot.connections.some(
      (c) =>
        c.targetNodeId === connection.targetNodeId && c.targetPortId === connection.targetPortId
    );
    if (inputAlreadyConnected) {
      this.lastError.set('The "in port" is connected up to once');
      return false;
    }

    // Type guard: ensure port types are compatible
    const sourceNode = snapshot.nodes.find((n) => n.id === connection.sourceNodeId);
    const targetNode = snapshot.nodes.find((n) => n.id === connection.targetNodeId);
    if (!sourceNode || !targetNode) return false;

    if (sourceNode.type === 'group-proxy' && connection.sourcePortId === 'out') {
      const sourceConfig =
        sourceNode.config && typeof sourceNode.config === 'object'
          ? (sourceNode.config as Record<string, unknown>)
          : null;
      const direction = String(sourceConfig?.direction ?? 'output');
      if (direction === 'output') {
        const alreadyConnected = snapshot.connections.some(
          (c) => c.sourceNodeId === connection.sourceNodeId && c.sourcePortId === connection.sourcePortId
        );
        if (alreadyConnected) {
          this.lastError.set('Group proxy output can only be connected once');
          return false;
        }
      }
    }

    const sourceDef = nodeRegistry.get(sourceNode.type);
    const targetDef = nodeRegistry.get(targetNode.type);
    const sourcePort = sourceDef?.outputs.find((p) => p.id === connection.sourcePortId);
    const targetPort = targetDef?.inputs.find((p) => p.id === connection.targetPortId);

    if (!sourcePort || !targetPort) return false;

    const resolveProxyPortType = (node: NodeInstance): PortType => {
      const configRecord =
        node.config && typeof node.config === 'object' ? (node.config as Record<string, unknown>) : null;
      const raw = configRecord?.portType;
      const t = typeof raw === 'string' ? raw : raw ? String(raw) : '';
      if (
        [
          'number',
          'boolean',
          'string',
          'asset',
          'color',
          'audio',
          'image',
          'video',
          'scene',
          'effect',
          'client',
          'command',
          'fuzzy',
          'array',
          'any',
        ].includes(t)
      ) {
        return t as PortType;
      }
      return 'any';
    };

    let sourceType = (sourcePort.type ?? 'any') as PortType;
    let targetType = (targetPort.type ?? 'any') as PortType;

    if (sourceNode.type === 'group-proxy') sourceType = resolveProxyPortType(sourceNode);
    if (targetNode.type === 'group-proxy') targetType = resolveProxyPortType(targetNode);

    // Sleep output adopts its input type and is inactive until the input is connected.
    if (sourceNode.type === 'logic-sleep' && sourcePort.id === 'output') {
      const inputConn = snapshot.connections.find(
        (c) => c.targetNodeId === sourceNode.id && c.targetPortId === 'input'
      );
      if (!inputConn) {
        this.lastError.set('Sleep output requires a connected input.');
        return false;
      }
      const inputSourceNode = snapshot.nodes.find((n) => n.id === inputConn.sourceNodeId);
      const inputSourceDef = inputSourceNode ? nodeRegistry.get(inputSourceNode.type) : null;
      const inputSourcePort = inputSourceDef?.outputs.find((p) => p.id === inputConn.sourcePortId);
      sourceType = (inputSourcePort?.type ?? 'any') as PortType;
    }
    const typeMismatch = sourceType !== 'any' && targetType !== 'any' && sourceType !== targetType;

    // Audio ports are never compatible with "any" to prevent accidental numeric/string links.
    // This matches the plan's intent: audio wires only connect to audio wires.
    const audioMismatch =
      sourceType === 'audio' || targetType === 'audio'
        ? sourceType !== 'audio' || targetType !== 'audio'
        : false;
    const imageMismatch =
      sourceType === 'image' || targetType === 'image'
        ? sourceType !== 'image' || targetType !== 'image'
        : false;
    const videoMismatch =
      sourceType === 'video' || targetType === 'video'
        ? sourceType !== 'video' || targetType !== 'video'
        : false;
    const assetMismatch =
      sourceType === 'asset' || targetType === 'asset'
        ? sourceType !== 'asset' || targetType !== 'asset'
        : false;
    if (typeMismatch) {
      this.lastError.set(
        `Type mismatch: ${sourceType} -> ${targetType} (${sourceNode.id}:${sourcePort.id} → ${targetNode.id}:${targetPort.id})`
      );
      return false;
    }
    if (audioMismatch) {
      this.lastError.set(
        `Type mismatch: audio connections must be audio -> audio (${sourceNode.id}:${sourcePort.id} → ${targetNode.id}:${targetPort.id})`
      );
      return false;
    }
    if (imageMismatch) {
      this.lastError.set(
        `Type mismatch: image connections must be image -> image (${sourceNode.id}:${sourcePort.id} → ${targetNode.id}:${targetPort.id})`
      );
      return false;
    }
    if (videoMismatch) {
      this.lastError.set(
        `Type mismatch: video connections must be video -> video (${sourceNode.id}:${sourcePort.id} → ${targetNode.id}:${targetPort.id})`
      );
      return false;
    }
    if (assetMismatch) {
      this.lastError.set(
        `Type mismatch: asset connections must be asset -> asset (${sourceNode.id}:${sourcePort.id} → ${targetNode.id}:${targetPort.id})`
      );
      return false;
    }

    const next = this.applySelectionMapOptions(
      applyGraphChanges(snapshot, [{ type: 'add-connection', connection }])
    );

    const localOnlyNodeTypes = new Set([
      'load-audio-from-local',
      'load-image-from-local',
      'load-video-from-local',
    ]);

    const validateLocalOnlyPatchRouting = (): string | null => {
      const nodes = Array.isArray(next.nodes) ? next.nodes : [];
      const connections = Array.isArray(next.connections) ? next.connections : [];

      const nodeById = new Map(nodes.map((n) => [String(n.id), n]));
      const typeById = new Map(nodes.map((n) => [String(n.id), String(n.type)]));

      const patchRoots = nodes.filter((n) =>
        ['audio-out', 'image-out', 'video-out', 'effect-out', 'scene-out'].includes(String(n.type))
      );
      if (patchRoots.length === 0) return null;

      const incomingByTarget = new Map<string, { sourceNodeId: string; targetPortId: string }[]>();
      const outgoingBySourceKey = new Map<
        string,
        { targetNodeId: string; targetPortId: string }[]
      >();
      for (const c of connections) {
        const targetNodeId = String(c.targetNodeId);
        const sourceNodeId = String(c.sourceNodeId);
        const targetPortId = String(c.targetPortId);
        const sourcePortId = String(c.sourcePortId);

        const incoming = incomingByTarget.get(targetNodeId) ?? [];
        incoming.push({ sourceNodeId, targetPortId });
        incomingByTarget.set(targetNodeId, incoming);

        const sourceKey = `${sourceNodeId}:${sourcePortId}`;
        const outgoing = outgoingBySourceKey.get(sourceKey) ?? [];
        outgoing.push({ targetNodeId, targetPortId });
        outgoingBySourceKey.set(sourceKey, outgoing);
      }

      const shouldTraverseComputeDependency = (
        targetNodeId: string,
        targetPortId: string
      ): boolean => {
        const node = nodeById.get(String(targetNodeId));
        if (!node) return true;
        const def = nodeRegistry.get(String(node.type));
        const port = def?.inputs?.find((p) => String(p.id) === String(targetPortId));
        const portType = (port?.type ?? 'any') as PortType;
        if (portType === 'client' || portType === 'command') return false;
        return true;
      };

      const rootContainsLocalOnlyNodes = (rootNodeId: string): boolean => {
        const keep = new Set<string>();
        const visit = (nodeId: string) => {
          const id = String(nodeId);
          if (!id || keep.has(id)) return;
          const node = nodeById.get(id);
          if (!node) return;
          keep.add(id);
          const incoming = incomingByTarget.get(id) ?? [];
          for (const inc of incoming) {
            if (!shouldTraverseComputeDependency(id, inc.targetPortId)) continue;
            visit(inc.sourceNodeId);
          }
        };
        visit(rootNodeId);
        for (const id of keep) {
          const type = String(typeById.get(id) ?? '');
          if (localOnlyNodeTypes.has(type)) return true;
        }
        return false;
      };

      const getCommandOutputPorts = (type: string): string[] => {
        const def = nodeRegistry.get(String(type));
        return (def?.outputs ?? [])
          .filter((p) => String(p.type) === 'command')
          .map((p) => String(p.id));
      };

      const isCommandInputPort = (type: string, portId: string): boolean => {
        const def = nodeRegistry.get(String(type));
        const port = (def?.inputs ?? []).find((p) => String(p.id) === String(portId));
        return Boolean(port) && String(port?.type) === 'command';
      };

      const rootRoutesToClientObject = (rootNodeId: string): boolean => {
        const rootType = String(typeById.get(rootNodeId) ?? '');
        if (!rootType) return false;

        const queue: { nodeId: string; portId: string }[] = getCommandOutputPorts(rootType).map(
          (portId) => ({ nodeId: rootNodeId, portId })
        );
        const visited = new Set<string>();

        while (queue.length > 0) {
          const nextHop = queue.shift()!;
          const key = `${nextHop.nodeId}:${nextHop.portId}`;
          if (visited.has(key)) continue;
          visited.add(key);

          const outgoing = outgoingBySourceKey.get(key) ?? [];
          for (const c of outgoing) {
            const targetNodeId = String(c.targetNodeId);
            if (!targetNodeId) continue;
            const targetPortId = String(c.targetPortId);
            const targetType = String(typeById.get(targetNodeId) ?? '');
            if (!targetType) continue;
            if (!isCommandInputPort(targetType, targetPortId)) continue;

            if (targetType === 'client-object') return true;
            if (targetType === 'display-object') continue;

            const outPorts = getCommandOutputPorts(targetType);
            for (const outPortId of outPorts)
              queue.push({ nodeId: targetNodeId, portId: outPortId });
          }
        }

        return false;
      };

      for (const root of patchRoots) {
        const rootId = String(root.id);
        if (!rootId) continue;
        if (!rootContainsLocalOnlyNodes(rootId)) continue;
        if (rootRoutesToClientObject(rootId)) {
          return 'Load * From Local(Display only) can only connect Deploy to Display (not Client).';
        }
      }

      return null;
    };

    const localOnlyError = validateLocalOnlyPatchRouting();
    if (localOnlyError) {
      this.lastError.set(localOnlyError);
      return false;
    }

    // Validate cycles without mutating the live runtime first.
    try {
      const validator = new NodeRuntime(nodeRegistry);
      validator.loadGraph(next);
      validator.compileNow();
    } catch (err) {
      this.lastError.set(err instanceof Error ? err.message : 'Connection failed');
      return false;
    }

    this.runtime.loadGraph(next);
    this.runtime.compileNow();
    this.lastError.set(null);
    this.syncGraphState();
    this.emitGraphChanges(snapshot, next);
    this.updateLocalLoops();
    return true;
  }

  removeConnection(connectionId: string): void {
    const snapshot = this.runtime.exportGraph();
    const next = this.applySelectionMapOptions(
      applyGraphChanges(snapshot, [{ type: 'remove-connection', connectionId }])
    );

    this.cleanupGraphTransition(snapshot, next, { reason: 'removeConnection' });
    this.runtime.loadGraph(next);
    this.syncGraphState();
    this.emitGraphChanges(snapshot, next);
    this.updateLocalLoops();
  }

  getNode(nodeId: string): NodeInstance | undefined {
    return this.runtime.getNode(nodeId);
  }

  getLastComputedInputs(nodeId: string): Record<string, unknown> | null {
    const id = String(nodeId ?? '');
    if (!id) return null;
    return this.runtime.getLastComputedInputs(id);
  }

  // ========== Lifecycle ==========

  start(): void {
    this.runtime.setTickIntervalMs(TICK_INTERVAL);
    this.runtime.start();
    this.isRunning.set(true);
    console.log('[NodeEngine] Started');
  }

  stop(): void {
    this.runtime.stop();
    this.isRunning.set(false);
    console.log('[NodeEngine] Stopped');
  }

  clear(): void {
    this.stop();
    const prev = this.runtime.exportGraph();
    this.runtime.clear();
    this.offloadedNodeIds.clear();
    this.offloadedPatchNodeIds.clear();
    this.deployedLoopIds.clear();
    this.disabledNodeIds.clear();
    this.syncGraphState();
    this.emitGraphChanges(prev, this.runtime.exportGraph());
    this.updateLocalLoops();

    // Reset all node-origin modulation
    parameterRegistry.list().forEach((param) => param.clearModulation?.(undefined, 'NODE'));
  }

  // ========== Serialization ==========

  private syncGraphState(): void {
    this.graphState.set(this.runtime.getGraphRef());
  }

  private emitGraphChanges(prev: GraphState, next: GraphState): void {
    const changes = diffGraphState(prev, next);
    if (changes.length > 0) this.graphChanges.set(changes);
  }

  loadGraph(state: GraphState): void {
    const prev = this.runtime.exportGraph();
    const rawNodes = Array.isArray(state.nodes) ? state.nodes : [];
    const rawConnections = Array.isArray(state.connections) ? state.connections : [];

    // Defensive loading: skip unknown node types so older graphs (or plugins removed from manager)
    // don't brick the whole canvas.
    const keptNodeIds = new Set<string>();
    const nodes: GraphState['nodes'] = [];
    for (const node of rawNodes) {
      const id = String(node.id ?? '');
      const type = String(node.type ?? '');
      if (!id || !type) continue;
      if (!nodeRegistry.get(type)) continue;
      keptNodeIds.add(id);
      const config = { ...(node.config ?? {}) };
      const inputValues = { ...(node.inputValues ?? {}) };
      stripLegacyToneFields(type, config, inputValues);
      nodes.push({
        ...node,
        config,
        inputValues,
        outputValues: {}, // reset runtime outputs
      });
    }

    // Enforce node system rule: every input port accepts at most one connection.
    // If a loaded graph violates this (older files), keep the first connection deterministically.
    const connections: GraphState['connections'] = [];
    const connectedInputs = new Set<string>();
    for (const c of rawConnections) {
      const src = String(c.sourceNodeId ?? '');
      const dst = String(c.targetNodeId ?? '');
      if (!src || !dst) continue;
      if (!keptNodeIds.has(src) || !keptNodeIds.has(dst)) continue;
      const key = `${String(c.targetNodeId)}:${String(c.targetPortId)}`;
      if (connectedInputs.has(key)) continue;
      connectedInputs.add(key);
      connections.push({ ...c });
    }

    const cmdAggMax = (() => {
      const def = nodeRegistry.get('cmd-aggregator');
      if (!def) return 0;
      return def.inputs.reduce((best, port) => {
        const match = /^in(\d+)$/.exec(String(port.id));
        if (!match) return best;
        const idx = Number(match[1]);
        if (!Number.isFinite(idx) || idx <= 0) return best;
        return Math.max(best, idx);
      }, 0);
    })();

    if (cmdAggMax > 0) {
      const maxConnectedInputIndexFor = (nodeId: string): number => {
        let max = 0;
        for (const c of connections) {
          if (String(c.targetNodeId) !== nodeId) continue;
          const match = /^in(\d+)$/.exec(String(c.targetPortId));
          if (!match) continue;
          const idx = Number(match[1]);
          if (!Number.isFinite(idx) || idx <= 0) continue;
          max = Math.max(max, idx);
        }
        return max;
      };

      for (const node of nodes) {
        if (String(node.type) !== 'cmd-aggregator') continue;
        const configRecord =
          node.config && typeof node.config === 'object' ? (node.config as Record<string, unknown>) : null;
        const raw = configRecord?.inCount;
        const configured = typeof raw === 'number' ? raw : Number(raw);
        const configuredCount = Number.isFinite(configured)
          ? Math.max(1, Math.floor(configured))
          : 1;
        const required = maxConnectedInputIndexFor(String(node.id));
        const next = Math.min(cmdAggMax, Math.max(configuredCount, required, 1));
        if (next !== configuredCount) {
          node.config = { ...(node.config ?? {}), inCount: next };
        }
      }
    }

    const sanitized: GraphState = { nodes, connections };

    const prepared = this.applySelectionMapOptions(sanitized);
    this.cleanupGraphTransition(prev, prepared, { reason: 'loadGraph' });
    this.runtime.loadGraph(prepared);
    this.offloadedNodeIds.clear();
    this.offloadedPatchNodeIds.clear();
    this.deployedLoopIds.clear();
    this.disabledNodeIds.clear();
    this.syncGraphState();
    this.emitGraphChanges(prev, prepared);
    this.updateLocalLoops();

    // Existing node modulations may no longer apply to new graph; clear them
    parameterRegistry.list().forEach((param) => param.clearModulation?.(undefined, 'NODE'));
  }

  exportGraph(): GraphState {
    return get(this.graphState);
  }

  // ========== Group / Disable Nodes ==========

  setNodesDisabled(nodeIds: string[], disabled: boolean): void {
    const ids = Array.isArray(nodeIds) ? nodeIds : [];
    for (const id of ids) {
      if (!id) continue;
      if (disabled) this.disabledNodeIds.add(id);
      else this.disabledNodeIds.delete(id);
    }
  }

  clearDisabledNodes(): void {
    this.disabledNodeIds.clear();
  }

  getDisabledNodeIds(): string[] {
    return Array.from(this.disabledNodeIds);
  }

  // ========== Local Loop Detection / Export ==========

  private updateLocalLoops(): void {
    try {
      const loops = this.detectLocalClientLoops();
      this.localLoops.set(loops);

      // If a loop vanished, clear its offload flags.
      const ids = new Set(loops.map((l) => l.id));
      for (const deployedId of Array.from(this.deployedLoopIds)) {
        if (!ids.has(deployedId)) {
          this.deployedLoopIds.delete(deployedId);
        }
      }

      // Rebuild offloaded nodes set from deployed loops.
      this.offloadedNodeIds.clear();
      for (const loop of loops) {
        if (!this.deployedLoopIds.has(loop.id)) continue;
        for (const nid of loop.nodeIds) this.offloadedNodeIds.add(nid);
      }
      this.deployedLoops.set(Array.from(this.deployedLoopIds));
    } catch (err) {
      console.warn('[NodeEngine] detectLocalClientLoops failed:', err);
      this.localLoops.set([]);
      this.offloadedNodeIds.clear();
      this.deployedLoopIds.clear();
      this.deployedLoops.set([]);
    }
  }

  private detectLocalClientLoops(): LocalLoop[] {
    const { nodes, connections } = this.runtime.getGraphRef();
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    const adj = new Map<string, string[]>();
    for (const n of nodes) adj.set(n.id, []);
    for (const conn of connections) {
      const outs = adj.get(conn.sourceNodeId) ?? [];
      outs.push(conn.targetNodeId);
      adj.set(conn.sourceNodeId, outs);
    }

    const isClient = (id: string) => nodeById.get(id)?.type === 'client-object';
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

      // Single node SCC must have a self-loop to be a cycle.
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

    // Stable ordering for UI.
    loops.sort((a, b) => a.id.localeCompare(b.id));
    return loops;
  }

  /**
   * Mark a detected loop as deployed (manager will stop executing that subgraph).
   */
  markLoopDeployed(loopId: string, deployed: boolean): void {
    if (deployed) this.deployedLoopIds.add(loopId);
    else this.deployedLoopIds.delete(loopId);
    this.updateLocalLoops();
  }

  /**
   * Sync patch offload nodeIds (manager will stop executing these nodes locally while the patch is deployed).
   */
  setPatchOffloadedNodeIds(nodeIds: string[]): void {
    this.offloadedPatchNodeIds = new Set((nodeIds ?? []).map((id) => String(id)).filter(Boolean));
  }

  /**
   * Export a minimal loop subgraph for client-side execution.
   * Throws if the loop contains node types outside the client whitelist.
   */
  exportGraphForLoop(loopId: string): {
    graph: Pick<GraphState, 'nodes' | 'connections'>;
    meta: {
      loopId: string;
      requiredCapabilities: string[];
      tickIntervalMs: number;
      protocolVersion: typeof PROTOCOL_VERSION;
      executorVersion: string;
    };
  } {
    const loop = get(this.localLoops).find((l) => l.id === loopId);
    if (!loop) throw new Error(`Loop not found: ${loopId}`);

    const allowedNodeTypes = new Set([
      'client-object',
      'proc-client-sensors',
      'math',
      // Gates
      'logic-not',
      'logic-and',
      'logic-or',
      'logic-nand',
      'logic-nor',
      'logic-xor',
      'tone-lfo',
      'number',
      'string',
      'bool',
      'number-stabilizer',
      'proc-flashlight',
      'proc-screen-color',
      'proc-synth-update',
      'proc-scene-switch',
      'tone-osc',
      'tone-delay',
      'tone-resonator',
      'tone-pitch',
      'tone-reverb',
      'tone-granular',
      'play-media',
    ]);

    const nodes: GraphState['nodes'] = [];
    for (const id of loop.nodeIds) {
      const node = this.runtime.getNode(id);
      if (!node) continue;
      if (!allowedNodeTypes.has(node.type)) {
        throw new Error(`Loop contains non-deployable node type: ${node.type}`);
      }
      nodes.push({
        id: node.id,
        type: node.type,
        position: node.position,
        config: { ...(node.config ?? {}) },
        inputValues: { ...(node.inputValues ?? {}) },
        outputValues: {}, // stripped
      });
    }

    const nodeSet = new Set(nodes.map((n) => n.id));
    const { connections } = this.runtime.getGraphRef();
    const loopConnections = connections.filter(
      (c) => nodeSet.has(c.sourceNodeId) && nodeSet.has(c.targetNodeId)
    );

    return {
      graph: { nodes, connections: loopConnections },
      meta: {
        loopId,
        requiredCapabilities: loop.requiredCapabilities,
        tickIntervalMs: TICK_INTERVAL,
        protocolVersion: PROTOCOL_VERSION,
        executorVersion: 'node-executor-v1',
      },
    };
  }

  /**
   * Export a deployable patch subgraph rooted at one or more output sink nodes
   * (`audio-out` / `image-out` / `video-out`) for client-side execution.
   * Throws if the patch contains node types outside the client whitelist.
   */
  exportGraphForPatchFromRootNodeIds(rootNodeIds: string[]): {
    graph: Pick<GraphState, 'nodes' | 'connections'>;
    meta: {
      loopId: string;
      requiredCapabilities: string[];
      tickIntervalMs: number;
      protocolVersion: typeof PROTOCOL_VERSION;
      executorVersion: string;
    };
    assetRefs: string[];
  } {
    const snapshot = compileGraphForPatch(this.runtime.exportGraph(), get(customNodeDefinitions) ?? []);
    const ids = Array.from(new Set((rootNodeIds ?? []).map(String).filter(Boolean))).sort();
    if (ids.length === 0) throw new Error('No patch root ids provided.');

    const patchRootTypes = new Set(['audio-out', 'image-out', 'video-out', 'effect-out', 'scene-out']);
    const nodeById = new Map((snapshot.nodes ?? []).map((n) => [String(n.id), n]));
    const roots = ids.map((id) => {
      const node = nodeById.get(String(id)) ?? null;
      if (!node) throw new Error(`Invalid patch root id: ${String(id)}`);
      const type = String(node.type ?? '');
      if (!patchRootTypes.has(type)) {
        throw new Error(`Invalid patch root type: ${type}:${String(node.id ?? id)}`);
      }
      return node;
    });

    const patch = exportGraphForPatch(snapshot, {
      rootNodeIds: ids,
      nodeRegistry,
      isNodeEnabled: (nodeId) => !this.disabledNodeIds.has(String(nodeId)),
    });

    const allowedNodeTypes = new Set([
      // Pure + scheduling
      'math',
      'logic-add',
      'logic-multiple',
      'logic-subtract',
      'logic-divide',
      // Gates
      'logic-not',
      'logic-and',
      'logic-or',
      'logic-nand',
      'logic-nor',
      'logic-xor',
      'logic-if',
      'logic-for',
      'logic-sleep',
      'tone-lfo',
      'number',
      'string',
      'bool',
      'number-stabilizer',
      // Audio sources/effects
      'load-audio-from-assets',
      'load-audio-from-local',
      'load-image-from-assets',
      'load-image-from-local',
      'load-video-from-assets',
      'load-video-from-local',
      // Image modulation nodes
      'img-scale',
      'img-fit',
      'img-xy-offset',
      'img-transparency',
      // Visual effects chain
      'effect-ascii',
      'effect-convolution',
      // Visual scenes chain
      'scene-box',
      'scene-mel',
      'scene-front-camera',
      'scene-back-camera',
      'tone-osc',
      'tone-delay',
      'tone-resonator',
      'tone-pitch',
      'tone-reverb',
      'tone-granular',
      'play-media',
      // Generators
      'number-script',
      // Patch root
      'audio-out',
      'image-out',
      'video-out',
      'effect-out',
      'scene-out',
    ]);

    for (const n of patch.graph.nodes) {
      const type = String(n.type);
      if (!allowedNodeTypes.has(type)) {
        const hint =
          type === 'client-object'
            ? 'Client is manager-only; screenshots/images must be routed via commands (e.g. Client.Image Out → Show Image → Display), not deployed as a patch.'
            : '';
        throw new Error(
          hint
            ? `Patch contains non-deployable node type: ${type}. ${hint}`
            : `Patch contains non-deployable node type: ${type}`
        );
      }
    }

    const caps = new Set<string>();
    for (const n of patch.graph.nodes) {
      const cap = capabilityForNodeType(String(n.type));
      if (cap) caps.add(cap);
    }

    const nodeKey = patch.graph.nodes
      .map((n) => String(n.id))
      .sort()
      .join(',');
    const rootList = roots
      .map((n) => `${String(n.type)}:${String(n.id)}`)
      .sort()
      .join(', ');
    const patchId =
      roots.length === 1
        ? `patch:${String(roots[0]?.type)}:${String(roots[0]?.id)}:${hashString(nodeKey)}`
        : `patch:multi:${hashString(rootList)}:${hashString(nodeKey)}`;

    return {
      graph: patch.graph,
      meta: {
        loopId: patchId,
        requiredCapabilities: Array.from(caps),
        tickIntervalMs: TICK_INTERVAL,
        protocolVersion: PROTOCOL_VERSION,
        executorVersion: 'node-executor-v1',
      },
      assetRefs: patch.assetRefs,
    };
  }

  exportGraphForPatch(): {
    graph: Pick<GraphState, 'nodes' | 'connections'>;
    meta: {
      loopId: string;
      requiredCapabilities: string[];
      tickIntervalMs: number;
      protocolVersion: typeof PROTOCOL_VERSION;
      executorVersion: string;
    };
    assetRefs: string[];
  } {
    const snapshot = this.runtime.exportGraph();
    const patchRootTypes = ['audio-out', 'image-out', 'video-out', 'effect-out', 'scene-out'] as const;
    const patchRootTypeSet = new Set(patchRootTypes);
    const roots = (snapshot.nodes ?? []).filter((n) => patchRootTypeSet.has(String(n.type) as (typeof patchRootTypes)[number]));
    if (roots.length === 0) {
      throw new Error(`No patch root node found (${patchRootTypes.join(', ')}). Add one first.`);
    }

    const connections = snapshot.connections ?? [];
    const activeRoots = roots.filter((root) =>
      connections.some(
        (c) => String(c.sourceNodeId) === String(root.id) && String(c.sourcePortId) === 'cmd'
      )
    );

    const selectedRoots = (() => {
      if (roots.length === 1) return roots;
      if (activeRoots.length >= 1) return activeRoots;
      const list = roots
        .map((n) => `${String(n.type)}:${String(n.id)}`)
        .sort()
        .join(', ');
      throw new Error(
        `Multiple patch roots found (${list}). Connect Deploy on one or more roots (or delete the others).`
      );
    })();

    return this.exportGraphForPatchFromRootNodeIds(selectedRoots.map((n) => String(n.id)));
  }
}

// Singleton instance
export const nodeEngine = new NodeEngineClass();
