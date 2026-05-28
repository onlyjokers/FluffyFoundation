/**
 * Purpose: Register node-core default runtime definitions into the manager registry.
 */
import { get } from 'svelte/store';
import { createArduinoUnoNodeDefinitions } from '@shugu/arduino-uno-plugin';
import { createPrinterNodeDefinitions } from '@shugu/printer-plugin';
import { registerDefaultNodeDefinitions, type LatestSensorDataLike, type NodeCommand } from '@shugu/node-core';
import { nodeRegistry } from '../../registry';
import { clientScreenshotUploads, clientUiInteractions, getSDK, sensorData, state } from '$lib/stores/manager';
import { createManagerAudioAssetNodeDeps } from './audio-asset-node-deps';
import { targetManagedClient } from './client-target';
import { createManagerImageAssetNodeDeps } from './image-asset-node-deps';

export function registerDefaultRuntimeNodes(): void {
  registerDefaultNodeDefinitions(nodeRegistry, {
  // Manager-side: client selection is resolved by Client Loader.
  getClientId: () => null,
  // Client Loader selection should only enumerate audience clients; Display has its own `display-object` node.
  getAllClientIds: () =>
    (get(state).clients ?? [])
      .filter((c) => String(c?.group ?? '') !== 'display' && c?.connected !== false)
      .map((c) => String(c?.clientId ?? ''))
      .filter(Boolean),
  getClientConnectionKey: (clientId) => {
    const client = (get(state).clients ?? []).find(
      (entry) => String(entry?.clientId ?? '') === String(clientId ?? '')
    );
    const connectedAt = client?.connectedAt;
    return typeof connectedAt === 'number' && Number.isFinite(connectedAt)
      ? String(connectedAt)
      : null;
  },
  // Decouple Node Graph client targeting from Manager UI "selected clients".
  // Client targeting must be driven by the graph itself (client-loader inputs/config).
  getSelectedClientIds: () => [],
  getSensorForClientId: (clientId: string) => {
    if (!clientId) return null;
    const data = get(sensorData).get(clientId);
    if (!data) return null;
    return {
      ...data,
      clientTimestamp: data.clientTimestamp ?? data.serverTimestamp,
    } satisfies LatestSensorDataLike;
  },
  getImageForClientId: (clientId: string) => {
    if (!clientId) return null;
    return get(clientScreenshotUploads).get(clientId)?.dataUrl ?? null;
  },
  getClientPermissions: (clientId: string) => {
    if (!clientId) return null;
    const client = (get(state).clients ?? []).find((entry) => String(entry?.clientId ?? '') === clientId);
    return client?.permissions ?? null;
  },
  getClientUrlSessionId: (clientId: string) => {
    if (!clientId) return null;
    const client = (get(state).clients ?? []).find((entry) => String(entry?.clientId ?? '') === clientId);
    return typeof client?.urlSessionId === 'string' ? client.urlSessionId : null;
  },
  isAudienceClient: (clientId: string) => {
    const client = (get(state).clients ?? []).find((entry) => String(entry?.clientId ?? '') === clientId);
    return String(client?.group ?? '') !== 'display';
  },
  executeCommand: () => {
    // Manager always routes via executeCommandForClientId.
  },
  executeCommandForClientId: (clientId: string, cmd: NodeCommand) => {
    const target = targetManagedClient(clientId);
    if (!target) return;
    const sdk = getSDK();
    if (!sdk) return;
    sdk.sendControl(target, cmd.action, cmd.payload ?? {}, cmd.executeAt);
  },
  clientUi: {
    getClientUiState: (nodeId: string) => {
      const state = get(clientUiInteractions).get(String(nodeId));
      if (!state) return null;
      return {
        displayed: true,
        kind: state.kind,
        pressed: state.pressed,
        inputContent: state.inputContent,
        firstInputed: state.firstInputed,
      };
    },
    consumeClientButtonPressed: (nodeId: string) => {
      const id = String(nodeId ?? '').trim();
      if (!id) return false;
      let pressed = false;
      clientUiInteractions.update((prev) => {
        const current = prev.get(id);
        pressed = Boolean(current?.pressed);
        if (!current || !pressed) return prev;
        const next = new Map(prev);
        next.set(id, { ...current, pressed: false });
        return next;
      });
      return pressed;
    },
  },
  audioAssets: createManagerAudioAssetNodeDeps({
    onAssetReady: () => {
      void import('../../engine').then(({ nodeEngine }) => {
        nodeEngine.pulseRuntime('audio-asset-ready');
      });
    },
  }),
  imageAssets: createManagerImageAssetNodeDeps({
    onAssetReady: () => {
      void import('../../engine').then(({ nodeEngine }) => {
        nodeEngine.pulseRuntime('image-asset-ready');
      });
    },
  }),
  });
  for (const definition of createArduinoUnoNodeDefinitions()) {
    nodeRegistry.register(definition);
  }
  for (const definition of createPrinterNodeDefinitions()) {
    nodeRegistry.register(definition);
  }
}
