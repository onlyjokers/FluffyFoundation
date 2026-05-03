/**
 * Purpose: FF-15 server fallback routing and ack/nack propagation tests for Display operations.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createDisplayAck,
  createDisplayNack,
  createDisplayOperation,
  resolveDisplayRoutes,
  type DisplayNackReasonCode,
  type DisplayDescriptor,
  type DisplayOperationResult,
} from '@shugu/protocol';
import { createServerDisplayFallbackMessages, createServerDisplayRoutingResults } from './display-routing.js';

const displays: DisplayDescriptor[] = [
  {
    displayId: 'display-a',
    name: 'A',
    groupId: 'gallery',
    status: 'reachable',
    capabilities: ['display.render', 'media.image'],
    localMediaLimits: { maxBytes: 512_000, acceptedMimeTypes: ['image/png'] },
    serverDeliverableAssets: ['asset://a'],
  },
  {
    displayId: 'display-b',
    name: 'B',
    groupId: 'gallery',
    status: 'fallback',
    capabilities: ['display.render', 'media.video'],
    localMediaLimits: { maxBytes: 5_000_000, acceptedMimeTypes: ['video/mp4'] },
    serverDeliverableAssets: ['asset://b'],
  },
];

function resultReasonCodes(results: DisplayOperationResult[]): Array<DisplayNackReasonCode | undefined> {
  return results.map((result) => (result.kind === 'display-nack' ? result.reason.code : undefined));
}

test('server fallback creates different visible outputs for multi-display routing fixture', () => {
  const left = createDisplayOperation({
    operationId: 'op-a',
    target: { mode: 'displayId', displayId: 'display-a' },
    action: 'screenColor',
    payload: { color: '#ff0000' },
  });
  const right = createDisplayOperation({
    operationId: 'op-b',
    target: { mode: 'displayId', displayId: 'display-b' },
    action: 'screenColor',
    payload: { color: '#0000ff' },
  });

  const messages = [
    ...createServerDisplayFallbackMessages(displays, left),
    ...createServerDisplayFallbackMessages(displays, right),
  ];

  assert.deepEqual(
    messages.map((message) => ({
      groupId: message.target.mode === 'clientIds' ? message.target.ids[0] : 'bad-target',
      color: (message.payload as { color?: string }).color,
      operationId: (message.payload as { displayOperationId?: string }).displayOperationId,
    })),
    [
      { groupId: 'display-a', color: '#ff0000', operationId: 'op-a' },
      { groupId: 'display-b', color: '#0000ff', operationId: 'op-b' },
    ]
  );
});

test('server routing resolves named displays, groups, capabilities, local media limits, and server assets', () => {
  assert.deepEqual(resolveDisplayRoutes(displays, { mode: 'displayName', name: 'A' }).map((d) => d.displayId), [
    'display-a',
  ]);
  assert.deepEqual(resolveDisplayRoutes(displays, { mode: 'displayGroup', groupId: 'gallery' }).map((d) => d.displayId), [
    'display-a',
    'display-b',
  ]);
  assert.deepEqual(resolveDisplayRoutes(displays, { mode: 'capability', capability: 'media.video' }).map((d) => d.displayId), [
    'display-b',
  ]);
  assert.deepEqual(
    resolveDisplayRoutes(displays, { mode: 'localMedia', mimeType: 'video/mp4', sizeBytes: 4_000_000 }).map(
      (d) => d.displayId
    ),
    ['display-b']
  );
  assert.deepEqual(resolveDisplayRoutes(displays, { mode: 'serverAsset', assetRef: 'asset://a' }).map((d) => d.displayId), [
    'display-a',
  ]);
});

test('server preserves structured display ack/nack reasons', () => {
  const operation = createDisplayOperation({
    operationId: 'op-reason',
    target: { mode: 'displayId', displayId: 'missing' },
    action: 'showImage',
    payload: { url: 'asset://missing' },
  });

  assert.equal(createDisplayAck(operation, 'display-a').ok, true);
  assert.deepEqual(createDisplayNack(operation, 'display-a', 'asset.not_server_deliverable').reason, {
    code: 'asset.not_server_deliverable',
  });
});

test('server returns structured nack when Display operation is invalid', () => {
  assert.deepEqual(
    resultReasonCodes(createServerDisplayRoutingResults(displays, { kind: 'not-display-operation' })),
    ['operation.invalid']
  );
});

test('server returns no-match nack when no Display route resolves', () => {
  const operation = createDisplayOperation({
    operationId: 'op-missing',
    target: { mode: 'displayId', displayId: 'display-missing' },
    action: 'screenColor',
    payload: { color: '#ffffff' },
  });

  assert.deepEqual(createServerDisplayRoutingResults(displays, operation), [
    {
      kind: 'display-nack',
      operationId: 'op-missing',
      displayId: '*',
      ok: false,
      reason: { code: 'route.no_match' },
    },
  ]);
});

test('server returns focused nack codes for unsupported capability, media limits, and non-deliverable asset', () => {
  const cases: Array<{ label: string; operation: ReturnType<typeof createDisplayOperation>; code: DisplayNackReasonCode }> = [
    {
      label: 'unsupported capability',
      operation: createDisplayOperation({
        operationId: 'op-capability',
        target: { mode: 'capability', capability: 'media.depth' },
        action: 'screenColor',
        payload: { color: '#111111' },
      }),
      code: 'capability.unsupported',
    },
    {
      label: 'local media limit exceeded',
      operation: createDisplayOperation({
        operationId: 'op-limit',
        target: { mode: 'localMedia', mimeType: 'video/mp4', sizeBytes: 99_000_000 },
        action: 'playMedia',
        payload: { url: 'displayfile:huge', mediaType: 'video' },
      }),
      code: 'media.local_limit_exceeded',
    },
    {
      label: 'non-deliverable asset',
      operation: createDisplayOperation({
        operationId: 'op-asset',
        target: { mode: 'serverAsset', assetRef: 'asset://missing' },
        action: 'showImage',
        payload: { url: 'asset://missing' },
      }),
      code: 'asset.not_server_deliverable',
    },
  ];

  for (const item of cases) {
    assert.deepEqual(
      resultReasonCodes(createServerDisplayRoutingResults(displays, item.operation)),
      [item.code],
      item.label
    );
  }
});

test('server returns failed-display nack instead of routing fallback messages to failed displays', () => {
  const failedDisplays: DisplayDescriptor[] = [
    {
      ...displays[0],
      status: 'failed',
    },
  ];
  const operation = createDisplayOperation({
    operationId: 'op-failed-display',
    target: { mode: 'displayId', displayId: 'display-a' },
    action: 'screenColor',
    payload: { color: '#ffffff' },
  });

  assert.deepEqual(createServerDisplayFallbackMessages(failedDisplays, operation), []);
  assert.deepEqual(createServerDisplayRoutingResults(failedDisplays, operation), [
    {
      kind: 'display-nack',
      operationId: 'op-failed-display',
      displayId: 'display-a',
      ok: false,
      reason: { code: 'display.failed' },
    },
  ]);
});
