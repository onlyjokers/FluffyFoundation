/**
 * Purpose: FF-15 unit tests for Display transport selection, status transitions, capability reporting, and output updates.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createDisplayTransportController,
  getDefaultDisplayCapabilities,
  reduceDisplayOutput,
} from './display-transport.js';

test('Display transport records local bridge success and visible output updates', () => {
  const controller = createDisplayTransportController({ displayId: 'display-local', name: 'Local Display' });

  assert.equal(controller.getDescriptor().status, 'discovered');
  assert.equal(controller.pairLocal().ok, true);
  assert.equal(controller.getDescriptor().status, 'paired');
  assert.equal(
    controller.applyOperation({
      operationId: 'op-local',
      action: 'screenColor',
      payload: { color: '#00ff00' },
      via: 'local',
    }).ok,
    true
  );

  assert.deepEqual(controller.getOutput(), { kind: 'screenColor', color: '#00ff00' });
  assert.equal(controller.getDescriptor().status, 'reachable');
});

test('Display transport falls back through server after forced local bridge failure and still updates output', () => {
  const controller = createDisplayTransportController({ displayId: 'display-fallback', name: 'Fallback Display' });

  controller.pairLocal();
  const failure = controller.failLocal('transport.local_port_closed');
  assert.equal(failure.ok, false);
  assert.equal(controller.getDescriptor().status, 'fallback');
  assert.equal(
    controller.applyOperation({
      operationId: 'op-server',
      action: 'screenColor',
      payload: { color: '#0000ff' },
      via: 'server',
    }).ok,
    true
  );

  assert.deepEqual(controller.getOutput(), { kind: 'screenColor', color: '#0000ff' });
  assert.equal(controller.getDescriptor().status, 'reachable');
});

test('Display transport reports capabilities and local media limits', () => {
  const capabilities = getDefaultDisplayCapabilities();

  assert.deepEqual(capabilities.capabilities, ['display.render', 'media.image', 'media.video']);
  assert.equal(capabilities.localMediaLimits.maxBytes > 0, true);
  assert.equal(capabilities.localMediaLimits.acceptedMimeTypes.includes('image/png'), true);
});

test('reduceDisplayOutput captures visible image and color updates', () => {
  assert.deepEqual(reduceDisplayOutput(null, 'showImage', { url: 'asset://poster' }), {
    kind: 'image',
    url: 'asset://poster',
  });
  assert.deepEqual(reduceDisplayOutput({ kind: 'image', url: 'asset://poster' }, 'hideImage', {}), null);
});
