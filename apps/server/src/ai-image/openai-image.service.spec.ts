/**
 * Purpose: Unit tests for OpenAI-compatible image generation asset persistence.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';

import { OpenAiImageService } from './openai-image.service.js';
import type { AssetsService } from '../assets/assets.service.js';
import type { AssetKind, AssetRecord } from '../assets/assets.types.js';

type UploadCall = {
  tempPath: string;
  mimeType: string;
  originalName: string;
  kind?: AssetKind | null;
};

function createAsset(id: string): AssetRecord {
  return {
    id,
    kind: 'image',
    mimeType: 'image/png',
    sizeBytes: 8,
    sha256: 'sha256',
    originalName: 'generated.png',
    createdAt: 1,
    updatedAt: 1,
    variants: [],
    cachePolicy: { strategy: 'immutable', maxAgeSeconds: 31536000 },
    permissions: { scope: 'server-deliverable' },
  };
}

function createAssetsStub(calls: UploadCall[]): Pick<AssetsService, 'uploadFromTempFile'> {
  return {
    uploadFromTempFile: async (opts) => {
      calls.push(opts);
      return { asset: createAsset('generated-image'), deduped: false };
    },
  };
}

test('OpenAiImageService rejects missing API key before calling upstream', async () => {
  const service = new OpenAiImageService({
    env: {},
    assets: createAssetsStub([]),
    fetchImpl: async () => {
      throw new Error('fetch should not be called');
    },
  });

  await assert.rejects(
    () => service.generateAsset({ prompt: 'a test image' }),
    /SHUGU_AI_OPENAI_IMAGE_API_KEY is not configured/
  );
});

test('OpenAiImageService posts generation body, downloads remote PNG, and stores image asset', async () => {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const uploadCalls: UploadCall[] = [];
  const service = new OpenAiImageService({
    env: {
      SHUGU_AI_OPENAI_IMAGE_API_KEY: 'sk-test',
      SHUGU_AI_OPENAI_IMAGE_BASE_URL: 'https://www.cctq.ai',
      SHUGU_AI_OPENAI_IMAGE_MODEL: 'gpt-image-2',
    },
    assets: createAssetsStub(uploadCalls),
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/images/generations')) {
        return new Response(
          JSON.stringify({
            data: [{ url: 'https://oss.example/generated.png' }],
            usage: { total_tokens: 12 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (String(url) === 'https://oss.example/generated.png') {
        return new Response(Buffer.from('png-data'), {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        });
      }
      throw new Error(`unexpected fetch ${String(url)}`);
    },
  });

  const result = await service.generateAsset({
    prompt: 'a cybernetic flower',
    size: '1024x1024',
    quality: 'low',
  });

  assert.equal(result.asset.id, 'generated-image');
  assert.equal(result.assetRef, 'asset:generated-image');
  assert.deepEqual(result.usage, { total_tokens: 12 });
  assert.equal(calls[0].url, 'https://www.cctq.ai/v1/images/generations');
  assert.equal(calls[0].init?.method, 'POST');
  assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, 'Bearer sk-test');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    model: 'gpt-image-2',
    prompt: 'a cybernetic flower',
    n: 1,
    size: '1024x1024',
    quality: 'low',
  });
  assert.equal(uploadCalls.length, 1);
  assert.equal(uploadCalls[0].mimeType, 'image/png');
  assert.equal(uploadCalls[0].kind, 'image');
  assert.equal(readFileSync(uploadCalls[0].tempPath, 'utf8'), 'png-data');
});

test('OpenAiImageService surfaces upstream model errors with status and body', async () => {
  const service = new OpenAiImageService({
    env: {
      SHUGU_AI_OPENAI_IMAGE_API_KEY: 'sk-test',
      SHUGU_AI_OPENAI_IMAGE_BASE_URL: 'https://www.cctq.ai/v1',
    },
    assets: createAssetsStub([]),
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: { code: 'model_not_found' } }), {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'application/json' },
      }),
  });

  await assert.rejects(
    () => service.generateAsset({ prompt: 'a test image', model: 'gpt-image-2' }),
    /OpenAI image generation failed \(503\).*model_not_found/
  );
});

test('OpenAiImageService posts multipart edits when an asset image input is provided', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'shugu-image-edit-test-'));
  const sourcePath = path.join(tempDir, 'source.png');
  try {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const uploadCalls: UploadCall[] = [];
    const service = new OpenAiImageService({
      env: {
        SHUGU_AI_OPENAI_IMAGE_API_KEY: 'sk-test',
        SHUGU_AI_OPENAI_IMAGE_BASE_URL: 'https://www.cctq.ai/v1',
      },
      assets: {
        ...createAssetsStub(uploadCalls),
        getContentHeaders: (assetId: string) => {
          assert.equal(assetId, 'source-image');
          return {
            filePath: sourcePath,
            stored: {
              ...createAsset('source-image'),
              storageBackend: 'localfs',
              storageKey: 'sha',
            },
          };
        },
      } as Pick<AssetsService, 'uploadFromTempFile' | 'getContentHeaders'>,
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });
        if (String(url).endsWith('/images/edits')) {
          assert.ok(init?.body instanceof FormData);
          return new Response(
            JSON.stringify({ data: [{ b64_json: Buffer.from('edited').toString('base64') }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        throw new Error(`unexpected fetch ${String(url)}`);
      },
    });
    await import('node:fs/promises').then((fs) => fs.writeFile(sourcePath, Buffer.from('source')));

    const result = await service.generateAsset({
      prompt: 'make it brighter',
      image: 'asset:source-image?v=2#fit=cover',
    });

    assert.equal(calls[0].url, 'https://www.cctq.ai/v1/images/edits');
    assert.equal(result.assetRef, 'asset:generated-image');
    assert.equal(uploadCalls[0].mimeType, 'image/png');
    assert.equal(readFileSync(uploadCalls[0].tempPath, 'utf8'), 'edited');
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
