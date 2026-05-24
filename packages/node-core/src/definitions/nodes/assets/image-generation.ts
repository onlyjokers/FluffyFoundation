/**
 * Purpose: AI image generation node definitions backed by manager/server asset generation.
 */
import type { NodeDefinition } from '../../../types.js';
import type { ClientObjectDeps, GeneratedImageAssetRequest } from '../../types.js';
import { getBooleanValue, getStringValue } from '../node-definition-utils.js';

type GptImageGenState = {
  lastTrigger: boolean;
  currentSignature: string;
  currentAssetId: string;
  assetIdBySignature: Map<string, string>;
  requestedSignatures: Set<string>;
};

const stateByNodeId = new Map<string, GptImageGenState>();

const DEFAULT_MODEL = 'gpt-image-2';
const DEFAULT_SIZE = '1024x1024';
const DEFAULT_QUALITY = 'low';

function getState(nodeId: string): GptImageGenState {
  const existing = stateByNodeId.get(nodeId);
  if (existing) return existing;
  const next: GptImageGenState = {
    lastTrigger: false,
    currentSignature: '',
    currentAssetId: '',
    assetIdBySignature: new Map(),
    requestedSignatures: new Set(),
  };
  stateByNodeId.set(nodeId, next);
  return next;
}

function normalizeAssetId(raw: string | null | undefined): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return '';
  return value.startsWith('asset:') ? value.slice('asset:'.length).trim() : value;
}

function resolveRequest(
  inputs: Record<string, unknown>,
  config: Record<string, unknown>
): GeneratedImageAssetRequest {
  const prompt = getStringValue(inputs.prompt) ?? getStringValue(config.prompt) ?? '';
  const image = getStringValue(inputs.image) ?? getStringValue(config.image) ?? '';
  const model = getStringValue(config.model) || DEFAULT_MODEL;
  const size = getStringValue(config.size) || DEFAULT_SIZE;
  const quality = getStringValue(config.quality) || DEFAULT_QUALITY;
  return {
    prompt,
    ...(image ? { image } : {}),
    model,
    size,
    quality,
  };
}

function requestSignature(request: GeneratedImageAssetRequest): string {
  return JSON.stringify({
    prompt: request.prompt,
    image: request.image ?? '',
    model: request.model ?? '',
    size: request.size ?? '',
    quality: request.quality ?? '',
  });
}

function outputForAsset(assetId: string): Record<string, unknown> {
  return assetId ? { image: `asset:${assetId}`, assetId } : { image: '', assetId: '' };
}

export function createGptImageGenNode(deps: ClientObjectDeps): NodeDefinition {
  return {
    type: 'gpt-image-gen',
    label: 'GPT Image Gen',
    category: 'AI',
    inputs: [
      { id: 'prompt', label: 'Prompt', type: 'string', defaultValue: '' },
      { id: 'image', label: 'Image', type: 'image', defaultValue: '' },
      { id: 'trigger', label: 'Generate', type: 'boolean', defaultValue: false },
    ],
    outputs: [
      { id: 'image', label: 'Image', type: 'image' },
      { id: 'assetId', label: 'Asset ID', type: 'string' },
    ],
    configSchema: [
      { key: 'model', label: 'Model', type: 'string', defaultValue: DEFAULT_MODEL },
      {
        key: 'size',
        label: 'Size',
        type: 'select',
        defaultValue: DEFAULT_SIZE,
        options: [
          { value: '1024x1024', label: '1024 x 1024' },
          { value: '1024x1536', label: '1024 x 1536' },
          { value: '1536x1024', label: '1536 x 1024' },
        ],
      },
      {
        key: 'quality',
        label: 'Quality',
        type: 'select',
        defaultValue: DEFAULT_QUALITY,
        options: [
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
        ],
      },
    ],
    metadata: {
      version: '1.0.0',
      platformTargets: ['manager'],
      sideEffectClass: 'network',
      permissions: ['network'],
      compatibility: [
        {
          target: 'proc-show-image',
          rule: 'Outputs an Asset Service image reference such as asset:<id>.',
        },
        {
          target: 'image-out',
          rule: 'Can feed the Static Image Player through the normal image chain.',
        },
      ],
      examples: [
        {
          title: 'Prompt-only image',
          summary: 'Generate a new image asset from a text prompt.',
          config: { model: DEFAULT_MODEL, size: DEFAULT_SIZE, quality: DEFAULT_QUALITY },
          inputs: { prompt: 'A glass cube under studio lighting' },
        },
      ],
      risks: [
        'Requires a server-side OpenAI-compatible image API key. Do not expose credentials in browser bundles.',
      ],
      description:
        'Generates an image through the server AI image proxy and emits the saved Asset Service image reference.',
      repairHints: [
        'Configure SHUGU_AI_OPENAI_IMAGE_API_KEY on the server.',
        'Click Generate after changing prompt, image, model, size, or quality.',
      ],
    },
    process: (inputs, config, context) => {
      const state = getState(context.nodeId);
      const request = resolveRequest(inputs, config);
      const trigger = getBooleanValue(inputs.trigger) ?? false;
      const signature = requestSignature(request);

      if (state.currentSignature !== signature) {
        state.currentSignature = signature;
        state.currentAssetId = state.assetIdBySignature.get(signature) ?? state.currentAssetId;
      }

      if (!request.prompt.trim()) {
        state.lastTrigger = trigger;
        return outputForAsset(state.currentAssetId);
      }

      const cached =
        state.assetIdBySignature.get(signature) ??
        (state.requestedSignatures.has(signature)
          ? normalizeAssetId(
              deps.imageAssets?.peekGeneratedImageAsset?.(request) ??
                deps.imageAssets?.getGeneratedImageAsset?.(request)
            )
          : '');
      if (cached) {
        state.assetIdBySignature.set(signature, cached);
        state.currentAssetId = cached;
        state.lastTrigger = trigger;
        return outputForAsset(cached);
      }

      const rising = trigger && !state.lastTrigger;
      if (rising) {
        state.requestedSignatures.add(signature);
        const nextAssetId = normalizeAssetId(deps.imageAssets?.getGeneratedImageAsset?.(request));
        if (nextAssetId) {
          state.assetIdBySignature.set(signature, nextAssetId);
          state.currentAssetId = nextAssetId;
        }
      }

      state.lastTrigger = trigger;
      return outputForAsset(state.currentAssetId);
    },
    onDisable: (_inputs, _config, context) => {
      stateByNodeId.delete(context.nodeId);
    },
  };
}
