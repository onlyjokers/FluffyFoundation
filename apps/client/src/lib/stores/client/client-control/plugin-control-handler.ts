/**
 * Purpose: Handle client plugin-control messages without bloating the main control dispatcher.
 */
import type { GraphChange } from '@shugu/node-core';
import type { PluginControlMessage } from '@shugu/protocol';
import { applyGraphChangesToExecutor } from '../graph-change-consumer';
import { applyMultimediaManifestPayload } from '../client-plugin-control';
import type { ClientControlDeps, WindowE2E } from './types';
import { asRecord } from './types';

export function handlePluginControlMessage(deps: ClientControlDeps, message: PluginControlMessage): void {
  // Calculate and log message size
  try {
    const messageJson = JSON.stringify(message);
    const messageSizeBytes = new Blob([messageJson]).size;
    const messageSizeKB = (messageSizeBytes / 1024).toFixed(2);

    console.log(
      `[Plugin] ${message.pluginId} ${message.command} | Size: ${messageSizeBytes} bytes (${messageSizeKB} KB)`
    );
  } catch (err) {
    console.log('[Client] Plugin control:', message.pluginId, message.command);
  }

  if (message.pluginId === 'node-executor') {
    if (message.command === 'graph-changes') {
      const payloadRecord = asRecord(message.payload);
      const rawChanges = payloadRecord?.changes;
      const changes = Array.isArray(rawChanges) ? (rawChanges as GraphChange[]) : [];
      applyGraphChangesToExecutor(deps.getNodeExecutor(), changes);
      return;
    }
    deps.getNodeExecutor()?.handlePluginControl(message);
    return;
  }
  if (message.pluginId === 'multimedia-core' && message.command === 'configure') {
    const payloadRecord = asRecord(message.payload) ?? {};
    const manifestId = typeof payloadRecord.manifestId === 'string' ? payloadRecord.manifestId : '';
    const assets = Array.isArray(payloadRecord.assets) ? payloadRecord.assets.map(String) : [];
    const updatedAt =
      typeof payloadRecord.updatedAt === 'number' && Number.isFinite(payloadRecord.updatedAt)
        ? payloadRecord.updatedAt
        : undefined;
    if (!manifestId) return;

    if (
      import.meta.env.DEV &&
      typeof window !== 'undefined' &&
      (window as WindowE2E).__SHUGU_E2E
    ) {
      const win = window as WindowE2E;
      const entry = { at: Date.now(), manifestId, assets, updatedAt };
      win.__SHUGU_E2E_LAST_MANIFEST = entry;
      const list = (win.__SHUGU_E2E_MANIFESTS ??= []);
      list.push(entry);
      if (list.length > 50) list.splice(0, list.length - 50);
    }

    applyMultimediaManifestPayload(payloadRecord, deps.getMultimediaCore);
  }
}
