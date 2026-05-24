/**
 * Purpose: Regression coverage for persistent client URL session identity.
 */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { getOrCreateClientIdentity } from './client-identity';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

type TestWindow = {
  location: { href: string };
  localStorage: Storage;
  sessionStorage: Storage;
};

const originalWindow = globalThis.window;

function installWindow(href: string, localStorage = new MemoryStorage(), sessionStorage = new MemoryStorage()) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { href }, localStorage, sessionStorage } satisfies TestWindow,
  });
  return { localStorage, sessionStorage };
}

afterEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
  });
});

test('getOrCreateClientIdentity persists url session ids from URL params', () => {
  const stores = installWindow('https://fluffyfoundation.xyz/client?sessionId=session-a');

  const first = getOrCreateClientIdentity();
  assert.equal(first?.urlSessionId, 'session-a');

  installWindow('https://fluffyfoundation.xyz/client', stores.localStorage, new MemoryStorage());

  const second = getOrCreateClientIdentity();
  assert.equal(second?.urlSessionId, 'session-a');
});

test('getOrCreateClientIdentity replaces stored url session ids only with valid URL params', () => {
  const stores = installWindow('https://fluffyfoundation.xyz/client?sessionId=session-a');
  assert.equal(getOrCreateClientIdentity()?.urlSessionId, 'session-a');

  installWindow('https://fluffyfoundation.xyz/client?sessionId=session-b', stores.localStorage, new MemoryStorage());
  assert.equal(getOrCreateClientIdentity()?.urlSessionId, 'session-b');

  installWindow('https://fluffyfoundation.xyz/client?sessionId=bad/session', stores.localStorage, new MemoryStorage());
  assert.equal(getOrCreateClientIdentity()?.urlSessionId, 'session-b');
});

test('getOrCreateClientIdentity accepts legacy path url session links', () => {
  installWindow('https://10.30.229.86:5174/sessionId=session-a');
  assert.equal(getOrCreateClientIdentity()?.urlSessionId, 'session-a');

  installWindow('https://10.30.229.86:5174/sessionld=session-b');
  assert.equal(getOrCreateClientIdentity()?.urlSessionId, 'session-b');
});
