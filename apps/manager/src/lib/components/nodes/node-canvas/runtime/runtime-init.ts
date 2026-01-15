/**
 * Purpose: Centralized runtime wiring for NodeCanvas (patch runtime, client selection, sleep sockets).
 */
import type { Readable } from 'svelte/store';
import type { GraphState } from '$lib/nodes/types';
import type { NodeRegistry } from '@shugu/node-core';
import type { GraphViewAdapter } from '../adapters';
import type { NodeEngine } from '$lib/nodes/engine';
import type { SleepNodeSocketSync } from './sleep-node-sockets';
import { createSleepNodeSocketSync } from './sleep-node-sockets';
import type { PatchRuntime } from './patch-runtime';
import { createPatchRuntime } from './patch-runtime';
import type { ClientSelectionBinding } from './client-selection-binding';
import { createClientSelectionBinding } from './client-selection-binding';

type RuntimeInitOptions = {
  nodeEngine: NodeEngine;
  nodeRegistry: NodeRegistry;
  adapter: GraphViewAdapter;
  getGraphState: () => GraphState;
  graphStateStore: Readable<GraphState>;
  isRunningStore: Readable<boolean>;
  groupDisabledNodeIds: Readable<Set<string>>;
  executorStatusByClient: Readable<Record<string, unknown>>;
  showExecutorLogs: Readable<boolean>;
  logsClientId: Readable<string>;
  loopController: unknown;
  managerState: Readable<Record<string, unknown>>;
  displayTransport: unknown;
  getSDK: () => unknown;
  ensureDisplayLocalFilesRegisteredFromValue: (value: unknown) => void;
  sensorData: Readable<Record<string, unknown>>;
  getAreaPlugin: () => unknown;
  getNodeMap: () => Map<string, unknown>;
  sockets: unknown;
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
  });

  return { sleepNodeSockets, patchRuntime, clientSelectionBinding };
};
