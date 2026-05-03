/**
 * Purpose: Own server-local FF-12 Group ownership state for ControlPlane snapshots and policy hooks.
 */
import {
  createControlPlaneActor,
  createGroupOwnershipEntry,
  type ControlPlaneActor,
  type GroupOwnershipEntry,
} from '@shugu/protocol';

export class GroupOwnershipRegistry {
  private readonly groupOwnership: Map<string, GroupOwnershipEntry> = new Map();

  get(groupId: string): GroupOwnershipEntry | undefined {
    return this.groupOwnership.get(groupId);
  }

  getAll(): GroupOwnershipEntry[] {
    return Array.from(this.groupOwnership.values()).map((entry) => ({
      ...entry,
      owner: { ...entry.owner, capabilities: [...entry.owner.capabilities] },
      ownerStack: entry.ownerStack.map((owner) => ({
        ...owner,
        capabilities: [...owner.capabilities],
      })),
      selectedClientIds: [...entry.selectedClientIds],
      visibility: { ...entry.visibility },
    }));
  }

  reclaim(groupId: string, owner: ControlPlaneActor): GroupOwnershipEntry {
    const existing = this.ensure(groupId);
    const next = createGroupOwnershipEntry({
      ...existing,
      owner,
      ownerStack: [...existing.ownerStack, existing.owner],
    });
    this.groupOwnership.set(groupId, next);
    return next;
  }

  release(groupId: string, actorId: string): GroupOwnershipEntry | undefined {
    const existing = this.groupOwnership.get(groupId);
    if (!existing || existing.owner.actorId !== actorId) return existing;
    const ownerStack = [...existing.ownerStack];
    const previousOwner = ownerStack.pop();
    if (!previousOwner) return existing;
    const next = createGroupOwnershipEntry({ ...existing, owner: previousOwner, ownerStack });
    this.groupOwnership.set(groupId, next);
    return next;
  }

  archive(groupId: string): GroupOwnershipEntry {
    const next = createGroupOwnershipEntry({ ...this.ensure(groupId), archived: true });
    this.groupOwnership.set(groupId, next);
    return next;
  }

  restore(groupId: string): GroupOwnershipEntry {
    const next = createGroupOwnershipEntry({ ...this.ensure(groupId), archived: false });
    this.groupOwnership.set(groupId, next);
    return next;
  }

  ensure(groupId: string): GroupOwnershipEntry {
    const existing = this.groupOwnership.get(groupId);
    if (existing) return existing;
    const entry = createGroupOwnershipEntry({
      groupId,
      owner: createControlPlaneActor({ id: 'server-process', role: 'service' }),
      transferable: true,
      surface: 'public',
    });
    this.groupOwnership.set(groupId, entry);
    return entry;
  }
}
