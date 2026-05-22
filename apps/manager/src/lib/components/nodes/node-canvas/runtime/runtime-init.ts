/**
 * Purpose: Centralized runtime wiring for NodeCanvas (patch runtime, client selection, sleep sockets).
 */
import type { Readable } from 'svelte/store';
import type { GraphState } from '$lib/nodes/types';
import type { NodeRegistry } from '@shugu/node-core';
import type { GraphViewAdapter } from '../adapters';
import type { SleepNodeSocketSync } from './sleep-node-sockets';
import { createSleepNodeSocketSync } from './sleep-node-sockets';
import type { PatchRuntime } from './patch-runtime';
import { createPatchRuntime } from './patch-runtime';
import type { ClientSelectionBinding } from './client-selection-binding';
import { createClientSelectionBinding } from './client-selection-binding';
import type {
  DisplayTransportLike,
  LoopControllerLike,
  NodeEngineLike as PatchNodeEngineLike,
  SdkLike,
  WritableLike,
} from './patch-runtime-types';

type AnyAreaPlugin = { update(kind: 'node', nodeId: string): Promise<void> };
type AnyRecord = Record<string, unknown>;
type ManagerStateLike = { clients?: unknown[] };
type ClientSelectionNodeEngineLike = {
  getNode(nodeId: string): { id?: string; type?: string; config?: AnyRecord; inputValues?: AnyRecord; outputValues?: AnyRecord } | undefined;
  getLastComputedInputs(nodeId: string): Record<string, unknown> | null;
  updateNodeConfig(nodeId: string, patch: Record<string, unknown>): void;
  updateNodeInputValue(nodeId: string, portId: string, value: unknown): void;
  tickTime: { set(value: number): void };
};

type RuntimeInitOptions = {
  nodeEngine: PatchNodeEngineLike & ClientSelectionNodeEngineLike;
  nodeRegistry: NodeRegistry;
  adapter: GraphViewAdapter;
  getGraphState: () => GraphState;
  graphStateStore: Readable<GraphState>;
  isRunningStore: Readable<boolean> & { set(value: boolean): void };
  groupDisabledNodeIds: Readable<Set<string>>;
  executorStatusByClient: Readable<Map<string, AnyRecord>>;
  showExecutorLogs: WritableLike<boolean>;
  logsClientId: WritableLike<string>;
  loopController: LoopControllerLike | null;
  managerState: Readable<ManagerStateLike>;
  displayTransport: DisplayTransportLike;
  getSDK: () => SdkLike | null;
  ensureDisplayLocalFilesRegisteredFromValue: (value: unknown) => void;
  sensorData: Readable<Map<string, AnyRecord>>;
  getAreaPlugin: () => AnyAreaPlugin | null;
  getNodeMap: () => Map<string, AnyRecord>;
  sockets: Record<string, unknown>;
  sendSemanticNodeParams?: (nodeId: string, params: Record<string, unknown>) => boolean;
  sendSemanticNodeInputs?: (nodeId: string, inputValues: Record<string, unknown>) => boolean;
};

export type RuntimeInitResult = {
  sleepNodeSockets: SleepNodeSocketSync;
  patchRuntime: PatchRuntime;
  clientSelectionBinding: ClientSelectionBinding;
};

export const initNodeCanvasRuntime = (opts: RuntimeInitOptions): RuntimeInitResult => {
  const sleepNodeSockets = createSleepNodeSocketSync({
    getGraphState: opts.getGraphState,
    nodeRegistry: opts.nodeRegistry,
    sockets: opts.sockets,
    getAreaPlugin: opts.getAreaPlugin,
    getNodeMap: opts.getNodeMap,
  });

  const patchRuntime = createPatchRuntime({
    nodeEngine: opts.nodeEngine,
    nodeRegistry: opts.nodeRegistry,
    adapter: opts.adapter,
    isRunningStore: opts.isRunningStore,
    getGraphState: opts.getGraphState,
    groupDisabledNodeIds: opts.groupDisabledNodeIds,
    executorStatusByClient: opts.executorStatusByClient,
    showExecutorLogs: opts.showExecutorLogs,
    logsClientId: opts.logsClientId,
    loopController: opts.loopController,
    managerState: opts.managerState,
    displayTransport: opts.displayTransport,
    getSDK: opts.getSDK,
    ensureDisplayLocalFilesRegisteredFromValue: opts.ensureDisplayLocalFilesRegisteredFromValue,
  });

  const clientSelectionBinding = createClientSelectionBinding({
    nodeEngine: opts.nodeEngine,
    graphStateStore: opts.graphStateStore,
    getGraphState: opts.getGraphState,
    managerState: opts.managerState,
    sensorData: opts.sensorData,
    getAreaPlugin: opts.getAreaPlugin,
    getNodeMap: opts.getNodeMap,
    sendNodeOverride: patchRuntime.sendNodeOverride,
    sendSemanticNodeParams: opts.sendSemanticNodeParams,
    sendSemanticNodeInputs: opts.sendSemanticNodeInputs,
    schedulePatchReconcile: (reason, options) => patchRuntime.scheduleReconcile(reason, options),
  });

  return { sleepNodeSockets, patchRuntime, clientSelectionBinding };
};
