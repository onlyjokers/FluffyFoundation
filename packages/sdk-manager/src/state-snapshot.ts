/**
 * Purpose: Reconcile FF-06 server-owned control-plane snapshots into manager SDK state patches.
 */
import type { ClientInfo, ControlPlaneSnapshot, StateStrategyStatus } from '@shugu/protocol';

export type StateSnapshotPatch = {
  clients: ClientInfo[];
  selectedClientIds: string[];
  stateStrategy?: StateStrategyStatus;
  controlPlane?: ControlPlaneSnapshot;
  error: string | null;
};

export function createStateSnapshotPatch(opts: {
  clients: ClientInfo[];
  stateStrategy?: StateStrategyStatus;
  controlPlane?: ControlPlaneSnapshot;
}): StateSnapshotPatch {
  return {
    clients: opts.clients,
    selectedClientIds: opts.controlPlane
      ? opts.controlPlane.selection.selectedClientIds
      : opts.clients.filter((client) => client.selected).map((client) => client.clientId),
    stateStrategy: opts.stateStrategy,
    controlPlane: opts.controlPlane,
    error: opts.controlPlane ? findControlPlaneDivergence(opts.clients, opts.controlPlane) : null,
  };
}

function findControlPlaneDivergence(clients: ClientInfo[], controlPlane: ControlPlaneSnapshot): string | null {
  const registrySelected = clients
    .filter((client) => client.selected)
    .map((client) => client.clientId)
    .sort();
  const snapshotSelected = [...controlPlane.selection.selectedClientIds].sort();

  if (registrySelected.length !== snapshotSelected.length) {
    return 'Control-plane snapshot divergence: selected clients differ from registry clients.';
  }

  return registrySelected.some((id, index) => id !== snapshotSelected[index])
    ? 'Control-plane snapshot divergence: selected clients differ from registry clients.'
    : null;
}
