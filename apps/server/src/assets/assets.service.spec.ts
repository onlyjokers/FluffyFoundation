/**
 * Purpose: Regression tests for Asset Service index loading and legacy record normalization.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { AssetsService } from './assets.service.js';

test('AssetsService backfills manifest defaults when loading legacy index records', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shugu-assets-legacy-'));
  const previousDataDir = process.env.ASSET_DATA_DIR;
  const previousDbPath = process.env.ASSET_DB_PATH;
  try {
    process.env.ASSET_DATA_DIR = join(dir, 'data');
    process.env.ASSET_DB_PATH = join(dir, 'assets-index.json');
    await writeFile(
      process.env.ASSET_DB_PATH,
      JSON.stringify({
        version: 1,
        assets: [
          {
            id: 'legacy-asset',
            kind: 'audio',
            mimeType: 'audio/mpeg',
            sizeBytes: 12,
            sha256: 'a'.repeat(64),
            originalName: 'legacy.mp3',
            createdAt: 1710000000000,
            updatedAt: 1710000000000,
            storageBackend: 'localfs',
            storageKey: 'a'.repeat(64),
          },
        ],
      }),
      'utf8'
    );

    const service = new AssetsService();
    await service.init();

    const headers = service.getContentHeaders('legacy-asset');

    assert.equal(headers?.stored.cachePolicy.strategy, 'immutable');
    assert.equal(headers?.stored.cachePolicy.maxAgeSeconds, 31536000);
    assert.deepEqual(headers?.stored.permissions, { scope: 'server-deliverable' });
    assert.deepEqual(headers?.stored.variants, []);
    assert.equal(headers?.stored.source, 'unknown');
    assert.equal(headers?.stored.autoDiscardable, false);
  } finally {
    if (previousDataDir === undefined) delete process.env.ASSET_DATA_DIR;
    else process.env.ASSET_DATA_DIR = previousDataDir;
    if (previousDbPath === undefined) delete process.env.ASSET_DB_PATH;
    else process.env.ASSET_DB_PATH = previousDbPath;
    await rm(dir, { recursive: true, force: true });
  }
});

async function withAssetEnv<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'shugu-assets-quota-'));
  const previous = {
    ASSET_DATA_DIR: process.env.ASSET_DATA_DIR,
    ASSET_DB_PATH: process.env.ASSET_DB_PATH,
    ASSET_SETTINGS_PATH: process.env.ASSET_SETTINGS_PATH,
    ASSET_MAX_BYTES: process.env.ASSET_MAX_BYTES,
    ASSET_MAX_TOTAL_BYTES: process.env.ASSET_MAX_TOTAL_BYTES,
  };
  try {
    process.env.ASSET_DATA_DIR = join(dir, 'data');
    process.env.ASSET_DB_PATH = join(dir, 'assets-index.json');
    process.env.ASSET_SETTINGS_PATH = join(dir, 'assets-settings.json');
    process.env.ASSET_MAX_BYTES = String(1024 * 1024);
    process.env.ASSET_MAX_TOTAL_BYTES = '35';
    return await fn(dir);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeTempAsset(dir: string, name: string, contents: string): Promise<string> {
  const file = join(dir, name);
  await writeFile(file, contents, 'utf8');
  return file;
}

test('AssetsService marks manager uploads as protected and AI uploads as discardable', async () => {
  await withAssetEnv(async (dir) => {
    const service = new AssetsService();
    await service.init();

    const manager = await service.uploadFromTempFile({
      tempPath: await writeTempAsset(dir, 'manager.txt', 'manager'),
      mimeType: 'text/plain',
      originalName: 'manager.txt',
    });
    const ai = await service.uploadFromTempFile({
      tempPath: await writeTempAsset(dir, 'ai.txt', 'ai-generated'),
      mimeType: 'text/plain',
      originalName: 'ai.txt',
      source: 'ai-image',
      autoDiscardable: true,
    });

    assert.equal(manager.asset.source, 'manager-upload');
    assert.equal(manager.asset.autoDiscardable, false);
    assert.equal(ai.asset.source, 'ai-image');
    assert.equal(ai.asset.autoDiscardable, true);
  });
});

test('AssetsService discards oldest unreferenced AI assets to make room for a new AI upload', async () => {
  await withAssetEnv(async (dir) => {
    const service = new AssetsService();
    await service.init();

    const protectedHuman = await service.uploadFromTempFile({
      tempPath: await writeTempAsset(dir, 'human.txt', 'human-data'),
      mimeType: 'text/plain',
      originalName: 'human.txt',
    });
    const oldAi = await service.uploadFromTempFile({
      tempPath: await writeTempAsset(dir, 'old-ai.txt', 'old-ai-data'),
      mimeType: 'text/plain',
      originalName: 'old-ai.txt',
      source: 'ai-image',
      autoDiscardable: true,
    });
    const referencedAi = await service.uploadFromTempFile({
      tempPath: await writeTempAsset(dir, 'referenced-ai.txt', 'ref-ai'),
      mimeType: 'text/plain',
      originalName: 'referenced-ai.txt',
      source: 'tts',
      autoDiscardable: true,
      referencedAssetIds: new Set([oldAi.asset.id]),
    });
    const bareIdReferencedAi = await service.uploadFromTempFile({
      tempPath: await writeTempAsset(dir, 'bare-ref-ai.txt', 'bare'),
      mimeType: 'text/plain',
      originalName: 'bare-ref-ai.txt',
      source: 'tts',
      autoDiscardable: true,
      referencedAssetIds: new Set([oldAi.asset.id]),
    });

    const incoming = await service.uploadFromTempFile({
      tempPath: await writeTempAsset(dir, 'incoming.txt', 'incoming-ai'),
      mimeType: 'text/plain',
      originalName: 'incoming.txt',
      source: 'ai-image',
      autoDiscardable: true,
      referencedAssetIds: new Set([referencedAi.asset.id, bareIdReferencedAi.asset.id]),
    });

    assert.ok(incoming.asset.id);
    assert.ok(service.getAssetRecord(protectedHuman.asset.id), 'human upload must be protected');
    assert.equal(service.getAssetRecord(oldAi.asset.id), null, 'oldest unreferenced AI asset should be discarded');
    assert.ok(service.getAssetRecord(referencedAi.asset.id), 'referenced AI asset must be protected');
    assert.ok(service.getAssetRecord(bareIdReferencedAi.asset.id), 'bare-id referenced AI asset must be protected');
    assert.ok(service.getAssetRecord(incoming.asset.id), 'incoming AI asset must be stored');
    assert.ok(service.getUsage().totalBytes <= service.getSettings().maxTotalBytes);
  });
});

test('AssetsService persists max total capacity settings', async () => {
  await withAssetEnv(async () => {
    const first = new AssetsService();
    await first.init();
    await first.updateSettings({ maxTotalBytes: 12345 });

    const second = new AssetsService();
    await second.init();

    assert.equal(second.getSettings().maxTotalBytes, 12345);
  });
});

test('AssetsService bulk deletes existing assets and reports missing ids', async () => {
  await withAssetEnv(async (dir) => {
    const service = new AssetsService();
    await service.init();

    const first = await service.uploadFromTempFile({
      tempPath: await writeTempAsset(dir, 'first.txt', 'first'),
      mimeType: 'text/plain',
      originalName: 'first.txt',
    });
    const second = await service.uploadFromTempFile({
      tempPath: await writeTempAsset(dir, 'second.txt', 'second'),
      mimeType: 'text/plain',
      originalName: 'second.txt',
      source: 'ai-image',
      autoDiscardable: true,
    });
    const keep = await service.uploadFromTempFile({
      tempPath: await writeTempAsset(dir, 'keep.txt', 'keep'),
      mimeType: 'text/plain',
      originalName: 'keep.txt',
    });

    const result = await service.deleteAssets([first.asset.id, 'missing-asset', second.asset.id]);

    assert.deepEqual(result.deletedIds, [first.asset.id, second.asset.id]);
    assert.deepEqual(result.missingIds, ['missing-asset']);
    assert.deepEqual(result.failed, []);
    assert.equal(service.getAssetRecord(first.asset.id), null);
    assert.equal(service.getAssetRecord(second.asset.id), null);
    assert.ok(service.getAssetRecord(keep.asset.id), 'unselected asset should remain');
    assert.equal(service.getUsage().totalBytes, keep.asset.sizeBytes);
  });
});
