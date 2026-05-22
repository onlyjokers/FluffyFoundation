/**
 * Purpose: Shared type contracts for patch runtime orchestration.
 */
import type { Readable } from 'svelte/store';
import type { TargetSelector } from '@shugu/protocol';
import type { GraphState, NodeDefinition, NodeInstance, PortType } from '$lib/nodes/types';
import type { GraphViewAdapter } from '../adapters/graph-view-adapter';
import type { ExecutorStatusLike } from './patch-override-routing';

export type PatchPayload = {
  graph: Pick<GraphState, 'nodes' | 'connections'>;
  meta: {
    loopId: string;
    requiredCapabilities: string[];
    tickIntervalMs: number;
    protocolVersion: string;
    executorVersion: string;
  };
  assetRefs: string[];
};

export type NodeRegistryLike = {
  get(type: string): NodeDefinition | undefined;
};

export type NodeEngineLike = {
  getNode(nodeId: string): NodeInstance | undefined;
  getLastComputedInputs(nodeId: string): Record<string, unknown> | null;
  exportCompiledGraphForPatchPlanning?(): GraphState;
  exportGraphForPatchFromRootNodeIds(rootNodeIds: string[]): PatchPayload;
  lastError: Readable<string | null> & { set(value: string | null): void };
  setPatchOffloadedNodeIds(nodeIds: string[]): void;
  getTimeRangePlayheadSec(nodeId: string): number | null;
};

export type ManagerStateLike = { clients?: unknown[]; selectedClientIds?: unknown[] };

export type DisplayTransportAvailabilityLike = {
  route: string;
  hasLocalSession: boolean;
  hasLocalReady: boolean;
  hasRemoteDisplay: boolean;
  localSessionKey?: string;
};

export type DisplayTransportSendOptionsLike = { forceServer?: boolean; localOnly?: boolean };

export type DisplayTransportLike = {
  getAvailability: () => DisplayTransportAvailabilityLike;
  sendPlugin: (
    pluginId: string,
    command: string,
    payload?: Record<string, unknown>,
    options?: DisplayTransportSendOptionsLike
  ) => DisplayTransportAvailabilityLike;
};

export type SdkLike = {
  sendPluginControl: (
    target: TargetSelector,
    pluginName: string,
    command: string,
    payload: unknown
  ) => void;
};

export type LoopControllerLike = {
  deployedLoopIds: Readable<Set<string>>;
  localLoops: Readable<unknown[]>;
  loopActions: {
    getLoopClientId(loop: unknown): string | null;
    getDeployedLoopForNode(nodeId: string): { id: string } | null;
  };
};

export type WritableLike<T> = {
  set(value: T): void;
  subscribe: (run: (v: T) => void) => () => void;
};

export type SendNodeOverrideFn = (
  nodeId: string,
  kind: 'input' | 'config',
  portId: string,
  value: unknown
) => void;

export type NodeOverride = {
  nodeId: string;
  kind: 'input' | 'config';
  portId: string;
  value?: unknown;
  ttlMs?: number;
};

export type DeployedPatch = {
  patchId: string;
  nodeIds: Set<string>;
  topologySignature: string;
  targetRevision: string;
  deployedAt: number;
};

export type MidiBridgeRoute = {
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  targetType: PortType;
  key: string;
};

export interface PatchRuntime {
  onTick(): void;
  onGraphStateChanged(): void;
  onLoopDeployListChanged(): void;
  onGroupDisabledChanged(disabled: Set<string>): void;
  onRunningChanged(running: boolean): void;
  scheduleReconcile(reason: string, options?: { immediate?: boolean }): void;
  stopAllDeployedPatches(): void;
  clearMidiLoopBridgeState(): void;
  syncPatchVisualState(): void;
  applyStoppedHighlights(running: boolean): Promise<void>;
  toggleExecutorLogs(): void;
  sendNodeOverride: SendNodeOverrideFn;
  destroy(): void;
}

export interface CreatePatchRuntimeOptions {
  nodeEngine: NodeEngineLike;
  nodeRegistry: NodeRegistryLike;
  adapter: GraphViewAdapter;
  isRunningStore: Readable<boolean>;
  getGraphState: () => GraphState;
  groupDisabledNodeIds: Readable<Set<string>>;
  executorStatusByClient: Readable<Map<string, ExecutorStatusLike>>;
  showExecutorLogs: WritableLike<boolean>;
  logsClientId: WritableLike<string>;
  loopController: LoopControllerLike | null;
  managerState: Readable<ManagerStateLike>;
  displayTransport: DisplayTransportLike;
  getSDK: () => SdkLike | null;
  ensureDisplayLocalFilesRegisteredFromValue: (value: unknown) => void;
}
