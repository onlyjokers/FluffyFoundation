/**
 * Purpose: Server-side Aliyun DashScope TTS proxy for safe API-key handling.
 */
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AssetsService } from '../assets/assets.service.js';
import type { AssetRecord } from '../assets/assets.types.js';

type AliyunTtsFetch = typeof fetch;

export type AliyunTtsServiceOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: AliyunTtsFetch;
};

export type AliyunTtsRequest = {
  text: string;
  model?: string;
  voice?: string;
  languageType?: string;
  instructions?: string;
  optimizeInstructions?: boolean;
};

export type AliyunTtsResult = {
  url: string;
  mimeType: string;
  usage: Record<string, unknown> | null;
};

export type AliyunTtsAssetResult = {
  asset: AssetRecord;
  deduped: boolean;
  usage: Record<string, unknown> | null;
};

function guessMimeType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('.wav')) return 'audio/wav';
  if (lower.includes('.mp3')) return 'audio/mpeg';
  if (lower.includes('.m4a')) return 'audio/mp4';
  return 'audio/wav';
}

function extensionForMimeType(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes('mpeg')) return 'mp3';
  if (lower.includes('mp4') || lower.includes('m4a')) return 'm4a';
  if (lower.includes('ogg')) return 'ogg';
  if (lower.includes('flac')) return 'flac';
  return 'wav';
}

function safeNamePart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'tts';
}

const DEFAULT_TTS_API_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

export class AliyunTtsService {
  private readonly env: NodeJS.ProcessEnv;
  private readonly fetchImpl: AliyunTtsFetch;
  private readonly assetCacheBySignature = new Map<string, AliyunTtsAssetResult>();
  private readonly assetInFlightBySignature = new Map<string, Promise<AliyunTtsAssetResult>>();

  constructor(options: AliyunTtsServiceOptions = {}) {
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async synthesize(request: AliyunTtsRequest): Promise<AliyunTtsResult> {
    const apiKey = this.env.DASHSCOPE_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('DASHSCOPE_API_KEY is not configured');
    }

    const text = request.text?.trim() ?? '';
    if (!text) {
      throw new Error('TTS text is required');
    }

    const model = request.model?.trim() || this.env.SHUGU_TTS_MODEL?.trim() || 'qwen3-tts-flash';
    const voice = request.voice?.trim() || this.env.SHUGU_TTS_VOICE?.trim() || 'Cherry';
    const languageType = request.languageType?.trim() || this.env.SHUGU_TTS_LANGUAGE?.trim() || 'Chinese';
    const instructions = request.instructions?.trim() || this.env.SHUGU_TTS_INSTRUCTIONS?.trim() || '';
    const optimizeInstructions = request.optimizeInstructions ?? false;
    const apiUrl = this.env.DASHSCOPE_TTS_API_URL?.trim() || DEFAULT_TTS_API_URL;

    const response = await this.fetchImpl(
      apiUrl,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: {
            text,
            voice,
            language_type: languageType,
          },
          ...(instructions
            ? {
                parameters: {
                  instructions,
                  optimize_instructions: Boolean(optimizeInstructions),
                },
              }
            : {}),
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Aliyun TTS request failed (${response.status}): ${body || response.statusText}`);
    }

    const json = (await response.json()) as Record<string, unknown>;
    const output = json.output as Record<string, unknown> | undefined;
    const audio = output?.audio as Record<string, unknown> | undefined;
    const url = typeof audio?.url === 'string' ? audio.url : '';
    if (!url) {
      throw new Error('Aliyun TTS response missing audio url');
    }

    const usage = (json.usage as Record<string, unknown> | undefined) ?? null;
    return { url, mimeType: guessMimeType(url), usage };
  }

  async synthesizeAsset(request: AliyunTtsRequest, assets: AssetsService): Promise<AliyunTtsAssetResult> {
    const model = request.model?.trim() || this.env.SHUGU_TTS_MODEL?.trim() || 'qwen3-tts-flash';
    const voice = request.voice?.trim() || this.env.SHUGU_TTS_VOICE?.trim() || 'Cherry';
    const languageType = request.languageType?.trim() || this.env.SHUGU_TTS_LANGUAGE?.trim() || 'Chinese';
    const instructions = request.instructions?.trim() || this.env.SHUGU_TTS_INSTRUCTIONS?.trim() || '';
    const optimizeInstructions = request.optimizeInstructions ?? false;
    const text = request.text?.trim() ?? '';
    const signature = JSON.stringify({
      text,
      model,
      voice,
      languageType,
      instructions,
      optimizeInstructions,
    });

    const cached = this.assetCacheBySignature.get(signature) ?? null;
    if (cached && assets.getAssetRecord(cached.asset.id)) {
      return { ...cached, deduped: true };
    }

    const inflight = this.assetInFlightBySignature.get(signature);
    if (inflight) return await inflight;

    const promise = (async (): Promise<AliyunTtsAssetResult> => {
      const result = await this.synthesize(request);
      const audioResponse = await this.fetchImpl(result.url);
      if (!audioResponse.ok) {
        const body = await audioResponse.text().catch(() => '');
        throw new Error(
          `Aliyun TTS audio download failed (${audioResponse.status}): ${body || audioResponse.statusText}`
        );
      }

      const contentType =
        audioResponse.headers.get('content-type')?.split(';')[0]?.trim() || result.mimeType;
      const mimeType = contentType || result.mimeType;
      const bytes = new Uint8Array(await audioResponse.arrayBuffer());
      const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'shugu-tts-audio-'));
      const tmpPath = path.join(tmpDir, `audio.${extensionForMimeType(mimeType)}`);
      try {
        await fsp.writeFile(tmpPath, bytes);
        const originalName = `tts-${safeNamePart(model)}-${safeNamePart(voice)}.${extensionForMimeType(mimeType)}`;
        const upload = await assets.uploadFromTempFile({
          tempPath: tmpPath,
          mimeType,
          originalName,
          kind: 'audio',
          source: 'tts',
          autoDiscardable: true,
        });
        const next: AliyunTtsAssetResult = {
          asset: upload.asset,
          deduped: upload.deduped,
          usage: result.usage,
        };
        this.assetCacheBySignature.set(signature, next);
        return next;
      } finally {
        await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
      }
    })();

    this.assetInFlightBySignature.set(signature, promise);
    try {
      return await promise;
    } finally {
      this.assetInFlightBySignature.delete(signature);
    }
  }
}
