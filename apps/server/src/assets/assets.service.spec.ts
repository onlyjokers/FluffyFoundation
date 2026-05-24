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
  } finally {
    if (previousDataDir === undefined) delete process.env.ASSET_DATA_DIR;
    else process.env.ASSET_DATA_DIR = previousDataDir;
    if (previousDbPath === undefined) delete process.env.ASSET_DB_PATH;
    else process.env.ASSET_DB_PATH = previousDbPath;
    await rm(dir, { recursive: true, force: true });
  }
});
