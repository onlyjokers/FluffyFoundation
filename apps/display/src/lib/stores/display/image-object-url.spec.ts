/**
 * Purpose: Regression tests for display image object URL conversion helpers.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { clearActiveImageObjectUrl, normalizeImageUrlForDisplay } from './image-object-url';

test('display data image conversion avoids synchronous base64 loops', () => {
  const source = readFileSync(new URL('./image-object-url.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /fetch\(trimmed\)/);
  assert.doesNotMatch(source, /createObjectURL/);
  assert.doesNotMatch(source, /\batob\(/);
  assert.doesNotMatch(source, /new Uint8Array/);
});

test('display streaming data image frames stay as data URLs to avoid blob churn', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = ((url: string) => {
    fetchCalls += 1;
    return Promise.resolve(new Response(new Blob([url], { type: 'image/webp' })));
  }) as typeof fetch;

  try {
    const first = 'data:image/webp;base64,first';
    const second = 'data:image/webp;base64,second';

    assert.equal(await normalizeImageUrlForDisplay(first), first);
    assert.equal(await normalizeImageUrlForDisplay(second), second);
    assert.equal(fetchCalls, 0);
  } finally {
    clearActiveImageObjectUrl();
    globalThis.fetch = originalFetch;
  }
});

test('display data image conversion is synchronous so frame order cannot invert', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = globalThis.URL;
  let fetchCalls = 0;
  let objectUrlCalls = 0;

  globalThis.fetch = (() => {
    fetchCalls += 1;
    return Promise.resolve(new Response(new Blob(['unused'], { type: 'image/webp' })));
  }) as typeof fetch;
  globalThis.URL = {
    createObjectURL: () => {
      objectUrlCalls += 1;
      return `blob:frame-${objectUrlCalls}`;
    },
    revokeObjectURL: () => undefined,
  } as unknown as typeof URL;

  try {
    assert.equal(await normalizeImageUrlForDisplay('data:image/webp;base64,first'), 'data:image/webp;base64,first');
    assert.equal(await normalizeImageUrlForDisplay('data:image/webp;base64,second'), 'data:image/webp;base64,second');
    assert.equal(fetchCalls, 0);
    assert.equal(objectUrlCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.URL = originalUrl;
  }
});

test('clearing image object state does not schedule periodic revoke work for data frames', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = globalThis.URL;
  const originalSetTimeout = globalThis.setTimeout;
  const revoked: string[] = [];
  const scheduledCallbacks: Array<() => void> = [];

  globalThis.fetch = (() =>
    Promise.resolve(new Response(new Blob(['unused'], { type: 'image/webp' })))) as typeof fetch;
  globalThis.URL = {
    createObjectURL: () => 'blob:unused',
    revokeObjectURL: (url: string) => {
      revoked.push(url);
    },
  } as unknown as typeof URL;
  globalThis.setTimeout = ((handler: TimerHandler) => {
    if (typeof handler === 'function') scheduledCallbacks.push(handler as () => void);
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout;

  try {
    assert.equal(await normalizeImageUrlForDisplay('data:image/webp;base64,first'), 'data:image/webp;base64,first');
    assert.equal(await normalizeImageUrlForDisplay('data:image/webp;base64,second'), 'data:image/webp;base64,second');
    clearActiveImageObjectUrl();

    assert.deepEqual(revoked, []);
    assert.deepEqual(scheduledCallbacks, []);
  } finally {
    clearActiveImageObjectUrl();
    globalThis.fetch = originalFetch;
    globalThis.URL = originalUrl;
    globalThis.setTimeout = originalSetTimeout;
  }
});
