/**
 * Purpose: Bridge manager-side JSON specs to node-core runtime implementations.
 */
import { get } from 'svelte/store';
import { NodeRegistry as CoreNodeRegistry, registerDefaultNodeDefinitions, type LatestSensorDataLike } from '@shugu/node-core';
import type { NodeDefinition } from '../../types';
import { getSDK, sensorData, state } from '$lib/stores/manager';
import { targetManagedClient } from './client-target';

export type CoreRuntimeImpl = Pick<NodeDefinition, 'process' | 'onSink'>;

export const coreRuntimeImplByKind: Map<string, CoreRuntimeImpl> = (() => {
  const registry = new CoreNodeRegistry();

  registerDefaultNodeDefinitions(registry, {
    // Manager-side: resolve clientId from node config.
    getClientId: () => null,
    getSensorForClientId: (clientId) => {
      if (!clientId) return null;
      const data = get(sensorData).get(clientId);
      if (!data) return null;
      return {
        ...data,
        clientTimestamp: data.clientTimestamp ?? data.serverTimestamp,
      } satisfies LatestSensorDataLike;
    },
    getAllClientIds: () =>
      (get(state).clients ?? [])
        .filter((client) => client.group !== 'display')
        .map((client) => String(client.clientId ?? ''))
        .filter(Boolean),
    getClientPermissions: (clientId) => {
      const client = (get(state).clients ?? []).find((entry) => String(entry.clientId ?? '') === clientId);
      return client?.permissions ?? null;
    },
    getClientUrlSessionId: (clientId) => {
      const client = (get(state).clients ?? []).find((entry) => String(entry.clientId ?? '') === clientId);
      return typeof client?.urlSessionId === 'string' ? client.urlSessionId : null;
    },
    isAudienceClient: (clientId) => {
      const client = (get(state).clients ?? []).find((entry) => String(entry.clientId ?? '') === clientId);
      return client?.group !== 'display';
    },
    executeCommand: () => {
      // Manager always routes via executeCommandForClientId.
    },
    executeCommandForClientId: (clientId, cmd) => {
      const target = targetManagedClient(clientId);
      if (!target) return;
      const sdk = getSDK();
      if (!sdk) return;
      sdk.sendControl(target, cmd.action, cmd.payload ?? {}, cmd.executeAt);
    },
    audioAssets: {},
  });

  const pick = (type: string): CoreRuntimeImpl => {
    const def = registry.get(type);
    if (!def) {
      throw new Error(`[node-specs] missing core runtime impl: ${type}`);
    }
    return { process: def.process, onSink: def.onSink };
  };

  return new Map<string, CoreRuntimeImpl>([
    ['client-loader', pick('client-loader')],
    ['client-executor', pick('client-executor')],
    ['url-session', pick('url-session')],
    ['url-to-qr-generator', pick('url-to-qr-generator')],
    ['client-permission-filter', pick('client-permission-filter')],
    ['client-url-session-filter', pick('client-url-session-filter')],
    ['proc-client-sensors', pick('proc-client-sensors')],
    ['float', pick('float')],
    ['int', pick('int')],
    ['number-stabilizer', pick('number-stabilizer')],
    ['math', pick('math')],
    ['logic-add', pick('logic-add')],
    ['logic-multiple', pick('logic-multiple')],
    ['logic-subtract', pick('logic-subtract')],
    ['logic-divide', pick('logic-divide')],
    ['logic-if', pick('logic-if')],
    ['logic-for', pick('logic-for')],
    ['logic-sleep', pick('logic-sleep')],
    ['number-script', pick('number-script')],
    ['client-count', pick('client-count')],
    ['array-filter', pick('array-filter')],
    ['tone-osc', pick('tone-osc')],
    ['tone-delay', pick('tone-delay')],
    ['tone-resonator', pick('tone-resonator')],
    ['tone-pitch', pick('tone-pitch')],
    ['tone-reverb', pick('tone-reverb')],
    ['tone-granular', pick('tone-granular')],
    ['play-media', pick('play-media')],
  ]);
})();
