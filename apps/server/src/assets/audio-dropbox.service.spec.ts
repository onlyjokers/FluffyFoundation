/**
 * Purpose: Unit tests for the persistent audio Drop Box asset-id queue.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { AudioDropBoxService } from './audio-dropbox.service.js';

test('AudioDropBoxService persists only recent asset id references with FIFO eviction', async () => {
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'shugu-audio-dropbox-'));
  const filePath = path.join(tmp, 'audio-dropbox.json');
  const previousEnv = {
    AUDIO_DROP_BOX_PATH: process.env.AUDIO_DROP_BOX_PATH,
    AUDIO_DROP_BOX_CAPACITY: process.env.AUDIO_DROP_BOX_CAPACITY,
  };
  process.env.AUDIO_DROP_BOX_PATH = filePath;
  process.env.AUDIO_DROP_BOX_CAPACITY = '3';

  try {
    const dropBox = new AudioDropBoxService();
    await dropBox.init();

    await dropBox.push({ assetId: 'asset-1', name: 'first' });
    await dropBox.push({ assetId: 'asset-2', name: 'second' });
    await dropBox.push({ assetId: 'asset-3', name: 'third' });
    await dropBox.push({ assetId: 'asset-4', name: 'fourth' });

    assert.deepEqual(dropBox.list().map((entry) => entry.assetId), ['asset-2', 'asset-3', 'asset-4']);
    assert.equal(dropBox.getLatest()?.assetId, 'asset-4');
    assert.equal(dropBox.resolve({ name: 'second' })?.assetId, 'asset-2');
    assert.equal(dropBox.resolve({ index: 0 })?.assetId, 'asset-2');
    assert.equal(dropBox.resolve({ assetId: 'asset-1' }), null);

    const raw = JSON.parse(await fsp.readFile(filePath, 'utf8')) as Record<string, unknown>;
    assert.deepEqual(
      (raw.entries as Array<Record<string, unknown>>).map((entry) => Object.keys(entry).sort()),
      [
        ['assetId', 'createdAt', 'name'],
        ['assetId', 'createdAt', 'name'],
        ['assetId', 'createdAt', 'name'],
      ]
    );

    const restored = new AudioDropBoxService();
    await restored.init();
    assert.deepEqual(restored.list().map((entry) => entry.assetId), ['asset-2', 'asset-3', 'asset-4']);
  } finally {
    if (previousEnv.AUDIO_DROP_BOX_PATH === undefined) delete process.env.AUDIO_DROP_BOX_PATH;
    else process.env.AUDIO_DROP_BOX_PATH = previousEnv.AUDIO_DROP_BOX_PATH;
    if (previousEnv.AUDIO_DROP_BOX_CAPACITY === undefined) delete process.env.AUDIO_DROP_BOX_CAPACITY;
    else process.env.AUDIO_DROP_BOX_CAPACITY = previousEnv.AUDIO_DROP_BOX_CAPACITY;
    await fsp.rm(tmp, { recursive: true, force: true });
  }
});
