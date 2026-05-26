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
import {
  applyGraphChanges,
  NodeRuntime,
  normalizeNodeConfigForDefinition,
} from '@shugu/node-core';
import type {
  GraphState as CoreGraphState,
  NodeInstance as CoreNodeInstance,
} from '@shugu/node-core';

import type { Connection, GraphChange, GraphState, NodeInstance } from './types';
import { nodeRegistry } from './registry';
import { parameterRegistry } from '../parameters/registry';
import { exportGraphForPatch } from './patch-export';
import { customNodeDefinitions } from './custom-nodes/store';
import {
  clearNodeGraphLayout,
  patchNodeGraphLayoutPosition,
  saveNodeGraphLayoutFromGraph,
} from '$lib/project/nodeGraphLayout';
import { compileGraphForPatch } from './custom-nodes/flatten';
import { diffGraphState } from './graph-changes';
import { applySelectionMapOptions } from './engine-selection-options';
import {
  assertPatchDeployableNodeType,
  collectRequiredCapabilities,
  createPatchId,
  isLoopDeployableNodeType,
  isPatchRootType,
  patchRootTypeList,
  selectPatchRoots,
} from './engine-deployment-policy';
import {
  getConnectionValidationError,
  getLocalOnlyPatchRoutingError,
} from './connection-validation';
import {
  detectLocalClientLoops,
  shouldComputeWhileOffloaded,
  type LocalLoop,
} from './local-loop-detection';

export type { LocalLoop } from './local-loop-detection';

const TICK_INTERVAL = 33; // ~30 FPS

const asManagerGraph = (graph: CoreGraphState): GraphState => graph as unknown as GraphState;
const asManagerNode = (node: CoreNodeInstance | undefined): NodeInstance | undefined =>
  node as unknown as NodeInstance | undefined;

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
    this.runtime = this.createRuntime();
    this.syncGraphState();
    this.updateLocalLoops();
  }

  private createRuntime(): NodeRuntime {
    return new NodeRuntime(nodeRegistry, {
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
        console.warn('[NodeEngine] watchdog warning:', info?.reason, message, info?.diagnostics);
        this.lastError.set(message);
      },
    });
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
    const snapshot = asManagerGraph(this.runtime.exportGraph());
    const config = { ...(node.config ?? {}) };
    const inputValues = { ...(node.inputValues ?? {}) };
    stripLegacyToneFields(String(node.type), config, inputValues);
    const sanitizedNode: NodeInstance = {
      ...node,
      config,
      inputValues,
      outputValues: { ...(node.outputValues ?? {}) },
    };
    const next = asManagerGraph(applyGraphChanges(snapshot, [{ type: 'add-node', node: sanitizedNode }]));

    this.runtime.loadGraph(next);
    this.syncGraphState();
    this.emitGraphChanges(snapshot, next);
    this.updateLocalLoops();
  }

  removeNode(nodeId: string): void {
    const snapshot = asManagerGraph(this.runtime.exportGraph());
    const next = asManagerGraph(applyGraphChanges(snapshot, [{ type: 'remove-node', nodeId }]));

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
    const definition = nodeRegistry.get(String(node.type));
    const nextConfig = definition
      ? normalizeNodeConfigForDefinition(String(node.type), { ...node.config, ...config }, [definition]).config
      : { ...node.config, ...config };
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
    this.graphChanges.set([
      { type: 'update-node-input-values', nodeId, inputValues: { [portId]: value } },
    ]);
    // UI invalidation: graphState holds live references, but Svelte won't react to deep mutations
    // unless some store updates. Use tickTime as a lightweight "pulse" so controls that read
    // live node state can refresh without syncing the whole graph.
    this.tickTime.set(Date.now());
  }

  replaceNodeInputValues(nodeId: string, inputValues: Record<string, unknown>): void {
    const node = this.runtime.getNode(nodeId);
    if (!node) return;
    node.inputValues = { ...inputValues };
    this.graphChanges.set([{ type: 'update-node-input-values', nodeId, inputValues: { ...inputValues } }]);
    this.tickTime.set(Date.now());
  }

  updateNodePosition(nodeId: string, position: { x: number; y: number }): void {
    const node = this.runtime.getNode(nodeId);
    if (!node) return;
    node.position = position;
    patchNodeGraphLayoutPosition(nodeId, position);
    this.graphChanges.set([{ type: 'update-node-position', nodeId, position }]);
    // Don't sync graph state for position-only changes (performance)
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
    const snapshot = asManagerGraph(this.runtime.exportGraph());
    const validationError = getConnectionValidationError({
      graph: snapshot,
      connection,
      getNodeDefinition: (type) => nodeRegistry.get(type),
    });
    if (validationError) {
      if (validationError !== 'Connection failed') this.lastError.set(validationError);
      return false;
    }

    const next = applySelectionMapOptions(
      asManagerGraph(applyGraphChanges(snapshot, [{ type: 'add-connection', connection }]))
    );

    const localOnlyError = getLocalOnlyPatchRoutingError({
      graph: next,
      getNodeDefinition: (type) => nodeRegistry.get(type),
    });
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
    const snapshot = asManagerGraph(this.runtime.exportGraph());
    const next = applySelectionMapOptions(
      asManagerGraph(applyGraphChanges(snapshot, [{ type: 'remove-connection', connectionId }]))
    );

    this.cleanupGraphTransition(snapshot, next, { reason: 'removeConnection' });
    this.runtime.loadGraph(next);
    this.syncGraphState();
    this.emitGraphChanges(snapshot, next);
    this.updateLocalLoops();
  }

  getNode(nodeId: string): NodeInstance | undefined {
    return asManagerNode(this.runtime.getNode(nodeId));
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
    const prev = asManagerGraph(this.runtime.exportGraph());
    this.runtime.clear();
    this.offloadedNodeIds.clear();
    this.offloadedPatchNodeIds.clear();
    this.deployedLoopIds.clear();
    this.disabledNodeIds.clear();
    this.syncGraphState();
    clearNodeGraphLayout();
    this.emitGraphChanges(prev, asManagerGraph(this.runtime.exportGraph()));
    this.updateLocalLoops();

    // Reset all node-origin modulation
    parameterRegistry.list().forEach((param) => param.clearModulation?.(undefined, 'NODE'));
  }

  // ========== Serialization ==========

  private syncGraphState(): void {
    this.graphState.set(asManagerGraph(this.runtime.getGraphRef()));
  }

  private emitGraphChanges(prev: GraphState, next: GraphState): void {
    const changes = diffGraphState(prev, next);
    if (changes.length > 0) this.graphChanges.set(changes);
  }

  loadGraph(state: GraphState): void {
    const prev = asManagerGraph(this.runtime.exportGraph());
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
      const definition = nodeRegistry.get(type);
      const normalizedConfig = definition
        ? normalizeNodeConfigForDefinition(type, config, [definition]).config
        : config;
      nodes.push({
        ...node,
        config: normalizedConfig,
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

    const prepared = applySelectionMapOptions(sanitized);
    this.cleanupGraphTransition(prev, prepared, { reason: 'loadGraph' });
    this.runtime.loadGraph(prepared);
    this.offloadedNodeIds.clear();
    this.offloadedPatchNodeIds.clear();
    this.deployedLoopIds.clear();
    this.disabledNodeIds.clear();
    this.syncGraphState();
    saveNodeGraphLayoutFromGraph(prepared);
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
      const loops = detectLocalClientLoops(asManagerGraph(this.runtime.getGraphRef()));
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

    const nodes: GraphState['nodes'] = [];
    for (const id of loop.nodeIds) {
      const node = this.runtime.getNode(id);
      if (!node) continue;
      if (!isLoopDeployableNodeType(node.type)) {
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

    // AI model refs act as global deployment toggles (unconnected by design).
    // Include them so the client NodeExecutor can enable/disable its AI runtime.
    const graphSnapshot = asManagerGraph(this.runtime.exportGraph());
    for (const node of graphSnapshot.nodes ?? []) {
      if (String(node.type) !== 'ai-model-ref') continue;
      const nodeId = String(node.id);
      if (!nodeId) continue;
      if (nodes.some((n) => n.id === nodeId)) continue;
      nodes.push({
        id: nodeId,
        type: 'ai-model-ref',
        position: node.position,
        config: { ...(node.config ?? {}) },
        inputValues: { ...(node.inputValues ?? {}) },
        outputValues: {},
      });
    }

    const nodeSet = new Set(nodes.map((n) => n.id));
    const { connections } = asManagerGraph(this.runtime.getGraphRef());
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
   * (`audio-out` / `video-out` / `ui-out`) for client-side execution.
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
    const snapshot = asManagerGraph(compileGraphForPatch(
      asManagerGraph(this.runtime.exportGraph()),
      get(customNodeDefinitions) ?? []
    ));
    const ids = Array.from(new Set((rootNodeIds ?? []).map(String).filter(Boolean))).sort();
    if (ids.length === 0) throw new Error('No patch root ids provided.');

    const nodeById = new Map((snapshot.nodes ?? []).map((n) => [String(n.id), n]));
    const roots = ids.map((id) => {
      const node = nodeById.get(String(id)) ?? null;
      if (!node) throw new Error(`Invalid patch root id: ${String(id)}`);
      const type = String(node.type ?? '');
      if (!isPatchRootType(type)) {
        throw new Error(`Invalid patch root type: ${type}:${String(node.id ?? id)}`);
      }
      return node;
    });

    const patch = exportGraphForPatch(snapshot, {
      rootNodeIds: ids,
      nodeRegistry,
      isNodeEnabled: (nodeId) => !this.disabledNodeIds.has(String(nodeId)),
    });

    for (const n of patch.graph.nodes) {
      assertPatchDeployableNodeType(String(n.type));
    }

    // AI model refs are global toggles and can be unconnected to patch roots.
    for (const node of snapshot.nodes ?? []) {
      if (String(node.type) !== 'ai-model-ref') continue;
      const nodeId = String(node.id);
      if (!nodeId) continue;
      if (this.disabledNodeIds.has(nodeId)) continue;
      if (patch.graph.nodes.some((n) => String(n.id) === nodeId)) continue;
      patch.graph.nodes.push({
        id: nodeId,
        type: 'ai-model-ref',
        position: node.position,
        config: { ...(node.config ?? {}) },
        inputValues: { ...(node.inputValues ?? {}) },
        outputValues: {},
      });
    }

    const patchId = createPatchId(roots, patch.graph.nodes);

    return {
      graph: patch.graph,
      meta: {
        loopId: patchId,
        requiredCapabilities: collectRequiredCapabilities(patch.graph.nodes),
        tickIntervalMs: TICK_INTERVAL,
        protocolVersion: PROTOCOL_VERSION,
        executorVersion: 'node-executor-v1',
      },
      assetRefs: patch.assetRefs,
    };
  }

  exportCompiledGraphForPatchPlanning(): GraphState {
    return asManagerGraph(compileGraphForPatch(
      asManagerGraph(this.runtime.exportGraph()),
      get(customNodeDefinitions) ?? []
    ));
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
    const snapshot = asManagerGraph(this.runtime.exportGraph());
    const selectedRoots = selectPatchRoots(snapshot);
    return this.exportGraphForPatchFromRootNodeIds(selectedRoots.map((n) => String(n.id)));
  }
}

// Singleton instance
export const nodeEngine = new NodeEngineClass();
export type NodeEngine = typeof nodeEngine;
