/**
 * Purpose: Manager-side plugin catalog state for the Plugins tab.
 */

import { writable } from 'svelte/store';

export type ManagerPluginSideEffect =
  | 'none'
  | 'audio'
  | 'visual'
  | 'media'
  | 'network'
  | 'filesystem'
  | 'state';

export type ManagerPluginResourceBudget = {
  memoryMb?: number;
  cpuMsPerTick?: number;
  networkKbps?: number;
};

export type ManagerPluginState = 'active' | 'inactive' | 'stopped' | 'error';

export type ManagerPluginEntry = {
  id: string;
  version: string;
  apiVersion: number;
  compatible: boolean;
  state: ManagerPluginState;
  capabilities: string[];
  sideEffects: ManagerPluginSideEffect[];
  resourceBudget?: ManagerPluginResourceBudget;
  description?: string;
  lastError?: string;
  lastConfiguredAtRevision?: number;
};

export type ManagerPluginActionResult = {
  ok: boolean;
  reason?: string;
};

export type ManagerPluginStoreSnapshot = {
  revision: number;
  plugins: ManagerPluginEntry[];
};

export type ManagerPluginStore = ReturnType<typeof createManagerPluginStore>;

const MANAGER_PLUGIN_API_VERSION = 1;

const compatibilityErrorFor = (entry: Omit<ManagerPluginEntry, 'compatible' | 'lastError'>): string | undefined =>
  entry.apiVersion === MANAGER_PLUGIN_API_VERSION
    ? undefined
    : `Requires plugin API ${entry.apiVersion}; Manager supports ${MANAGER_PLUGIN_API_VERSION}.`;

const normalizeEntry = (entry: Omit<ManagerPluginEntry, 'compatible'>): ManagerPluginEntry => {
  const error = compatibilityErrorFor(entry);
  return {
    ...entry,
    compatible: !error,
    ...(error ? { lastError: entry.lastError ?? error } : {}),
  };
};

export function createDefaultManagerPluginCatalog(): ManagerPluginEntry[] {
  return [
    normalizeEntry({
      id: 'node-executor',
      version: '1.0.0',
      apiVersion: 1,
      state: 'active',
      capabilities: ['runtime.node-execution', 'runtime.partition.deploy', 'runtime.partition.stop'],
      sideEffects: ['state', 'network'],
      resourceBudget: { memoryMb: 128, cpuMsPerTick: 8 },
      description: 'Deploys validated semantic graph partitions to runtime clients.',
    }),
    normalizeEntry({
      id: 'local-media',
      version: '1.0.0',
      apiVersion: 1,
      state: 'inactive',
      capabilities: ['media.local-file.register', 'media.local-file.clear'],
      sideEffects: ['filesystem', 'media'],
      resourceBudget: { memoryMb: 64 },
      description: 'Registers local media references for Display and client runtime use.',
    }),
    normalizeEntry({
      id: 'multimedia-core',
      version: '1.0.0',
      apiVersion: 1,
      state: 'active',
      capabilities: ['audio.engine.configure', 'asset.manifest.consume'],
      sideEffects: ['audio', 'media'],
      resourceBudget: { memoryMb: 96, cpuMsPerTick: 4 },
      description: 'Coordinates audio engine and multimedia asset manifest behavior.',
    }),
    normalizeEntry({
      id: 'legacy-visual',
      version: '0.9.0',
      apiVersion: 0,
      state: 'inactive',
      capabilities: ['visual.scene'],
      sideEffects: ['visual'],
      description: 'Example incompatible visual plugin kept visible for compatibility diagnostics.',
    }),
  ];
}

export function createManagerPluginStore(initialPlugins: ManagerPluginEntry[]) {
  const { subscribe, update } = writable<ManagerPluginStoreSnapshot>({
    revision: 0,
    plugins: initialPlugins.map((plugin) => ({ ...plugin })),
  });

  const mutatePlugin = (
    id: string,
    mutate: (plugin: ManagerPluginEntry, revision: number) => ManagerPluginEntry
  ): ManagerPluginActionResult => {
    let result: ManagerPluginActionResult = { ok: false, reason: `Plugin not found: ${id}` };
    update((snapshot) => {
      const plugin = snapshot.plugins.find((item) => item.id === id);
      if (!plugin) return snapshot;
      if (!plugin.compatible) {
        const reason = plugin.lastError ?? 'Plugin is incompatible with this Manager.';
        result = { ok: false, reason };
        return {
          revision: snapshot.revision + 1,
          plugins: snapshot.plugins.map((item) =>
            item.id === id ? { ...item, state: 'error', lastError: reason } : item
          ),
        };
      }
      const revision = snapshot.revision + 1;
      result = { ok: true };
      return {
        revision,
        plugins: snapshot.plugins.map((item) => (item.id === id ? mutate(item, revision) : item)),
      };
    });
    return result;
  };

  return {
    subscribe,
    activate: (id: string) =>
      mutatePlugin(id, (plugin) => ({ ...plugin, state: 'active', lastError: undefined })),
    stop: (id: string) =>
      mutatePlugin(id, (plugin) => ({ ...plugin, state: 'stopped', lastError: undefined })),
    configure: (id: string, _options?: Record<string, unknown>) =>
      mutatePlugin(id, (plugin, revision) => ({
        ...plugin,
        lastConfiguredAtRevision: revision,
        lastError: undefined,
      })),
  };
}

export const managerPluginStore = createManagerPluginStore(createDefaultManagerPluginCatalog());
