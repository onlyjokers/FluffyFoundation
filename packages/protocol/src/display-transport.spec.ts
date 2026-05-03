/**
 * Purpose: FF-15 contract tests for Display transport status, routing, capabilities, and ack/nack semantics.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createDisplayAck,
  createDisplayNack,
  createDisplayOperation,
  resolveDisplayRoutes,
  type DisplayDescriptor,
  type DisplayRouteTarget,
  type DisplayStatusState,
} from './index.js';

const displays: DisplayDescriptor[] = [
  {
    displayId: 'display-left',
    name: 'Left Scrim',
    groupId: 'stage-left',
    status: 'reachable',
    capabilities: ['display.render', 'media.image'],
    localMediaLimits: { maxBytes: 1_000_000, acceptedMimeTypes: ['image/png'] },
    serverDeliverableAssets: ['asset://left'],
  },
  {
    displayId: 'display-right',
    name: 'Right Scrim',
    groupId: 'stage-right',
    status: 'fallback',
    capabilities: ['display.render', 'media.video'],
    localMediaLimits: { maxBytes: 3_000_000, acceptedMimeTypes: ['video/mp4'] },
    serverDeliverableAssets: ['asset://right'],
  },
];

test('Display status states cover discovery through failure without overloading connected', () => {
  const states: DisplayStatusState[] = ['discovered', 'paired', 'reachable', 'degraded', 'fallback', 'failed'];
  assert.deepEqual(states, ['discovered', 'paired', 'reachable', 'degraded', 'fallback', 'failed']);
});

test('resolveDisplayRoutes supports named display, group, capability, local media, and server asset targets', () => {
  const targets: DisplayRouteTarget[] = [
    { mode: 'displayName', name: 'Left Scrim' },
    { mode: 'displayGroup', groupId: 'stage-right' },
    { mode: 'capability', capability: 'media.image' },
    { mode: 'localMedia', mimeType: 'video/mp4', sizeBytes: 2_000_000 },
    { mode: 'serverAsset', assetRef: 'asset://left' },
  ];

  assert.deepEqual(
    targets.map((target) => resolveDisplayRoutes(displays, target).map((display) => display.displayId)),
    [
      ['display-left'],
      ['display-right'],
      ['display-left'],
      ['display-right'],
      ['display-left'],
    ]
  );
});

test('Display operations produce structured ack and nack reasons', () => {
  const operation = createDisplayOperation({
    operationId: 'op-1',
    target: { mode: 'displayId', displayId: 'display-left' },
    action: 'screenColor',
    payload: { color: '#112233' },
  });

  assert.equal(operation.kind, 'display-operation');
  assert.equal(operation.operationId, 'op-1');
  assert.deepEqual(createDisplayAck(operation, 'display-left'), {
    kind: 'display-ack',
    operationId: 'op-1',
    displayId: 'display-left',
    ok: true,
  });
  assert.deepEqual(createDisplayNack(operation, 'display-left', 'transport.unreachable', 'MessagePort closed'), {
    kind: 'display-nack',
    operationId: 'op-1',
    displayId: 'display-left',
    ok: false,
    reason: { code: 'transport.unreachable', message: 'MessagePort closed' },
  });
});
