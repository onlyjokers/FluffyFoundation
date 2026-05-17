/**
 * Purpose: Wire Display server transport subscriptions and node executor integration.
 */
import type { Writable } from 'svelte/store';
import type { MultimediaCore } from '@shugu/multimedia-core';
import type {
  ControlAction,
  ControlPayload,
  MediaMetaMessage,
  PlayMediaPayload,
  PluginControlMessage,
} from '@shugu/protocol';
import type { GraphChange } from '@shugu/node-core';
import { ClientSDK, NodeExecutor, type ClientState, type NodeCommand } from '@shugu/sdk-client';
import { applyDisplayAssetManifest } from '../display-asset-manifest';
import { applyGraphChangesToExecutor } from '../graph-change-consumer';
import { getOrCreateDisplayIdentity, persistAssignedClientId } from './identity';
import {
  parseDisplayFileId,
  resolveDisplayFileUrl,
  warnMissingDisplayLocalMedia,
} from './local-media';
import { shouldApplyDisplayServerMessages } from './transport-mode';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

export type DisplayServerTransportDeps = {
  serverUrl: string;
  serverState: Writable<ClientState>;
  getTransportDecision: () => 'uninitialized' | 'pending' | 'local' | 'server';
  getMultimediaCore: () => MultimediaCore | null;
  executeControl: (action: ControlAction, payload: ControlPayload, executeAtLocal?: number) => void;
  reportReadyIfPossible: () => void;
};

export type DisplayServerTransport = {
  sdk: ClientSDK;
  nodeExecutor: NodeExecutor;
  unsubs: {
    sdk: () => void;
    control: () => void;
    plugin: () => void;
    media: () => void;
  };
};

export function createDisplayServerTransport(
  deps: DisplayServerTransportDeps
): DisplayServerTransport {
  const sdk = new ClientSDK({
    serverUrl: deps.serverUrl,
    identity: getOrCreateDisplayIdentity() ?? undefined,
    query: { group: 'display' },
  });

  const sdkUnsub = sdk.onStateChange((s) => {
    deps.serverState.set(s);
    if (s.clientId) {
      persistAssignedClientId(s.clientId);
    }
    deps.reportReadyIfPossible();
  });

  const controlUnsub = sdk.onControl((message) => {
    if (!shouldApplyDisplayServerMessages(deps.getTransportDecision())) return;
    const executeAtLocal = toLocalExecuteAt(message.executeAt, sdk.getOffset());
    deps.executeControl(message.action, message.payload, executeAtLocal);
  });

  const nodeExecutor = new NodeExecutor(
    sdk,
    (cmd: NodeCommand) => {
      const executeAtLocal = toLocalExecuteAt(cmd.executeAt, sdk.getOffset());
      deps.executeControl(cmd.action, cmd.payload, executeAtLocal);
    },
    {
      resolveAssetRef: (ref: string) => {
        const resolvedDisplayUrl = resolveDisplayFileUrl(ref);
        if (resolvedDisplayUrl) return resolvedDisplayUrl;

        const displayFileId = parseDisplayFileId(ref);
        if (displayFileId) {
          warnMissingDisplayLocalMedia(ref);
          return '';
        }

        return deps.getMultimediaCore()?.resolveAssetRef(ref) ?? ref;
      },
    }
  );

  const handleAssetManifest = (payload: Record<string, unknown> | undefined) => {
    applyDisplayAssetManifest(payload, deps.getMultimediaCore);
  };

  const pluginUnsub = sdk.onPluginControl((message: PluginControlMessage) => {
    if (!shouldApplyDisplayServerMessages(deps.getTransportDecision())) return;
    if (message.pluginId === 'node-executor') {
      handleNodeExecutorPluginMessage(nodeExecutor, message);
      return;
    }

    if (message.pluginId === 'multimedia-core' && message.command === 'configure') {
      handleAssetManifest(message.payload);
      return;
    }

    console.info('[Display] plugin noop:', message.pluginId, message.command);
  });

  const mediaUnsub = sdk.onMedia((message: MediaMetaMessage) => {
    if (!shouldApplyDisplayServerMessages(deps.getTransportDecision())) return;
    const payload = createPlayMediaPayload(message);
    deps.executeControl('playMedia', payload, toLocalExecuteAt(message.executeAt, sdk.getOffset()));
  });

  return {
    sdk,
    nodeExecutor,
    unsubs: {
      sdk: sdkUnsub,
      control: controlUnsub,
      plugin: pluginUnsub,
      media: mediaUnsub,
    },
  };
}

function handleNodeExecutorPluginMessage(
  nodeExecutor: NodeExecutor,
  message: PluginControlMessage
): void {
  if (message.command === 'graph-changes') {
    const payloadRecord = asRecord(message.payload);
    const rawChanges = payloadRecord?.changes;
    const changes = Array.isArray(rawChanges) ? (rawChanges as GraphChange[]) : [];
    applyGraphChangesToExecutor(nodeExecutor, changes);
    return;
  }
  nodeExecutor.handlePluginControl(message);
}

function createPlayMediaPayload(message: MediaMetaMessage): PlayMediaPayload {
  const options = message.options ?? {};
  return {
    url: message.url,
    mediaType: message.mediaType,
    loop: options.loop,
    volume: options.volume,
    muted: message.mediaType === 'video' ? true : undefined,
  };
}

function toLocalExecuteAt(value: unknown, offset: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value - offset : undefined;
}
