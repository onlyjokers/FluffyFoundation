/**
 * Purpose: Build FF-06 single-server control-plane snapshots from registry client status.
 */
import type { ClientInfo, ControlPlaneSnapshot } from '@shugu/protocol';
import { SERVER_STATE_STRATEGY } from './state-strategy.js';

export function createControlPlaneSnapshot(clients: ClientInfo[]): ControlPlaneSnapshot {
  const selectedClients = clients
    .filter((client) => client.selected)
    .sort((a, b) => a.clientId.localeCompare(b.clientId));
  const ownership: ControlPlaneSnapshot['ownership'] = {};

  for (const client of selectedClients) {
    const groupId = client.group ?? 'ungrouped';
    const entry = ownership[groupId] ?? { owner: 'server-process' as const, selectedClientIds: [] };
    entry.selectedClientIds.push(client.clientId);
    ownership[groupId] = entry;
  }

  return {
    strategy: SERVER_STATE_STRATEGY,
    selection: {
      selectedClientIds: selectedClients.map((client) => client.clientId),
      revision: createSelectionRevision(selectedClients),
    },
    ownership,
  };
}

function createSelectionRevision(clients: ClientInfo[]): number {
  const signature = clients.map((client) => `${client.group ?? 'ungrouped'}:${client.clientId}`).join('|');
  let hash = 0;
  for (let index = 0; index < signature.length; index++) {
    hash = (hash * 31 + signature.charCodeAt(index)) >>> 0;
  }
  return hash;
}
