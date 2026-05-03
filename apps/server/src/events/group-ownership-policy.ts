/**
 * Purpose: Enforce FF-12 Group ownership policy for server ingress commands.
 */
import {
  createControlPlaneActor,
  createPolicyRejectReason,
  isNonSystemMutatingCommandMessage,
  ROOT_EMERGENCY_SCOPE_GROUP_ID,
  type ControlPlaneActor,
  type ControlPlaneActorRole,
  type GroupOwnershipEntry,
  type MessageWithoutServerTimestamp,
  type ValidationRejectReason,
} from '@shugu/protocol';

type GroupOwnershipRegistryLike = {
  getGroupOwnershipEntry?: (groupId: string) => GroupOwnershipEntry | undefined;
  reclaimGroupOwnership?: (groupId: string, actor: ControlPlaneActor) => GroupOwnershipEntry;
  releaseGroupOwnership?: (groupId: string, actorId: string) => GroupOwnershipEntry | undefined;
  archiveGroupOwnership?: (groupId: string) => GroupOwnershipEntry;
  restoreGroupOwnership?: (groupId: string) => GroupOwnershipEntry;
};

export function isRootStopAll(message: MessageWithoutServerTimestamp): boolean {
  if (!isNonSystemMutatingCommandMessage(message)) return false;
  return (
    message.role === 'root' &&
    message.actor === 'root' &&
    message.scopeGroupId === ROOT_EMERGENCY_SCOPE_GROUP_ID &&
    message.type === 'control' &&
    message.action === 'shutdown' &&
    message.target.mode === 'all'
  );
}

export function enforceGroupOwnership(input: {
  message: MessageWithoutServerTimestamp;
  registry: GroupOwnershipRegistryLike;
  commandName: (message: MessageWithoutServerTimestamp) => string;
}): ValidationRejectReason | null {
  const { message, registry, commandName } = input;
  if (!isNonSystemMutatingCommandMessage(message) || isRootStopAll(message)) return null;
  if (message.target.mode !== 'group') return null;

  const role = normalizeControlPlaneRole(message.role);
  const actor = createControlPlaneActor({ id: message.actor, role });
  const command = commandName(message);
  const groupId = message.scopeGroupId;
  const entry = registry.getGroupOwnershipEntry?.(groupId);

  if (command === 'reclaim') {
    if (!entry?.transferable) return createPolicyDeny(message, 'group is not transferable');
    registry.reclaimGroupOwnership?.(groupId, actor);
    return null;
  }
  if (command === 'release') {
    if (entry?.owner.actorId !== actor.id && role !== 'root')
      return createPolicyDeny(message, 'only the current Group owner can release ownership');
    registry.releaseGroupOwnership?.(groupId, actor.id);
    return null;
  }
  if (command === 'archive') {
    if (entry?.owner.actorId !== actor.id && role !== 'root')
      return createPolicyDeny(message, 'only the Group owner can archive the Group');
    registry.archiveGroupOwnership?.(groupId);
    return null;
  }
  if (command === 'restore') {
    if (entry?.owner.actorId !== actor.id && role !== 'root')
      return createPolicyDeny(message, 'only the Group owner can restore the Group');
    registry.restoreGroupOwnership?.(groupId);
    return null;
  }
  if (entry && entry.owner.actorId !== actor.id && role !== 'root') {
    if (role === 'client') {
      return createPolicyRejectReason({
        actor: message.actor ?? ('from' in message ? message.from : 'unknown'),
        scope: 'server.ingress.clientControlTransfer',
        type: message.type,
        path: 'transferId',
        code: 'server.policy.client_transfer_required',
        message: 'accepted client control transfer capability is required',
      });
    }
    return createPolicyDeny(message, `Group is ${entry.visibility.defaultAccess}; actor is not the owner`);
  }
  return null;
}

function normalizeControlPlaneRole(role: string): ControlPlaneActorRole {
  return role === 'root' || role === 'manager' || role === 'client' || role === 'service' || role === 'ai'
    ? role
    : 'client';
}

function createPolicyDeny(
  message: MessageWithoutServerTimestamp & { actor?: string },
  reason: string
): ValidationRejectReason {
  return createPolicyRejectReason({
    actor: message.actor ?? ('from' in message ? message.from : 'unknown'),
    scope: 'server.ingress.groupOwnership',
    type: message.type,
    path: 'scopeGroupId',
    code: 'server.policy.ownership_denied',
    message: reason,
  });
}
