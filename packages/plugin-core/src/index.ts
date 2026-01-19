export type PluginMeta = {
  pluginId: string;
  version?: string;
  displayName?: string;
  capabilities?: string[];
};

export type PluginCommandMessage<Payload = unknown, Command extends string = string> = {
  pluginId: string;
  command: Command;
  payload?: Payload;
  scopeGroupId?: string;
};

export type PluginContext = {
  scopeGroupId?: string;
  send: (msg: PluginCommandMessage) => void;
};

export type PluginInstance = {
  dispose?: () => void;
  onCommand?: (msg: PluginCommandMessage) => void;
};

export type PluginFactory = (ctx: PluginContext) => PluginInstance;

export type DefinedPlugin = {
  meta: PluginMeta;
  create: PluginFactory;
};

export function definePlugin(meta: PluginMeta, create: PluginFactory): DefinedPlugin {
  return { meta, create };
}

export function makePluginCommand<Payload = unknown, Command extends string = string>(
  pluginId: string,
  command: Command,
  payload?: Payload,
  scopeGroupId?: string
): PluginCommandMessage<Payload, Command> {
  const id = String(pluginId ?? '').trim();
  const cmd = String(command ?? '').trim();
  const scope = typeof scopeGroupId === 'string' ? scopeGroupId.trim() : '';

  const out: PluginCommandMessage<Payload, Command> = {
    pluginId: id,
    command: cmd as Command,
  };
  if (payload !== undefined) out.payload = payload;
  if (scope) out.scopeGroupId = scope;
  return out;
}
