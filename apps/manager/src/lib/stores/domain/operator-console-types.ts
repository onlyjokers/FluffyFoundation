/**
 * Purpose: Shared FF-20 operator-console report, metric, and snapshot types.
 */
export type OperatorClient = {
  clientId: string;
  group?: string | null;
  connected?: boolean;
  connectedAt?: number;
};

export type OperatorReadiness = {
  status: 'connected' | 'assets-loading' | 'assets-ready' | 'assets-error';
  manifestId?: string;
  loaded?: number;
  total?: number;
  error?: string;
  updatedAt: number;
};

export type OperatorExecutorLogEntry = {
  at: number;
  event: string;
  loopId: string | null;
  error: string | null;
  payload: Record<string, unknown>;
};

export type OperatorExecutorStatus = {
  running: boolean;
  loopId: string | null;
  lastEvent: string;
  lastError: string | null;
  lastSeenAt: number;
  log: OperatorExecutorLogEntry[];
};

export type OperatorPendingTransfer = {
  transferId: string;
  groupId: string;
  targetClientId: string;
  status: string;
  updatedAt?: number;
};

export type OperatorMetricInput = {
  latencyMs?: number[];
  traffic?: { inbound: number; outbound: number };
  errors?: number;
  saturation?: number;
  drops?: number;
  fps?: number;
  audioReady?: { ready: number; total: number };
  deviceCapability?: { ready: number; total: number };
  commandOutcomes?: { ok: number; failed: number };
};

export type ObservabilityCategory =
  | 'validation-error'
  | 'permission-denial'
  | 'transport-failure'
  | 'node-executor-status'
  | 'display-status'
  | 'asset-readiness'
  | 'ai-proposal'
  | 'rollback';

export type ObservabilityMetricClass =
  | 'latency'
  | 'traffic'
  | 'errors'
  | 'saturation'
  | 'drops'
  | 'fps'
  | 'audio-readiness'
  | 'device-capability'
  | 'command-outcome';

export type ObservabilityEvent = {
  id: string;
  category: ObservabilityCategory;
  severity: 'info' | 'warning' | 'error';
  message: string;
  at: number;
  source: string;
  targetId?: string;
  metricClasses: ObservabilityMetricClass[];
  payload: Record<string, unknown>;
};

export type OperatorConsoleSnapshotInput = {
  connectionStatus: string;
  clients: OperatorClient[];
  clientReadiness: Map<string, OperatorReadiness>;
  executorStatusByClient: Map<string, OperatorExecutorStatus>;
  activePartitionIds: string[];
  pendingTransfers: OperatorPendingTransfer[];
  killSwitch: { active: boolean; updatedAt: number };
  metrics: OperatorMetricInput;
  now: number;
};

export type OperatorConsoleRuntimeInput = {
  managerState: {
    status?: string;
    clients?: OperatorClient[];
    controlPlane?: unknown;
  };
  clientReadiness: Map<string, OperatorReadiness>;
  executorStatusByClient: Map<string, OperatorExecutorStatus>;
  activePartitionIds?: string[];
  pendingTransfers?: OperatorPendingTransfer[];
  killSwitch?: { active: boolean; updatedAt: number };
  metrics?: OperatorMetricInput;
  now: number;
};
