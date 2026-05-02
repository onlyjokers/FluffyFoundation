/**
 * Purpose: normalize optional manager-side state fields that are not part of the SDK base state.
 */

export type ControlPlaneOwnershipEntry = {
  ownerStack?: unknown;
};

export type ControlPlaneOwnership = Record<string, ControlPlaneOwnershipEntry>;

function isControlPlaneOwnershipEntry(value: unknown): value is ControlPlaneOwnershipEntry {
  return typeof value === 'object' && value !== null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function getControlPlaneOwnership(state: unknown): ControlPlaneOwnership {
  const stateRecord = asRecord(state);
  const controlPlane = asRecord(stateRecord?.controlPlane);
  const ownership = controlPlane?.ownership;
  if (!ownership || typeof ownership !== 'object' || Array.isArray(ownership)) return {};

  const out: ControlPlaneOwnership = {};
  for (const [groupId, entry] of Object.entries(ownership)) {
    if (isControlPlaneOwnershipEntry(entry)) {
      out[String(groupId)] = entry;
    }
  }
  return out;
}
