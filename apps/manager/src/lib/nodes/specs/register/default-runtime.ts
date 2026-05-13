/**
 * Purpose: Register node-core default runtime definitions into the manager registry.
 */
import { get } from 'svelte/store';
import { targetClients } from '@shugu/protocol';
import { registerDefaultNodeDefinitions, type NodeCommand } from '@shugu/node-core';
import { nodeRegistry } from '../../registry';
import { clientScreenshotUploads, getSDK, sensorData, state } from '$lib/stores/manager';

export function registerDefaultRuntimeNodes(): void {
  registerDefaultNodeDefinitions(nodeRegistry, {
  // Manager-side: resolve clientId from node config.
  getClientId: () => null,
  // Client node selection should only enumerate audience clients; Display has its own `display-object` node.
  getAllClientIds: () =>
    (get(state).clients ?? [])
      .filter((c) => String(c?.group ?? '') !== 'display')
      .map((c) => String(c?.clientId ?? ''))
      .filter(Boolean),
  // Decouple Node Graph client targeting from Manager UI "selected clients".
  // Client targeting must be driven by the graph itself (client-object inputs/config).
  getSelectedClientIds: () => [],
  getSensorForClientId: (clientId: string) => {
    if (!clientId) return null;
    return get(sensorData).get(clientId) ?? null;
  },
  getImageForClientId: (clientId: string) => {
    if (!clientId) return null;
    return get(clientScreenshotUploads).get(clientId)?.dataUrl ?? null;
  },
  executeCommand: () => {
    // Manager always routes via executeCommandForClientId.
  },
  executeCommandForClientId: (clientId: string, cmd: NodeCommand) => {
    if (!clientId) return;
    const sdk = getSDK();
    if (!sdk) return;
    sdk.sendControl(targetClients([clientId]), cmd.action, cmd.payload ?? {}, cmd.executeAt);
  },
  });
}
