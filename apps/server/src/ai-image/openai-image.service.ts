/**
 * Purpose: Server-side OpenAI-compatible image generation proxy with Asset Service persistence.
 */
import { Injectable } from '@nestjs/common';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AssetsService } from '../assets/assets.service.js';
import type { AssetRecord, StoredAssetRecord } from '../assets/assets.types.js';

type OpenAiImageFetch = typeof fetch;
type OpenAiImageAssets = Pick<AssetsService, 'uploadFromTempFile'> &
  Partial<Pick<AssetsService, 'getContentHeaders'>>;

export type OpenAiImageServiceOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: OpenAiImageFetch;
  assets?: OpenAiImageAssets;
};

export type OpenAiImageAssetRequest = {
  prompt: string;
  image?: string;
  model?: string;
  size?: string;
  quality?: string;
};

export type OpenAiImageAssetResult = {
  asset: AssetRecord;
  assetId: string;
  assetRef: string;
  deduped: boolean;
  usage: Record<string, unknown> | null;
};

type GeneratedImagePayload = {
  bytes: Buffer;
  mimeType: string;
};

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-image-2';
const DEFAULT_SIZE = '1024x1024';
const DEFAULT_QUALITY = 'low';

function normalizeBaseUrl(raw: string | undefined): string {
  const trimmed = raw?.trim() || DEFAULT_BASE_URL;
  const withoutSlash = trimmed.replace(/\/+$/, '');
  return withoutSlash.endsWith('/v1') ? withoutSlash : `${withoutSlash}/v1`;
}

function guessMimeType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'image/jpeg';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.gif')) return 'image/gif';
  return 'image/png';
}

function getHeader(headers: Headers, key: string): string {
  return headers.get(key)?.split(';')[0]?.trim() || '';
}

function getFirstImageData(json: Record<string, unknown>): Record<string, unknown> {
  const data = json.data;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('OpenAI image response missing data[0]');
  }
  const first = data[0];
  if (!first || typeof first !== 'object') {
    throw new Error('OpenAI image response missing image object');
  }
  return first as Record<string, unknown>;
}

async function writeTempImage(bytes: Buffer): Promise<string> {
  const dir = path.join(os.tmpdir(), 'shugu-ai-image');
  await fsp.mkdir(dir, { recursive: true });
  const tempPath = path.join(dir, `${Date.now()}-${randomUUID()}.image`);
  await fsp.writeFile(tempPath, bytes);
  return tempPath;
}

function normalizeAssetId(raw: string): string {
  const trimmed = raw.trim();
  const withoutPrefix = trimmed.startsWith('asset:') ? trimmed.slice('asset:'.length).trim() : trimmed;
  return withoutPrefix.split(/[?#]/)[0]?.trim() ?? '';
}

@Injectable()
export class OpenAiImageService {
  private readonly env: NodeJS.ProcessEnv;
  private readonly fetchImpl: OpenAiImageFetch;
  private readonly assets: OpenAiImageAssets | undefined;

  constructor(
    assetsOrOptions?: OpenAiImageAssets | OpenAiImageServiceOptions,
    options: OpenAiImageServiceOptions = {}
  ) {
    const firstArgIsOptions = isOpenAiImageServiceOptions(assetsOrOptions);
    const effectiveOptions = firstArgIsOptions ? assetsOrOptions : options;
    this.env = effectiveOptions?.env ?? process.env;
    this.fetchImpl = effectiveOptions?.fetchImpl ?? fetch;
    this.assets = effectiveOptions?.assets ?? (firstArgIsOptions ? undefined : assetsOrOptions);
  }

  async generateAsset(request: OpenAiImageAssetRequest): Promise<OpenAiImageAssetResult> {
    if (!this.assets) throw new Error('AssetsService is not configured');
    const apiKey =
      this.env.SHUGU_AI_OPENAI_IMAGE_API_KEY?.trim() ||
      this.env.SHUGU_AI_OPENAI_API_KEY?.trim() ||
      '';
    if (!apiKey) {
      throw new Error('SHUGU_AI_OPENAI_IMAGE_API_KEY is not configured');
    }

    const prompt = request.prompt?.trim() ?? '';
    if (!prompt) throw new Error('Image prompt is required');

    const baseUrl = normalizeBaseUrl(
      this.env.SHUGU_AI_OPENAI_IMAGE_BASE_URL || this.env.SHUGU_AI_OPENAI_BASE_URL
    );
    const model = request.model?.trim() || this.env.SHUGU_AI_OPENAI_IMAGE_MODEL?.trim() || DEFAULT_MODEL;
    const size = request.size?.trim() || DEFAULT_SIZE;
    const quality = request.quality?.trim() || DEFAULT_QUALITY;
    const image = request.image?.trim() || '';

    const generated = image
      ? await this.editImage({ baseUrl, apiKey, prompt, image, model, size, quality })
      : await this.generateImage({ baseUrl, apiKey, prompt, model, size, quality });

    const tempPath = await writeTempImage(generated.bytes);
    const uploaded = await this.assets.uploadFromTempFile({
      tempPath,
      mimeType: generated.mimeType,
      originalName: `gpt-image-${model}.${generated.mimeType === 'image/jpeg' ? 'jpg' : 'png'}`,
      kind: 'image',
    });

    return {
      asset: uploaded.asset,
      assetId: uploaded.asset.id,
      assetRef: `asset:${uploaded.asset.id}`,
      deduped: uploaded.deduped,
      usage: generated.usage,
    };
  }

  private async generateImage(opts: {
    baseUrl: string;
    apiKey: string;
    prompt: string;
    model: string;
    size: string;
    quality: string;
  }): Promise<GeneratedImagePayload & { usage: Record<string, unknown> | null }> {
    const response = await this.fetchImpl(`${opts.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts.model,
        prompt: opts.prompt,
        n: 1,
        size: opts.size,
        quality: opts.quality,
      }),
    });
    const json = await this.readJsonResponse(response, 'generation');
    const usage = (json.usage as Record<string, unknown> | undefined) ?? null;
    return { ...(await this.extractGeneratedImage(json)), usage };
  }

  private async editImage(opts: {
    baseUrl: string;
    apiKey: string;
    prompt: string;
    image: string;
    model: string;
    size: string;
    quality: string;
  }): Promise<GeneratedImagePayload & { usage: Record<string, unknown> | null }> {
    if (!this.assets?.getContentHeaders) {
      throw new Error('Image input requires Asset Service content access');
    }
    const assetId = normalizeAssetId(opts.image);
    if (!assetId) throw new Error('Image input must be an asset:<id> reference');
    const info = this.assets.getContentHeaders(assetId);
    if (!info) throw new Error(`Image asset not found: ${assetId}`);

    const stored = info.stored as StoredAssetRecord;
    const imageBytes = await fsp.readFile(info.filePath);
    const form = new FormData();
    form.set('model', opts.model);
    form.set('prompt', opts.prompt);
    form.set('n', '1');
    form.set('size', opts.size);
    form.set('quality', opts.quality);
    form.set(
      'image',
      new Blob([new Uint8Array(imageBytes)], { type: stored.mimeType || 'image/png' }),
      stored.originalName || 'input.png'
    );

    const response = await this.fetchImpl(`${opts.baseUrl}/images/edits`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: form,
    });
    const json = await this.readJsonResponse(response, 'edit');
    const usage = (json.usage as Record<string, unknown> | undefined) ?? null;
    return { ...(await this.extractGeneratedImage(json)), usage };
  }

  private async readJsonResponse(response: Response, operation: string): Promise<Record<string, unknown>> {
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `OpenAI image ${operation} failed (${response.status}): ${body || response.statusText}`
      );
    }
    return (await response.json()) as Record<string, unknown>;
  }

  private async extractGeneratedImage(json: Record<string, unknown>): Promise<GeneratedImagePayload> {
    const first = getFirstImageData(json);
    const url = typeof first.url === 'string' ? first.url.trim() : '';
    if (url) {
      const response = await this.fetchImpl(url);
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`OpenAI image download failed (${response.status}): ${body || response.statusText}`);
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      const mimeType = getHeader(response.headers, 'content-type') || guessMimeType(url);
      return { bytes, mimeType };
    }

    const b64 = typeof first.b64_json === 'string'
      ? first.b64_json
      : typeof first.b64 === 'string'
        ? first.b64
        : '';
    if (b64) {
      return { bytes: Buffer.from(b64, 'base64'), mimeType: 'image/png' };
    }

    throw new Error('OpenAI image response missing url or b64_json');
  }
}

function isOpenAiImageServiceOptions(
  value: OpenAiImageAssets | OpenAiImageServiceOptions | undefined
): value is OpenAiImageServiceOptions {
  if (!value || typeof value !== 'object') return false;
  return 'env' in value || 'fetchImpl' in value || 'assets' in value;
}
