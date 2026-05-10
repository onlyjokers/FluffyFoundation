/**
 * Purpose: Define the FF-12 ControlPlane V2 actor, capability, and Group ownership contract.
 */
export {
  createExecutionPartition,
  createPartitionFailureReport,
  isExecutionTargetPlatform,
  validatePartitionLifecycleRequest,
  type ExecutionPartition,
  type ExecutionPartitionStatus,
  type ExecutionTargetPlatform,
  type PartitionFailureReport,
  type PartitionLifecycleOperation,
  type PartitionLifecycleRejectCode,
  type PartitionLifecycleValidationResult,
  type PartitionResourceBudget,
  type PartitionWatchdogConfig,
} from './partition-lifecycle.js';

export type ControlPlaneActorRole = 'manager' | 'client' | 'service' | 'ai' | 'root';

export type ControlPlaneCapability =
  | 'group.view'
  | 'group.mutate'
  | 'group.reclaim'
  | 'group.release'
  | 'group.archive'
  | 'group.restore'
  | 'partition.deploy'
  | 'partition.stop'
  | 'proposal.create'
  /** Historical compile compatibility only; Root is not an active runtime role. */
  | 'root.stopAll';

export type ControlPlaneSurface = 'public' | 'internal';
export type ControlPlaneVisibilityAccess = 'hidden' | 'visible-readonly' | 'editable';

export interface ControlPlaneActor {
  id: string;
  role: ControlPlaneActorRole;
  capabilities: ControlPlaneCapability[];
}

export interface GroupOwnershipActor {
  actorId: string;
  role: ControlPlaneActorRole;
  capabilities: ControlPlaneCapability[];
}

export interface GroupVisibilityPolicy {
  defaultAccess: ControlPlaneVisibilityAccess;
}

export interface GroupOwnershipEntry {
  groupId: string;
  owner: GroupOwnershipActor;
  ownerStack: GroupOwnershipActor[];
  transferable: boolean;
  surface: ControlPlaneSurface;
  visibility: GroupVisibilityPolicy;
  archived?: boolean;
  selectedClientIds: string[];
}

export type ClientControlTransferStatus =
  | 'pending'
  | 'accepted'
  | 'denied'
  | 'expired'
  | 'revoked'
  | 'control-lost';

export interface ClientControlCapability {
  transferId: string;
  scopeGroupId: string;
  targetClientId: string;
  capabilities: ControlPlaneCapability[];
  acceptedAt?: number;
  expiresAt: number;
}

export interface ClientControlTransferOffer {
  kind: 'client-control-transfer-status';
  transferId: string;
  groupId: string;
  offeredBy: GroupOwnershipActor;
  targetClientId: string;
  status: ClientControlTransferStatus;
  offeredAt: number;
  expiresAt: number;
  capability: ClientControlCapability;
  acceptedAt?: number;
  deniedAt?: number;
  revokedAt?: number;
  reason?: string;
}

export const CONTROL_PLANE_CAPABILITIES_BY_ROLE: Record<
  ControlPlaneActorRole,
  ControlPlaneCapability[]
> = {
  manager: [
    'group.view',
    'group.mutate',
    'group.reclaim',
    'group.release',
    'group.archive',
    'group.restore',
    'partition.deploy',
    'partition.stop',
  ],
  client: ['group.view'],
  service: ['group.view', 'partition.deploy', 'partition.stop'],
  ai: ['group.view', 'proposal.create'],
  root: [],
};

const roles = new Set<ControlPlaneActorRole>(['manager', 'client', 'service', 'ai']);

export function isControlPlaneActorRole(value: unknown): value is ControlPlaneActorRole {
  return typeof value === 'string' && roles.has(value as ControlPlaneActorRole);
}

export function getControlPlaneCapabilities(role: ControlPlaneActorRole): ControlPlaneCapability[] {
  if (!isControlPlaneActorRole(role)) {
    throw new TypeError(`ControlPlane role is retired or unsupported: ${String(role)}`);
  }
  return [...CONTROL_PLANE_CAPABILITIES_BY_ROLE[role]];
}

export function createControlPlaneActor(input: {
  id?: string;
  actorId?: string;
  role: ControlPlaneActorRole;
  capabilities?: string[];
}): ControlPlaneActor {
  if (!isControlPlaneActorRole(input.role)) {
    throw new TypeError(`ControlPlane role is retired or unsupported: ${String(input.role)}`);
  }
  const id = normalizeRequiredString(input.id ?? input.actorId, 'actorId');
  const allowed = new Set(CONTROL_PLANE_CAPABILITIES_BY_ROLE[input.role]);
  const requested = input.capabilities ?? CONTROL_PLANE_CAPABILITIES_BY_ROLE[input.role];
  const capabilities = requested.filter((capability): capability is ControlPlaneCapability =>
    allowed.has(capability as ControlPlaneCapability)
  );
  return {
    id,
    role: input.role,
    capabilities: [...new Set(capabilities)],
  };
}

export function toGroupOwnershipActor(actor: ControlPlaneActor): GroupOwnershipActor {
  return {
    actorId: actor.id,
    role: actor.role,
    capabilities: [...actor.capabilities],
  };
}

export function createGroupOwnershipEntry(input: {
  groupId: string;
  owner: ControlPlaneActor | GroupOwnershipActor;
  ownerStack?: Array<ControlPlaneActor | GroupOwnershipActor>;
  transferable?: boolean;
  surface?: ControlPlaneSurface;
  visibility?: Partial<GroupVisibilityPolicy>;
  archived?: boolean;
  selectedClientIds?: string[];
}): GroupOwnershipEntry {
  return {
    groupId: normalizeRequiredString(input.groupId, 'groupId'),
    owner: normalizeOwnershipActor(input.owner),
    ownerStack: (input.ownerStack ?? []).map(normalizeOwnershipActor),
    transferable: input.transferable ?? false,
    surface: input.surface ?? 'internal',
    visibility: { defaultAccess: input.visibility?.defaultAccess ?? 'visible-readonly' },
    archived: input.archived,
    selectedClientIds: [...(input.selectedClientIds ?? [])],
  };
}

/**
 * Historical compatibility helper for persisted transfer-shaped UI state.
 *
 * Client control transfer is no longer an active product path and this helper grants view-only capability.
 */
export function createTransferOffer(input: {
  transferId?: string;
  groupId: string;
  offeredBy: ControlPlaneActor | GroupOwnershipActor;
  targetClientId: string;
  ttlMs: number;
  now?: number;
}): ClientControlTransferOffer {
  const nowMs = typeof input.now === 'number' && Number.isFinite(input.now) ? input.now : Date.now();
  const groupId = normalizeRequiredString(input.groupId, 'groupId');
  const targetClientId = normalizeRequiredString(input.targetClientId, 'targetClientId');
  const ttlMs = Math.max(1, Math.floor(input.ttlMs));
  const transferId =
    normalizeOptionalString(input.transferId) ??
    `transfer-${groupId}-${targetClientId}-${nowMs.toString(36)}`;
  return {
    kind: 'client-control-transfer-status',
    transferId,
    groupId,
    offeredBy: normalizeOwnershipActor(input.offeredBy),
    targetClientId,
    status: 'revoked',
    offeredAt: nowMs,
    expiresAt: nowMs + ttlMs,
    capability: {
      transferId,
      scopeGroupId: groupId,
      targetClientId,
      capabilities: ['group.view'],
      expiresAt: nowMs + ttlMs,
    },
    reason: 'client control transfer is retired',
  };
}

export function normalizeOwnershipActor(actor: ControlPlaneActor | GroupOwnershipActor): GroupOwnershipActor {
  const record = actor as unknown as Record<string, unknown>;
  const actorId = normalizeRequiredString(record.actorId ?? record.id, 'actorId');
  const role = isControlPlaneActorRole(record.role) ? record.role : 'client';
  return toGroupOwnershipActor(
    createControlPlaneActor({
      id: actorId,
      role,
      capabilities: Array.isArray(record.capabilities) ? record.capabilities.map(String) : undefined,
    })
  );
}

function normalizeRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
