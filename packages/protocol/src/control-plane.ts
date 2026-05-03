/**
 * Purpose: Define the FF-12 ControlPlane V2 actor, capability, and Group ownership contract.
 */

export type ControlPlaneActorRole = 'root' | 'manager' | 'client' | 'service' | 'ai';

export type ControlPlaneCapability =
  | 'group.view'
  | 'group.mutate'
  | 'group.reclaim'
  | 'group.release'
  | 'group.archive'
  | 'group.restore'
  | 'partition.deploy'
  | 'partition.stop'
  | 'root.stopAll'
  | 'proposal.create';

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

export const ROOT_EMERGENCY_SCOPE_GROUP_ID = '__root_emergency__' as const;

export const CONTROL_PLANE_CAPABILITIES_BY_ROLE: Record<
  ControlPlaneActorRole,
  ControlPlaneCapability[]
> = {
  root: [
    'group.view',
    'group.mutate',
    'group.reclaim',
    'group.release',
    'group.archive',
    'group.restore',
    'partition.deploy',
    'partition.stop',
    'root.stopAll',
    'proposal.create',
  ],
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
};

const roles = new Set<ControlPlaneActorRole>(['root', 'manager', 'client', 'service', 'ai']);

export function isControlPlaneActorRole(value: unknown): value is ControlPlaneActorRole {
  return typeof value === 'string' && roles.has(value as ControlPlaneActorRole);
}

export function getControlPlaneCapabilities(role: ControlPlaneActorRole): ControlPlaneCapability[] {
  return [...CONTROL_PLANE_CAPABILITIES_BY_ROLE[role]];
}

export function createControlPlaneActor(input: {
  id?: string;
  actorId?: string;
  role: ControlPlaneActorRole;
  capabilities?: string[];
}): ControlPlaneActor {
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
