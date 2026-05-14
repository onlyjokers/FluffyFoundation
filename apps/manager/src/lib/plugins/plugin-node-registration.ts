/**
 * Purpose: Register plugin-provided node definitions through the semantic node registry.
 */

import type { NodeDefinition, NodeRegistry } from '@shugu/node-core';

export type PluginNodeRegistrationInput = {
  pluginId: string;
  definitions: NodeDefinition[];
};

export type PluginNodeRegistrationResult = {
  registered: string[];
  rejected: Array<{ type: string; reason: string }>;
};

const pluginTypePrefix = (pluginId: string) => `plugin:${pluginId}:`;

export function registerPluginNodeDefinitions(
  registry: NodeRegistry,
  input: PluginNodeRegistrationInput
): PluginNodeRegistrationResult {
  const registered: string[] = [];
  const rejected: Array<{ type: string; reason: string }> = [];
  const requiredPrefix = pluginTypePrefix(input.pluginId);

  for (const definition of input.definitions) {
    const type = String(definition.type ?? '');
    if (!type.startsWith(requiredPrefix)) {
      rejected.push({ type, reason: `Plugin node type must start with ${requiredPrefix}.` });
      continue;
    }
    if (registry.get(type)) {
      rejected.push({ type, reason: `Plugin node type already exists: ${type}.` });
      continue;
    }

    registry.register({
      ...definition,
      metadata: {
        version: definition.metadata?.version ?? '1.0.0',
        platformTargets: definition.metadata?.platformTargets ?? ['manager'],
        sideEffectClass: definition.metadata?.sideEffectClass ?? 'none',
        permissions: definition.metadata?.permissions ?? [],
        compatibility: definition.metadata?.compatibility ?? [],
        examples: definition.metadata?.examples ?? [],
        risks: definition.metadata?.risks ?? [],
        description: definition.metadata?.description ?? `Registered by plugin ${input.pluginId}.`,
        repairHints: definition.metadata?.repairHints,
      },
    });
    registered.push(type);
  }

  return { registered, rejected };
}
