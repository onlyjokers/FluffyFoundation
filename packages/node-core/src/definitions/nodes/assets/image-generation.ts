/**
 * Purpose: AI image generation node definitions backed by manager/server asset generation.
 */
import type { NodeDefinition } from '../../../types.js';
import type { ClientObjectDeps, GeneratedImageAssetRequest } from '../../types.js';
import { getBooleanValue, getStringValue } from '../node-definition-utils.js';

type GptImageGenState = {
  lastTrigger: boolean;
  currentSignature: string;
  activeRequestId: string;
  pendingRequestId: string;
  lastDeliveredAssetId: string;
  lastDeliveredVersion: number;
  requestSeq: number;
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
    activeRequestId: '',
    pendingRequestId: '',
    lastDeliveredAssetId: '',
    lastDeliveredVersion: 0,
    requestSeq: 0,
  };
  stateByNodeId.set(nodeId, next);
  return next;
}

function normalizeAssetId(raw: string | null | undefined): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return '';
  const withoutPrefix = value.startsWith('asset:') ? value.slice('asset:'.length).trim() : value;
  return withoutPrefix.split(/[?#]/)[0]?.trim() ?? '';
}

function resolveRequest(
  inputs: Record<string, unknown>,
  config: Record<string, unknown>
): GeneratedImageAssetRequest {
  const prompt = getStringValue(inputs.prompt) ?? getStringValue(config.prompt) ?? '';
  const image = getStringValue(inputs.image) ?? getStringValue(config.image) ?? '';
  const model = getStringValue(inputs.model) || getStringValue(config.model) || DEFAULT_MODEL;
  const size = getStringValue(inputs.size) || getStringValue(config.size) || DEFAULT_SIZE;
  const quality =
    getStringValue(inputs.quality) || getStringValue(config.quality) || DEFAULT_QUALITY;
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

function outputForAsset(assetId: string, version = 0): Record<string, unknown> {
  const suffix = version > 0 ? `?v=${encodeURIComponent(String(version))}` : '';
  return assetId
    ? { image: `asset:${assetId}${suffix}`, assetId, asset: `asset:${assetId}${suffix}` }
    : { image: '', assetId: '', asset: '' };
}

function outputNoop(): Record<string, unknown> {
  return { image: undefined, assetId: '', asset: '' };
}

function outputForCurrentAsset(state: GptImageGenState): Record<string, unknown> {
  return state.lastDeliveredAssetId
    ? outputForAsset(state.lastDeliveredAssetId, state.lastDeliveredVersion)
    : outputNoop();
}

function deliverAsset(state: GptImageGenState, assetId: string): Record<string, unknown> {
  if (!assetId) return outputForCurrentAsset(state);
  state.lastDeliveredAssetId = assetId;
  state.lastDeliveredVersion += 1;
  return outputForAsset(assetId, state.lastDeliveredVersion);
}

export function createGptImageGenNode(deps: ClientObjectDeps): NodeDefinition {
  return {
    type: 'gpt-image-gen',
    label: 'GPT Image Gen',
    category: 'AI',
    inputs: [
      { id: 'prompt', label: 'Prompt', type: 'string', defaultValue: '' },
      { id: 'image', label: 'Image', type: 'image', defaultValue: '' },
      {
        id: 'trigger',
        label: 'Generate',
        type: 'pulse',
        defaultValue: false,
        buttonLabel: 'Generate',
      },
    ],
    outputs: [
      { id: 'image', label: 'Image', type: 'image' },
      { id: 'assetId', label: 'Asset ID', type: 'string' },
      { id: 'asset', label: 'Asset', type: 'asset' },
    ],
    configSchema: [
      {
        key: 'model',
        label: 'Model',
        type: 'select',
        defaultValue: DEFAULT_MODEL,
        connectable: true,
        options: [{ value: 'gpt-image-2', label: 'GPT Image 2' }],
      },
      {
        key: 'size',
        label: 'Size',
        type: 'select',
        defaultValue: DEFAULT_SIZE,
        connectable: true,
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
        connectable: true,
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
        state.activeRequestId = '';
        state.pendingRequestId = '';
      }

      if (!request.prompt.trim()) {
        state.lastTrigger = trigger;
        return outputNoop();
      }

      const rising = trigger && !state.lastTrigger;
      if (rising) {
        state.requestSeq += 1;
        const requestId = `${context.nodeId}:${state.requestSeq}`;
        state.activeRequestId = requestId;
        state.pendingRequestId = requestId;
        const nextAssetId = normalizeAssetId(
          deps.imageAssets?.getGeneratedImageAsset?.(request, { requestId, force: true })
        );
        if (nextAssetId) {
          state.pendingRequestId = '';
          state.lastTrigger = trigger;
          return deliverAsset(state, nextAssetId);
        }
        state.lastTrigger = trigger;
        return outputForCurrentAsset(state);
      }

      if (state.pendingRequestId) {
        const requestId = state.pendingRequestId;
        const nextAssetId = normalizeAssetId(
          deps.imageAssets?.peekGeneratedImageAsset?.(request, { requestId }) ??
            deps.imageAssets?.getGeneratedImageAsset?.(request, { requestId })
        );
        if (nextAssetId && requestId === state.activeRequestId) {
          state.pendingRequestId = '';
          state.lastTrigger = trigger;
          return deliverAsset(state, nextAssetId);
        }
        state.lastTrigger = trigger;
        return outputForCurrentAsset(state);
      }

      const cachedAssetId = normalizeAssetId(deps.imageAssets?.peekGeneratedImageAsset?.(request));
      if (cachedAssetId && cachedAssetId !== state.lastDeliveredAssetId) {
        state.lastTrigger = trigger;
        return deliverAsset(state, cachedAssetId);
      }

      state.lastTrigger = trigger;
      return outputForCurrentAsset(state);
    },
    onDisable: (_inputs, _config, context) => {
      stateByNodeId.delete(context.nodeId);
    },
  };
}
