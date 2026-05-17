// Purpose: Verify Manager opens Display through a stable SvelteKit route.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { get } from 'svelte/store';

import {
  buildDefaultDisplayUrl,
  displayBridgeState,
  openDisplay,
  teardownDisplayBridge,
} from './display-bridge';

test('buildDefaultDisplayUrl uses the canonical trailing-slash Display route in dev', () => {
  const url = buildDefaultDisplayUrl({
    origin: 'https://localhost:5173',
    dev: true,
  });

  assert.equal(url.toString(), 'https://localhost:5175/display/');
});

test('openDisplay opens an additional Display without closing the previous window', () => {
  const originalWindow = globalThis.window;
  const opened: Array<{ url: string; closed: boolean; closeCalls: number; close: () => void }> = [];
  const localStorage = new Map<string, string>();

  globalThis.window = {
    location: {
      origin: 'https://localhost:5173',
      protocol: 'https:',
      hostname: 'localhost',
      port: '5173',
    },
    localStorage: {
      getItem: (key: string) => localStorage.get(key) ?? null,
      setItem: (key: string, value: string) => localStorage.set(key, value),
    },
    open: (url: string) => {
      const win = {
        url,
        closed: false,
        closeCalls: 0,
        close() {
          this.closeCalls += 1;
          this.closed = true;
        },
      };
      opened.push(win);
      return win;
    },
  } as unknown as Window & typeof globalThis;

  try {
    openDisplay({
      displayUrl: 'https://localhost:5175/display/',
      serverUrl: 'https://localhost:3001',
    });
    openDisplay({
      displayUrl: 'https://localhost:5175/display/',
      serverUrl: 'https://localhost:3001',
    });

    assert.equal(opened.length, 2);
    assert.equal(opened[0].closeCalls, 0);
    assert.equal(opened[0].closed, false);
    assert.equal(opened[1].closeCalls, 0);
    assert.equal(get(displayBridgeState).status, 'opening');
  } finally {
    teardownDisplayBridge();
    globalThis.window = originalWindow;
  }
});
