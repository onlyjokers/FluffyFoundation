/**
 * Purpose: Build FF-20 operator-console reports, metrics, and diagnosis from structured Manager runtime state.
 */
import type {
  ObservabilityCategory,
  ObservabilityEvent,
  ObservabilityMetricClass,
  OperatorConsoleRuntimeInput,
  OperatorConsoleSnapshotInput,
} from './operator-console-types';

export type {
  ObservabilityCategory,
  ObservabilityEvent,
  ObservabilityMetricClass,
  OperatorClient,
  OperatorConsoleRuntimeInput,
  OperatorConsoleSnapshotInput,
  OperatorExecutorLogEntry,
  OperatorExecutorStatus,
  OperatorMetricInput,
  OperatorPendingTransfer,
  OperatorReadiness,
} from './operator-console-types';

export type OperatorConsoleSnapshot = ReturnType<typeof buildOperatorConsoleSnapshot>;

const metricClassesByCategory: Record<ObservabilityCategory, ObservabilityMetricClass[]> = {
  'validation-error': ['errors', 'command-outcome'],
  'permission-denial': ['errors', 'command-outcome'],
  'transport-failure': ['latency', 'traffic', 'errors', 'drops'],
  'node-executor-status': ['command-outcome', 'device-capability', 'latency'],
  'display-status': ['fps', 'device-capability'],
  'asset-readiness': ['audio-readiness', 'device-capability'],
  'ai-proposal': ['latency', 'traffic', 'command-outcome'],
  rollback: ['command-outcome', 'errors', 'saturation'],
};

const eventIdFor = (event: Pick<ObservabilityEvent, 'category' | 'source' | 'targetId' | 'at'>): string =>
  `${event.category}:${event.source}:${event.targetId ?? 'system'}:${event.at}`;

export function normalizeObservabilityEvent(input: {
  category: string;
  severity?: string;
  message: string;
  at: number;
  source: string;
  targetId?: string;
  payload?: Record<string, unknown>;
}): ObservabilityEvent {
  const category = normalizeCategory(input.category, input.payload);
  const severity: ObservabilityEvent['severity'] =
    input.severity === 'error' || input.severity === 'warning' ? input.severity : 'info';
  const event = {
    category,
    severity,
    message: input.message,
    at: Number.isFinite(input.at) ? input.at : Date.now(),
    source: input.source || 'unknown',
    targetId: input.targetId,
    metricClasses: metricClassesByCategory[category],
    payload: input.payload ?? {},
  };
  return { ...event, id: eventIdFor(event) };
}

function normalizeCategory(category: string, payload?: Record<string, unknown>): ObservabilityCategory {
  if (isObservabilityCategory(category)) return category;
  const code = String(payload?.code ?? '');
  if (code.includes('policy') || code.includes('permission') || code.includes('scope')) return 'permission-denial';
  if (category === 'error' || category === 'rejected') return 'node-executor-status';
  return 'validation-error';
}

function isObservabilityCategory(value: string): value is ObservabilityCategory {
  return value in metricClassesByCategory;
}

function percentile(values: number[], ratio: number): number | null {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return sorted[index];
}

function activePartitionIdFrom(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = record.partitionId ?? record.id ?? record.groupId;
  return typeof id === 'string' && id ? id : null;
}

export function buildOperatorConsoleSnapshotInput(input: OperatorConsoleRuntimeInput): OperatorConsoleSnapshotInput {
  const clients = Array.isArray(input.managerState.clients) ? input.managerState.clients : [];
  const controlPlane =
    input.managerState.controlPlane && typeof input.managerState.controlPlane === 'object'
      ? (input.managerState.controlPlane as Record<string, unknown>)
      : {};
  const controlPlanePartitions = controlPlane.activePartitions ?? controlPlane.partitions;
  const activePartitionIds = input.activePartitionIds ?? activePartitionIdsFrom(controlPlanePartitions);

  return {
    connectionStatus: input.managerState.status ?? 'unknown',
    clients,
    clientReadiness: input.clientReadiness,
    executorStatusByClient: input.executorStatusByClient,
    activePartitionIds,
    pendingTransfers: input.pendingTransfers ?? [],
    killSwitch: input.killSwitch ?? { active: false, updatedAt: input.now },
    metrics: input.metrics ?? {},
    now: input.now,
  };
}

const activePartitionIdsFrom = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(activePartitionIdFrom).filter((id): id is string => Boolean(id)) : [];

function executorEvents(input: OperatorConsoleSnapshotInput): ObservabilityEvent[] {
  const events: ObservabilityEvent[] = [];
  for (const [clientId, status] of input.executorStatusByClient.entries()) {
    for (const entry of status.log) {
      const category = normalizeCategory(entry.event, entry.payload);
      const baseEvent = {
        severity: entry.error ? 'error' : 'info',
        at: entry.at,
        source: 'node-executor',
        targetId: clientId,
        payload: { ...entry.payload, loopId: entry.loopId, event: entry.event },
      };
      events.push(normalizeObservabilityEvent({ ...baseEvent, category, message: entry.error ?? `node-executor ${entry.event}` }));
      if (category !== 'node-executor-status') {
        events.push(normalizeObservabilityEvent({ ...baseEvent, category: 'node-executor-status', message: `node-executor ${entry.event}` }));
      }
    }
  }
  return events;
}

function readinessEvents(input: OperatorConsoleSnapshotInput): ObservabilityEvent[] {
  return Array.from(input.clientReadiness.entries()).map(([clientId, info]) =>
    normalizeObservabilityEvent({
      category: 'asset-readiness',
      severity: info.status === 'assets-error' ? 'error' : 'info',
      message: info.error ?? info.status,
      at: info.updatedAt,
      source: 'asset-readiness',
      targetId: clientId,
      payload: { ...info },
    })
  );
}

function isCommandFailure(event: ObservabilityEvent, events: ObservabilityEvent[]): boolean {
  if (event.severity !== 'error') return false;
  if (!['permission-denial', 'transport-failure', 'node-executor-status', 'rollback'].includes(event.category)) return false;
  return (
    event.category !== 'node-executor-status' ||
    !events.some(
      (candidate) =>
        candidate !== event &&
        candidate.severity === 'error' &&
        candidate.targetId === event.targetId &&
        candidate.at === event.at &&
        candidate.category !== 'node-executor-status'
    )
  );
}

export function buildOperatorConsoleSnapshot(input: OperatorConsoleSnapshotInput) {
  const events = [...readinessEvents(input), ...executorEvents(input)];
  const failedCommands = events.filter((event) => isCommandFailure(event, events));
  const displayClients = input.clients.filter((client) => client.group === 'display');
  const onlineClients = input.clients.filter((client) => client.connected !== false);
  const commandOutcomes = input.metrics.commandOutcomes ?? {
    ok: events.filter((event) => event.category === 'node-executor-status' && event.severity !== 'error').length,
    failed: failedCommands.length,
  };
  const healthStatus =
    input.connectionStatus !== 'connected' || input.killSwitch.active || failedCommands.length > 0
      ? 'degraded'
      : 'healthy';

  return {
    generatedAt: input.now,
    health: {
      status: healthStatus as 'healthy' | 'degraded',
      connectionStatus: input.connectionStatus,
      failedCommandCount: failedCommands.length,
    },
    activePartitions: [...input.activePartitionIds],
    connectedDevices: {
      total: input.clients.length,
      online: onlineClients.length,
      displayOnline: displayClients.filter((client) => client.connected !== false).length,
      audienceOnline: onlineClients.filter((client) => client.group !== 'display').length,
    },
    failedCommands,
    pendingTransfers: [...input.pendingTransfers],
    killSwitch: { ...input.killSwitch },
    metrics: {
      latency: { p95Ms: percentile(input.metrics.latencyMs ?? [], 0.95) },
      traffic: input.metrics.traffic ?? { inbound: 0, outbound: 0 },
      errors: input.metrics.errors ?? failedCommands.length,
      saturation: input.metrics.saturation ?? 0,
      drops: input.metrics.drops ?? 0,
      fps: input.metrics.fps ?? null,
      audioReady: input.metrics.audioReady ?? { ready: 0, total: 0 },
      deviceCapability: input.metrics.deviceCapability ?? { ready: onlineClients.length, total: input.clients.length },
      commandOutcomes,
    },
    events,
  };
}

export function diagnoseFailedDisplayUpdate(snapshot: OperatorConsoleSnapshot) {
  const display = snapshot.connectedDevices.displayOnline > 0;
  const failure = snapshot.failedCommands.find(
    (event) => event.targetId && (event.category === 'permission-denial' || event.category === 'node-executor-status')
  );
  if (!display || !failure) {
    return { status: 'undiagnosed' as const, summary: 'No structured display failure was found.', evidence: [] };
  }
  const evidence = snapshot.events.filter(
    (event) => event.targetId === failure.targetId && (event.category === 'permission-denial' || event.category === 'node-executor-status')
  );
  return {
    status: 'diagnosed' as const,
    displayClientId: failure.targetId,
    failure,
    summary: failure.message,
    evidence,
  };
}
