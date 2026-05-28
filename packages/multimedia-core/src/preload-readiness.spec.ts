/**
 * Purpose: FF-16 readiness tests for asset preload timeout, retry, and executable media proof.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseAssetIdFromRef, resolveAssetRefToUrl } from './asset-url-resolver.js';
import { MediaEngine } from './media-engine.js';
import { MultimediaCore } from './multimedia-core.js';

class MemoryHeaders {
  constructor(private readonly values: Record<string, string>) {}
  get(name: string): string | null {
    return this.values[name.toLowerCase()] ?? null;
  }
}

function response(init: {
  ok?: boolean;
  status?: number;
  headers?: Record<string, string>;
  json?: unknown;
  body?: ArrayBuffer;
}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: new MemoryHeaders(init.headers ?? {}) as unknown as Headers,
    json: async () => init.json,
    arrayBuffer: async () => init.body ?? new ArrayBuffer(1),
    clone() {
      return response(init);
    },
  } as Response;
}

async function waitForState(
  core: MultimediaCore,
  predicate: (state: ReturnType<MultimediaCore['getState']>) => boolean
): Promise<void> {
  if (predicate(core.getState())) return;
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`timed out waiting for state; latest=${JSON.stringify(core.getState())}`));
    }, 100);
    const unsubscribe = core.subscribeState((state) => {
      if (!predicate(state)) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve();
    });
  });
}

test('preloadNow records timeout and succeeds on retry', async () => {
  const originalFetch = globalThis.fetch;
  let firstGet = true;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/assets/image-1') && !url.includes('/content')) {
      return response({
        json: { sha256: 'b'.repeat(64), mimeType: 'image/png', sizeBytes: 4 },
      });
    }
    if (init?.method === 'HEAD') {
      return response({
        headers: { etag: `"${'b'.repeat(64)}"`, 'content-length': '4' },
      });
    }
    if (url.includes('/content') && firstGet) {
      firstGet = false;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return response({ body: new ArrayBuffer(4) });
    }
    return response({ body: new ArrayBuffer(4) });
  }) as typeof fetch;

  try {
    const core = new MultimediaCore({
      serverUrl: 'https://server.test',
      timeoutMs: 5,
      maxRetries: 1,
      cacheName: `ff16-${Date.now()}`,
      autoStart: false,
    });

    core.setAssetManifest({ manifestId: `m1-${Date.now()}`, assets: ['asset:image-1'] });
    await core.preloadNow('manual');

    const state = core.getState();
    assert.equal(state.status, 'ready');
    assert.equal(state.loaded, 1);
    assert.equal(state.lastError?.code, 'ASSET_PRELOAD_TIMEOUT');
    assert.equal(state.attemptsByAsset['image-1'], 2);
    core.destroy();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('setAssetManifest starts manifest-update preload without manual preloadNow', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/assets/configure-image') && !url.includes('/content')) {
      return response({ json: { sha256: 'c'.repeat(64), mimeType: 'image/png', sizeBytes: 4 } });
    }
    if (init?.method === 'HEAD') {
      return response({ headers: { etag: `"${'c'.repeat(64)}"`, 'content-length': '4' } });
    }
    return response({ body: new ArrayBuffer(4) });
  }) as typeof fetch;

  try {
    const core = new MultimediaCore({ serverUrl: 'https://server.test', timeoutMs: 20, maxRetries: 0, autoStart: false });
    core.setAssetManifest({ manifestId: `configure-${Date.now()}`, assets: ['asset:configure-image'] });

    await waitForState(core, (state) => state.status === 'ready');

    const state = core.getState();
    assert.equal(state.loaded, 1);
    assert.equal(state.total, 1);
    assert.equal(state.error, null);
    core.destroy();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('preloadNow reports actionable missing asset errors', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/assets/missing') && !url.includes('/content')) {
      return response({ ok: false, status: 404, json: { error: 'missing' } });
    }
    if (init?.method === 'HEAD') return response({ ok: false, status: 404 });
    return response({ ok: false, status: 404 });
  }) as typeof fetch;

  try {
    const core = new MultimediaCore({ serverUrl: 'https://server.test', timeoutMs: 20, maxRetries: 0, autoStart: false });
    core.setAssetManifest({ manifestId: `m2-${Date.now()}`, assets: ['asset:missing'] });
    await core.preloadNow('manual');

    const state = core.getState();
    assert.equal(state.status, 'error');
    assert.equal(state.lastError?.code, 'ASSET_NOT_FOUND');
    assert.equal(state.lastError?.assetId, 'missing');
    assert.match(state.lastError?.action ?? '', /Upload/);
    core.destroy();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('MediaEngine executable proof covers image, video, audio playback and stop-all cleanup', () => {
  const media = new MediaEngine({ resolveUrl: (url) => (url.startsWith('asset:') ? `/content/${url.slice(6)}` : url) });

  media.showImage({ url: 'asset:image-1' });
  media.playVideo({ url: 'asset:video-1', playing: true });
  media.playAudio({ url: 'asset:audio-1', playing: true, volume: 0.5 });

  assert.equal(media.getState().image.url, '/content/image-1');
  assert.equal(media.getState().video.url, '/content/video-1');
  assert.equal(media.getState().audio.url, '/content/audio-1');

  media.stopAllMedia();

  assert.equal(media.getState().image.visible, false);
  assert.equal(media.getState().video.playing, false);
  assert.equal(media.getState().audio.playing, false);
});

test('asset refs preserve version query params while parsing the stable asset id', () => {
  assert.equal(parseAssetIdFromRef('asset:image-1?v=2'), 'image-1');

  const resolved = resolveAssetRefToUrl('asset:image-1?v=2#fit=cover', {
    serverUrl: 'https://server.test/base',
    readToken: 'read-token',
  });

  assert.equal(
    resolved,
    'https://server.test/api/assets/image-1/content?v=2&token=read-token#fit=cover'
  );
});

test('MultimediaCore appends manifest asset checksums to unversioned asset refs', () => {
  const core = new MultimediaCore({
    serverUrl: 'https://server.test',
    timeoutMs: 20,
    maxRetries: 0,
    autoStart: false,
  });
  try {
    core.setAssetManifest({
      manifestId: 'manifest-image-1',
      updatedAt: 100,
      assets: ['asset:image-1'],
      entries: [
        {
          id: 'image-1',
          checksum: { algorithm: 'sha256', value: 'a'.repeat(64) },
          mimeType: 'image/png',
          kind: 'image',
          sizeBytes: 4,
          variants: [],
          cachePolicy: { strategy: 'revalidate' },
          permissions: { scope: 'server-deliverable' },
        },
      ],
    });

    assert.equal(
      core.resolveAssetRef('asset:image-1'),
      `https://server.test/api/assets/image-1/content?v=${'a'.repeat(64)}`
    );

    core.setAssetManifest({
      manifestId: 'manifest-image-2',
      updatedAt: 200,
      assets: ['asset:image-1'],
      entries: [
        {
          id: 'image-1',
          checksum: { algorithm: 'sha256', value: 'b'.repeat(64) },
          mimeType: 'image/png',
          kind: 'image',
          sizeBytes: 4,
          variants: [],
          cachePolicy: { strategy: 'revalidate' },
          permissions: { scope: 'server-deliverable' },
        },
      ],
    });

    assert.equal(
      core.resolveAssetRef('asset:image-1'),
      `https://server.test/api/assets/image-1/content?v=${'b'.repeat(64)}`
    );
    assert.equal(
      core.resolveAssetRef('asset:image-1?v=explicit'),
      'https://server.test/api/assets/image-1/content?v=explicit'
    );
  } finally {
    core.destroy();
  }
});

test('MultimediaCore inserts manifest asset checksums before hash-only image params', () => {
  const core = new MultimediaCore({
    serverUrl: 'https://server.test',
    timeoutMs: 20,
    maxRetries: 0,
    autoStart: false,
  });
  const entry = (value: string) => ({
    id: 'image-1',
    checksum: { algorithm: 'sha256', value },
    mimeType: 'image/png',
    kind: 'image',
    sizeBytes: 4,
    variants: [],
    cachePolicy: { strategy: 'revalidate' },
    permissions: { scope: 'server-deliverable' },
  });

  try {
    core.setAssetManifest({
      manifestId: 'manifest-image-hash-a',
      updatedAt: 100,
      assets: ['asset:image-1'],
      entries: [entry('a'.repeat(64))],
    });

    assert.equal(
      core.resolveAssetRef('asset:image-1#fit=cover'),
      `https://server.test/api/assets/image-1/content?v=${'a'.repeat(64)}#fit=cover`
    );

    core.media.showImage({ url: 'asset:image-1#fit=cover' });

    assert.equal(
      core.media.getState().image.url,
      `https://server.test/api/assets/image-1/content?v=${'a'.repeat(64)}#fit=cover`
    );

    core.setAssetManifest({
      manifestId: 'manifest-image-hash-b',
      updatedAt: 200,
      assets: ['asset:image-1'],
      entries: [entry('b'.repeat(64))],
    });

    assert.equal(
      core.media.getState().image.url,
      `https://server.test/api/assets/image-1/content?v=${'b'.repeat(64)}#fit=cover`
    );
  } finally {
    core.destroy();
  }
});

test('MultimediaCore refreshes the currently displayed image when an asset checksum changes', () => {
  const core = new MultimediaCore({
    serverUrl: 'https://server.test',
    timeoutMs: 20,
    maxRetries: 0,
    autoStart: false,
  });
  const entry = (value: string) => ({
    id: 'image-1',
    checksum: { algorithm: 'sha256', value },
    mimeType: 'image/png',
    kind: 'image',
    sizeBytes: 4,
    variants: [],
    cachePolicy: { strategy: 'revalidate' },
    permissions: { scope: 'server-deliverable' },
  });

  try {
    core.setAssetManifest({
      manifestId: 'manifest-image-a',
      updatedAt: 100,
      assets: ['asset:image-1'],
      entries: [entry('a'.repeat(64))],
    });
    core.media.showImage({ url: 'asset:image-1' });

    assert.equal(
      core.media.getState().image.url,
      `https://server.test/api/assets/image-1/content?v=${'a'.repeat(64)}`
    );

    core.setAssetManifest({
      manifestId: 'manifest-image-b',
      updatedAt: 200,
      assets: ['asset:image-1'],
      entries: [entry('b'.repeat(64))],
    });

    assert.equal(
      core.media.getState().image.url,
      `https://server.test/api/assets/image-1/content?v=${'b'.repeat(64)}`
    );
  } finally {
    core.destroy();
  }
});
