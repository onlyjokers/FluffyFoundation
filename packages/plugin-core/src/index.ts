/**
 * Purpose: Shared plugin lifecycle, registry, and host contracts for FF-17.
 */

export type PluginSideEffect = 'none' | 'audio' | 'visual' | 'media' | 'network' | 'filesystem' | 'state';

export type PluginResourceBudget = {
  memoryMb?: number;
  cpuMsPerTick?: number;
  networkKbps?: number;
};

export type PluginManifest = {
  id: string;
  version: string;
  apiVersion: number;
  capabilities: string[];
  supportedProtocolVersions: number[];
  resourceBudget?: PluginResourceBudget;
  sideEffects: PluginSideEffect[];
  description?: string;
};

export type PluginCompatibility = {
  protocolVersion: number;
  hostApiVersion: number;
};

export type PluginCommandEnvelope = {
  kind: 'plugin-command';
  command: string;
  payload?: Record<string, unknown>;
};

export type PluginEventEnvelope = {
  kind: 'plugin-event';
  name: string;
  payload?: Record<string, unknown>;
};

export type PluginLifecycleState = 'loaded' | 'initialized' | 'started' | 'stopped' | 'failed' | 'disposed';

export type PluginStatus = {
  id: string;
  version: string;
  state: PluginLifecycleState;
  capabilities: string[];
  sideEffects: PluginSideEffect[];
  resourceBudget?: PluginResourceBudget;
  lastError?: string;
};

export type PluginContext<CoreState extends Record<string, unknown> = Record<string, unknown>> = {
  manifest: PluginManifest;
  compatibility: PluginCompatibility;
  state: { readonly core: Readonly<CoreState> };
  emitCommand: (command: PluginCommandEnvelope) => void;
  emitEvent: (event: PluginEventEnvelope) => void;
};

export type PluginInstance<Options = unknown> = {
  load?: () => void | Promise<void>;
  init?: (options?: Options) => void | Promise<void>;
  start?: () => void | Promise<void>;
  stop?: () => void | Promise<void>;
  configure?: (options?: Options) => void | Promise<void>;
  dispose?: () => void | Promise<void>;
};

export type PluginFactory<Options = unknown, CoreState extends Record<string, unknown> = Record<string, unknown>> = (
  context: PluginContext<CoreState>
) => PluginInstance<Options>;

export type DefinedPlugin<Options = unknown, CoreState extends Record<string, unknown> = Record<string, unknown>> = {
  manifest: PluginManifest;
  create: PluginFactory<Options, CoreState>;
};

export type PluginRegistry = {
  register: <Options = unknown, CoreState extends Record<string, unknown> = Record<string, unknown>>(
    plugin: DefinedPlugin<Options, CoreState>
  ) => void;
  list: () => Array<DefinedPlugin<unknown, Record<string, unknown>>>;
  get: (id: string) => DefinedPlugin<unknown, Record<string, unknown>> | undefined;
  discover: (compatibility: PluginCompatibility) => Array<DefinedPlugin<unknown, Record<string, unknown>>>;
};

export type PluginHostStatus = PluginStatus & { loadedAt: number; updatedAt: number };

export type PluginHostResult = {
  status: PluginHostStatus;
  rollback?: { applied: boolean; reason?: string };
};

export type PluginHostOptions<CoreState extends Record<string, unknown> = Record<string, unknown>> = {
  protocolVersion: number;
  hostApiVersion: number;
  registry?: PluginRegistry;
  coreState?: CoreState;
  commandSink?: (command: PluginCommandEnvelope) => void;
  eventSink?: (event: PluginEventEnvelope) => void;
};

type PluginRecord = {
  manifest: PluginManifest;
  instance: PluginInstance | null;
  status: PluginHostStatus;
  coreState: Record<string, unknown>;
};

const cloneRecord = <T extends Record<string, unknown>>(input: T): T =>
  JSON.parse(JSON.stringify(input ?? {})) as T;

const freezeDeep = <T>(input: T): Readonly<T> => {
  if (input === null || typeof input !== 'object') return input;
  const record = input as Record<string, unknown>;
  for (const value of Object.values(record)) {
    freezeDeep(value);
  }
  return Object.freeze(record) as Readonly<T>;
};

const now = () => Date.now();

export function definePlugin<
  Options = unknown,
  CoreState extends Record<string, unknown> = Record<string, unknown>
>(manifest: PluginManifest, create: PluginFactory<Options, CoreState>): DefinedPlugin<Options, CoreState> {
  return { manifest, create };
}

export function isPluginCompatible(manifest: PluginManifest, compatibility: PluginCompatibility): boolean {
  return manifest.apiVersion === compatibility.hostApiVersion &&
    manifest.supportedProtocolVersions.includes(compatibility.protocolVersion);
}

export function createPluginRegistry(initial: Iterable<DefinedPlugin> = []): PluginRegistry {
  const plugins = new Map<string, DefinedPlugin<unknown, Record<string, unknown>>>();
  for (const plugin of initial) {
    plugins.set(plugin.manifest.id, plugin as DefinedPlugin<unknown, Record<string, unknown>>);
  }
  return {
    register(plugin) {
      plugins.set(plugin.manifest.id, plugin as DefinedPlugin<unknown, Record<string, unknown>>);
    },
    list() {
      return [...plugins.values()];
    },
    get(id) {
      return plugins.get(id);
    },
    discover(compatibility) {
      return [...plugins.values()].filter((plugin) => isPluginCompatible(plugin.manifest, compatibility));
    },
  };
}

export function createPluginHost<CoreState extends Record<string, unknown> = Record<string, unknown>>(
  options: PluginHostOptions<CoreState>
) {
  const registry = options.registry ?? createPluginRegistry();
  const commandSink = options.commandSink ?? (() => void 0);
  const eventSink = options.eventSink ?? (() => void 0);
  const coreState = cloneRecord(options.coreState ?? ({} as CoreState));
  const records = new Map<string, PluginRecord>();

  const createStatus = (manifest: PluginManifest, state: PluginLifecycleState, extra?: Partial<PluginHostStatus>): PluginHostStatus => ({
    id: manifest.id,
    version: manifest.version,
    state,
    capabilities: [...manifest.capabilities],
    sideEffects: [...manifest.sideEffects],
    resourceBudget: manifest.resourceBudget ? { ...manifest.resourceBudget } : undefined,
    loadedAt: now(),
    updatedAt: now(),
    ...extra,
  });

  const getRecord = (id: string): PluginRecord | null => records.get(id) ?? null;

  const createContext = (manifest: PluginManifest): PluginContext<CoreState> => ({
    manifest,
    compatibility: {
      protocolVersion: options.protocolVersion,
      hostApiVersion: options.hostApiVersion,
    },
    state: { core: freezeDeep(cloneRecord(coreState)) },
    emitCommand: (command) => commandSink(command),
    emitEvent: (event) => eventSink(event),
  });

  const disposeRecord = async (record: PluginRecord): Promise<void> => {
    try {
      await record.instance?.stop?.();
    } catch {
      // stop failures are contained by the host
    }
    try {
      await record.instance?.dispose?.();
    } finally {
      record.status = {
        ...record.status,
        state: 'disposed',
        updatedAt: now(),
      };
      record.instance = null;
    }
  };

  const activate = async (id: string, initOptions?: unknown): Promise<PluginHostResult> => {
    const defined = registry.get(id);
    if (!defined) {
      const manifest: PluginManifest = { id, version: '0.0.0', apiVersion: 0, capabilities: [], supportedProtocolVersions: [], sideEffects: ['none'] };
      const status = createStatus(manifest, 'failed', { lastError: 'plugin not found' });
      return { status, rollback: { applied: false, reason: 'plugin not found' } };
    }

    if (!isPluginCompatible(defined.manifest, { protocolVersion: options.protocolVersion, hostApiVersion: options.hostApiVersion })) {
      const status = createStatus(defined.manifest, 'failed', { lastError: 'plugin is incompatible with the host' });
      return { status, rollback: { applied: false, reason: 'plugin is incompatible with the host' } };
    }

    const record: PluginRecord = {
      manifest: defined.manifest,
      instance: null,
      status: createStatus(defined.manifest, 'loaded'),
      coreState: cloneRecord(coreState),
    };
    records.set(id, record);

    try {
      const instance = defined.create(createContext(defined.manifest));
      record.instance = instance;
      await instance.load?.();
      record.status = { ...record.status, state: 'loaded', updatedAt: now() };
      await instance.init?.(initOptions);
      record.status = { ...record.status, state: 'initialized', updatedAt: now() };
      await instance.start?.();
      record.status = { ...record.status, state: 'started', updatedAt: now() };
      return { status: record.status };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      record.status = { ...record.status, state: 'failed', lastError: message, updatedAt: now() };
      await disposeRecord(record);
      record.status = { ...record.status, state: 'failed', lastError: message, updatedAt: now() };
      return { status: record.status, rollback: { applied: true, reason: message } };
    }
  };

  return {
    discover: (compatibility: PluginCompatibility) => registry.discover(compatibility),
    activate,
    configure: async (id: string, options?: unknown): Promise<PluginHostResult> => {
      const record = getRecord(id);
      if (!record || !record.instance) {
        throw new Error(`plugin not active: ${id}`);
      }
      try {
        await record.instance.configure?.(options);
        record.status = { ...record.status, state: 'started', updatedAt: now() };
        return { status: record.status };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        record.status = { ...record.status, state: 'failed', lastError: message, updatedAt: now() };
        await disposeRecord(record);
        record.status = { ...record.status, state: 'failed', lastError: message, updatedAt: now() };
        return { status: record.status, rollback: { applied: true, reason: message } };
      }
    },
    start: async (id: string): Promise<PluginHostResult> => {
      const record = getRecord(id);
      if (!record || !record.instance) throw new Error(`plugin not active: ${id}`);
      await record.instance.start?.();
      record.status = { ...record.status, state: 'started', updatedAt: now() };
      return { status: record.status };
    },
    stop: async (id: string): Promise<PluginHostResult> => {
      const record = getRecord(id);
      if (!record || !record.instance) throw new Error(`plugin not active: ${id}`);
      await record.instance.stop?.();
      record.status = { ...record.status, state: 'stopped', updatedAt: now() };
      return { status: record.status };
    },
    dispose: async (id: string): Promise<PluginHostResult> => {
      const record = getRecord(id);
      if (!record) throw new Error(`plugin not active: ${id}`);
      await disposeRecord(record);
      return { status: record.status };
    },
    getStatus: (id: string): PluginHostStatus | null => getRecord(id)?.status ?? null,
    snapshot: () => ({ core: freezeDeep(cloneRecord(coreState)) }),
    registry,
  };
}
