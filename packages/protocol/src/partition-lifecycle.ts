/**
 * Purpose: FF-14 execution partition lifecycle contracts, validation, and structured failure reports.
 */
import type { ControlPlaneActor } from './control-plane.js';

export type ExecutionTargetPlatform = 'manager' | 'client' | 'display' | 'server' | 'worker' | 'local-only';

export type PartitionLifecycleOperation = 'deploy' | 'start' | 'stop' | 'remove' | 'redeploy';

export type ExecutionPartitionStatus = 'draft' | 'deployed' | 'running' | 'stopped' | 'removed' | 'error';

export interface PartitionResourceBudget {
  maxTickHz?: number;
  maxMemoryMb?: number;
  observedTickHz?: number;
  observedMemoryMb?: number;
}

export interface PartitionWatchdogConfig {
  timeoutMs?: number;
  failureThreshold?: number;
  lastHeartbeatAt?: number;
  missedHeartbeats?: number;
}

export interface PartitionFailureReport {
  kind: 'partition-failure-report';
  partitionId: string;
  targetPlatform: ExecutionTargetPlatform;
  code: string;
  message: string;
  atRevision: number;
  watchdog?: PartitionWatchdogConfig;
  resourceBudget?: PartitionResourceBudget;
}

export interface ExecutionPartition {
  id: string;
  nodeIds: string[];
  targetPlatform: ExecutionTargetPlatform;
  status: ExecutionPartitionStatus;
  requiredCapabilities?: string[];
  boundRevision?: number;
  resourceBudget?: PartitionResourceBudget;
  watchdog?: PartitionWatchdogConfig;
  failureReport?: PartitionFailureReport;
  error?: string;
}

export type PartitionLifecycleRejectCode =
  | 'partition.capability.missing'
  | 'partition.revision_mismatch'
  | 'control-plane.capability_required'
  | 'partition.target.invalid';

export type PartitionLifecycleValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: {
        code: PartitionLifecycleRejectCode;
        message: string;
        missingCapabilities?: string[];
        expectedRevision?: number;
        actualRevision?: number;
      };
    };

export type PartitionLifecyclePayload = {
  kind: 'partition-lifecycle';
  operation: PartitionLifecycleOperation;
  partition?: ExecutionPartition;
  partitionId?: string;
  availableCapabilities?: string[];
  currentRevision?: number;
};

const executionTargetPlatforms = new Set<ExecutionTargetPlatform>([
  'manager',
  'client',
  'display',
  'server',
  'worker',
  'local-only',
]);

export function isExecutionTargetPlatform(value: unknown): value is ExecutionTargetPlatform {
  return typeof value === 'string' && executionTargetPlatforms.has(value as ExecutionTargetPlatform);
}

export function createExecutionPartition(input: {
  id: string;
  nodeIds?: string[];
  targetPlatform: ExecutionTargetPlatform;
  status?: ExecutionPartitionStatus;
  requiredCapabilities?: string[];
  boundRevision?: number;
  resourceBudget?: PartitionResourceBudget;
  watchdog?: PartitionWatchdogConfig;
  failureReport?: PartitionFailureReport;
  error?: string;
}): ExecutionPartition {
  const partition: ExecutionPartition = {
    id: normalizeRequiredString(input.id, 'partitionId'),
    nodeIds: [...(input.nodeIds ?? [])].map(String).filter(Boolean),
    targetPlatform: input.targetPlatform,
    status: input.status ?? 'draft',
    requiredCapabilities: input.requiredCapabilities ? [...input.requiredCapabilities] : undefined,
    boundRevision: normalizeOptionalFiniteNumber(input.boundRevision),
    resourceBudget: input.resourceBudget ? { ...input.resourceBudget } : undefined,
    watchdog: input.watchdog ? { ...input.watchdog } : undefined,
    failureReport: input.failureReport ? { ...input.failureReport } : undefined,
    error: input.error,
  };
  if (partition.requiredCapabilities === undefined) delete partition.requiredCapabilities;
  if (partition.boundRevision === undefined) delete partition.boundRevision;
  if (partition.resourceBudget === undefined) delete partition.resourceBudget;
  if (partition.watchdog === undefined) delete partition.watchdog;
  if (partition.failureReport === undefined) delete partition.failureReport;
  if (partition.error === undefined) delete partition.error;
  return partition;
}

export function createPartitionFailureReport(input: {
  partitionId: string;
  targetPlatform: ExecutionTargetPlatform;
  code: string;
  message: string;
  atRevision: number;
  watchdog?: PartitionWatchdogConfig;
  resourceBudget?: PartitionResourceBudget;
}): PartitionFailureReport {
  return {
    kind: 'partition-failure-report',
    partitionId: normalizeRequiredString(input.partitionId, 'partitionId'),
    targetPlatform: input.targetPlatform,
    code: normalizeRequiredString(input.code, 'code'),
    message: normalizeRequiredString(input.message, 'message'),
    atRevision: Number(input.atRevision),
    watchdog: input.watchdog ? { ...input.watchdog } : undefined,
    resourceBudget: input.resourceBudget ? { ...input.resourceBudget } : undefined,
  };
}

export function validatePartitionLifecycleRequest(input: {
  operation: PartitionLifecycleOperation;
  partition: ExecutionPartition;
  actor: ControlPlaneActor;
  availableCapabilities?: string[];
  currentRevision?: number;
}): PartitionLifecycleValidationResult {
  if (!isExecutionTargetPlatform(input.partition.targetPlatform)) {
    return { ok: false, reason: { code: 'partition.target.invalid', message: 'Partition targetPlatform is unsupported.' } };
  }
  const actorCapabilities = new Set(input.actor.capabilities);
  const needsDeploy = input.operation === 'deploy' || input.operation === 'redeploy';
  const needsStop = input.operation === 'start' || input.operation === 'stop' || input.operation === 'remove';
  if ((needsDeploy && !actorCapabilities.has('partition.deploy')) || (needsStop && !actorCapabilities.has('partition.stop'))) {
    return { ok: false, reason: { code: 'control-plane.capability_required', message: 'Actor lacks partition lifecycle capability.' } };
  }
  if (typeof input.currentRevision === 'number' && typeof input.partition.boundRevision === 'number' && input.partition.boundRevision !== input.currentRevision) {
    return {
      ok: false,
      reason: {
        code: 'partition.revision_mismatch',
        message: 'Partition bound revision does not match current graph revision.',
        expectedRevision: input.currentRevision,
        actualRevision: input.partition.boundRevision,
      },
    };
  }
  const available = new Set(input.availableCapabilities ?? []);
  const missingCapabilities = (input.partition.requiredCapabilities ?? []).filter((capability) => !available.has(capability));
  return missingCapabilities.length > 0
    ? { ok: false, reason: { code: 'partition.capability.missing', message: 'Target is missing required partition capabilities.', missingCapabilities } }
    : { ok: true };
}

function normalizeRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function normalizeOptionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
