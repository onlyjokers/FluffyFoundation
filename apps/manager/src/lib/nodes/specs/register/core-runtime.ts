/**
 * Purpose: Bridge manager-side JSON specs to node-core runtime implementations.
 */
import { get } from 'svelte/store';
import { NodeRegistry as CoreNodeRegistry, registerDefaultNodeDefinitions } from '@shugu/node-core';
import type { NodeDefinition } from '../../types';
import { getSDK, sensorData } from '$lib/stores/manager';
import { targetManagedClient } from './client-target';

export type CoreRuntimeImpl = Pick<NodeDefinition, 'process' | 'onSink'>;

export const coreRuntimeImplByKind: Map<string, CoreRuntimeImpl> = (() => {
  const registry = new CoreNodeRegistry();

  registerDefaultNodeDefinitions(registry, {
    // Manager-side: resolve clientId from node config.
    getClientId: () => null,
    getSensorForClientId: (clientId) => {
      if (!clientId) return null;
      return get(sensorData).get(clientId) ?? null;
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
  });

  const pick = (type: string): CoreRuntimeImpl => {
    const def = registry.get(type);
    if (!def) {
      throw new Error(`[node-specs] missing core runtime impl: ${type}`);
    }
    return { process: def.process, onSink: def.onSink };
  };

  return new Map<string, CoreRuntimeImpl>([
    ['client-object', pick('client-object')],
    ['proc-client-sensors', pick('proc-client-sensors')],
    ['number', pick('number')],
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
