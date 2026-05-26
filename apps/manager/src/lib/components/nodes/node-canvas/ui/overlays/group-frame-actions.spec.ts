/**
 * Purpose: Regression tests for group frame overlay DOM actions.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mountGateSockets } from './group-frame-actions.js';

type FakeMutationObserverInstance = {
  callback: () => void;
  disconnect: () => void;
};

class FakeElement {
  parentElement: FakeElement | null = null;
  children: FakeElement[] = [];

  constructor(
    readonly className: string,
    readonly dataset: Record<string, string> = {}
  ) {}

  appendChild(child: FakeElement) {
    if (child.parentElement) {
      child.parentElement.children = child.parentElement.children.filter((item) => item !== child);
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
}

test('mountGateSockets attaches a gate socket that appears after initial frame retries', async () => {
  const previousDocument = globalThis.document;
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const previousMutationObserver = globalThis.MutationObserver;

  const body = new FakeElement('body');
  const host = new FakeElement('group-frame-gate-sockets');
  let gateSockets: FakeElement | null = null;
  let observer: FakeMutationObserverInstance | null = null;
  const frameCallbacks: FrameRequestCallback[] = [];

  globalThis.document = {
    body,
    querySelector: (selector: string) => {
      if (selector === '.collapsed-sockets[data-rete-node-id="gate-1"]') return gateSockets;
      return null;
    },
  } as unknown as Document;
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    frameCallbacks.push(callback);
    return frameCallbacks.length;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => undefined) as typeof cancelAnimationFrame;
  globalThis.MutationObserver = class {
    constructor(callback: () => void) {
      observer = { callback, disconnect: () => undefined };
    }
    observe() {}
    disconnect() {}
  } as unknown as typeof MutationObserver;

  try {
    const action = mountGateSockets(host as unknown as HTMLElement, 'gate-1');
    for (let i = 0; i < 12; i += 1) {
      const callback = frameCallbacks.shift();
      callback?.(i);
    }

    gateSockets = new FakeElement('collapsed-sockets', { reteNodeId: 'gate-1' });
    body.appendChild(gateSockets);
    observer?.callback();

    assert.equal(gateSockets.parentElement, host);
    action.destroy();
  } finally {
    globalThis.document = previousDocument;
    globalThis.requestAnimationFrame = previousRequestAnimationFrame;
    globalThis.cancelAnimationFrame = previousCancelAnimationFrame;
    globalThis.MutationObserver = previousMutationObserver;
  }
});
