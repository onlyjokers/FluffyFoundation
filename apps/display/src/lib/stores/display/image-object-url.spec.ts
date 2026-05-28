/**
 * Purpose: Regression tests for display image object URL conversion helpers.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { clearActiveImageObjectUrl, normalizeImageUrlForDisplay } from './image-object-url';

test('display data image conversion avoids synchronous base64 loops', () => {
  const source = readFileSync(new URL('./image-object-url.ts', import.meta.url), 'utf8');

  assert.match(source, /fetch\(trimmed\)/);
  assert.match(source, /imageObjectUrlSeq/);
  assert.match(source, /seq !== imageObjectUrlSeq/);
  assert.doesNotMatch(source, /\batob\(/);
  assert.doesNotMatch(source, /new Uint8Array/);
});

test('display data image conversion keeps earlier frames displayable when a newer frame arrives first', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = globalThis.URL;
  const resolvers: Array<(value: Response) => void> = [];
  const objectUrls: string[] = [];

  globalThis.fetch = ((url: string) =>
    new Promise<Response>((resolve) => {
      resolvers.push(resolve);
    })) as typeof fetch;
  globalThis.URL = {
    createObjectURL: () => {
      const url = `blob:frame-${objectUrls.length + 1}`;
      objectUrls.push(url);
      return url;
    },
    revokeObjectURL: () => undefined,
  } as unknown as typeof URL;

  try {
    const first = normalizeImageUrlForDisplay('data:image/webp;base64,first');
    const second = normalizeImageUrlForDisplay('data:image/webp;base64,second');

    resolvers[1]?.(new Response(new Blob(['second'], { type: 'image/webp' })));
    assert.equal(await second, 'blob:frame-1');

    resolvers[0]?.(new Response(new Blob(['first'], { type: 'image/webp' })));
    assert.equal(await first, 'blob:frame-2');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.URL = originalUrl;
  }
});

test('display data image conversion revokes object URLs returned from out-of-order frames', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = globalThis.URL;
  const originalSetTimeout = globalThis.setTimeout;
  const resolvers: Array<(value: Response) => void> = [];
  const objectUrls: string[] = [];
  const revoked: string[] = [];
  const scheduledCallbacks: Array<() => void> = [];

  globalThis.fetch = (() =>
    new Promise<Response>((resolve) => {
      resolvers.push(resolve);
    })) as typeof fetch;
  globalThis.URL = {
    createObjectURL: () => {
      const url = `blob:frame-${objectUrls.length + 1}`;
      objectUrls.push(url);
      return url;
    },
    revokeObjectURL: (url: string) => {
      revoked.push(url);
    },
  } as unknown as typeof URL;
  globalThis.setTimeout = ((handler: TimerHandler) => {
    if (typeof handler === 'function') scheduledCallbacks.push(handler as () => void);
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;

  try {
    const first = normalizeImageUrlForDisplay('data:image/webp;base64,first');
    const second = normalizeImageUrlForDisplay('data:image/webp;base64,second');

    resolvers[1]?.(new Response(new Blob(['second'], { type: 'image/webp' })));
    assert.equal(await second, 'blob:frame-1');

    resolvers[0]?.(new Response(new Blob(['first'], { type: 'image/webp' })));
    assert.equal(await first, 'blob:frame-2');

    clearActiveImageObjectUrl();
    for (const callback of scheduledCallbacks.splice(0)) callback();

    assert.ok(revoked.includes('blob:frame-1'));
    assert.ok(revoked.includes('blob:frame-2'));
  } finally {
    clearActiveImageObjectUrl();
    globalThis.fetch = originalFetch;
    globalThis.URL = originalUrl;
    globalThis.setTimeout = originalSetTimeout;
  }
});
