import type { NodeDefinition } from '../../types.js';

export function createAiModelRefNode(): NodeDefinition {
  return {
    type: 'ai-model-ref',
    label: 'AI Model Ref',
    category: 'AI',
    inputs: [],
    outputs: [{ id: 'ref', label: 'Model Ref', type: 'string' }],
    configSchema: [
      { key: 'enabled', label: 'Enabled', type: 'boolean', defaultValue: true },
      {
        key: 'model',
        label: 'Model',
        type: 'asset-picker',
        assetKind: 'model',
        defaultValue: '',
      },
    ],
    process: (_inputs, config) => {
      const enabledRaw = config.enabled;
      const enabled =
        typeof enabledRaw === 'boolean'
          ? enabledRaw
          : typeof enabledRaw === 'number' && Number.isFinite(enabledRaw)
            ? enabledRaw >= 0.5
            : enabledRaw == null
              ? true
              : Boolean(enabledRaw);

      const raw = typeof config.model === 'string' ? config.model.trim() : '';
      if (!enabled || !raw) return { ref: '' };

      const ref = raw.startsWith('asset:') ? raw : `asset:${raw}`;
      return { ref };
    },
  };
}
