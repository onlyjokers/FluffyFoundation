import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  applyClientPresence,
  applyClientScreenshotPayload,
  applyClientUiInteractionPayload,
  applyNodeMediaEvent,
  applyReadinessPayload,
  type ClientUiInteractionState,
  type ClientReadiness,
  type ClientScreenshotUpload,
  type NodeMediaSignal,
} from './manager-sensor-events';

test('applyClientPresence seeds new clients and removes vanished client metadata', () => {
  const readiness = new Map<string, ClientReadiness>([
    ['stale', { status: 'assets-ready', updatedAt: 1 }],
    ['client-1', { status: 'assets-ready', updatedAt: 2 }],
  ]);

  const next = applyClientPresence(readiness, ['client-1', 'client-2'], (id, now) => ({
    status: 'connected',
    manifestId: id === 'client-2' ? undefined : 'keep',
    updatedAt: now,
  }), 123);

  assert.equal(next.has('stale'), false);
  assert.equal(next.get('client-1')?.status, 'assets-ready');
  assert.deepEqual(next.get('client-2'), { status: 'connected', manifestId: undefined, updatedAt: 123 });
});

test('applyClientUiInteractionPayload stores ClientUI node interaction outputs', () => {
  const interactions = new Map<string, ClientUiInteractionState>();

  const pressed = applyClientUiInteractionPayload(
    interactions,
    'client-1',
    {
      kind: 'client-ui-interaction',
      nodeId: 'button-1',
      uiKind: 'button',
      pressed: true,
    },
    600
  );
  const submitted = applyClientUiInteractionPayload(
    pressed,
    'client-1',
    {
      kind: 'client-ui-interaction',
      nodeId: 'input-1',
      uiKind: 'input',
      inputContent: 'hello',
      firstInputed: true,
    },
    700
  );

  assert.deepEqual(pressed.get('button-1'), {
    clientId: 'client-1',
    kind: 'button',
    pressed: true,
    inputContent: '',
    firstInputed: false,
    updatedAt: 600,
  });
  assert.deepEqual(submitted.get('input-1'), {
    clientId: 'client-1',
    kind: 'input',
    pressed: false,
    inputContent: 'hello',
    firstInputed: true,
    updatedAt: 700,
  });
});

test('sensor event helpers preserve screenshot, node-media, and readiness semantics', () => {
  const screenshots = new Map<string, ClientScreenshotUpload>();
  const withScreenshot = applyClientScreenshotPayload(
    screenshots,
    'client-1',
    { kind: 'client-screenshot', dataUrl: 'data:image/png;base64,a', mime: 'image/png', width: 10 },
    200
  );
  assert.equal(withScreenshot.get('client-1')?.dataUrl, 'data:image/png;base64,a');
  assert.equal(withScreenshot.get('client-1')?.width, 10);
  assert.equal(applyClientScreenshotPayload(withScreenshot, 'client-1', { kind: 'client-screenshot' }, 201), null);

  const media = new Map<string, NodeMediaSignal>();
  const started = applyNodeMediaEvent(media, {
    clientId: 'client-1',
    event: 'started',
    nodeId: 'node-1',
    nodeType: 'load-audio',
    at: 300,
  });
  const ended = applyNodeMediaEvent(started, {
    clientId: 'client-1',
    event: 'ended',
    nodeId: 'node-1',
    at: 350,
  });
  assert.equal(ended.get('node-1')?.startedSeq, 1);
  assert.equal(ended.get('node-1')?.endedSeq, 1);
  assert.equal(ended.get('node-1')?.nodeType, 'load-audio');

  const readiness = new Map<string, ClientReadiness>();
  const loading = applyReadinessPayload(
    readiness,
    'client-1',
    { kind: 'multimedia-core', event: 'asset-preload', status: 'loading', loaded: 1, total: 3 },
    400
  );
  const ready = applyReadinessPayload(
    loading,
    'client-1',
    { kind: 'display', event: 'ready', manifestId: 'manifest-1' },
    500
  );
  assert.equal(loading.get('client-1')?.status, 'assets-loading');
  assert.deepEqual(ready.get('client-1'), {
    status: 'assets-ready',
    loaded: 1,
    total: 3,
    manifestId: 'manifest-1',
    updatedAt: 500,
  });
});

test('manager screenshot handler pulses node runtime after storing screenshot uploads', () => {
  const source = readFileSync(new URL('./manager.ts', import.meta.url), 'utf8');
  assert.match(source, /applyClientScreenshotPayload\(prev,\s*data\.clientId,\s*payload,\s*now\)/);
  assert.match(source, /nodeEngine\.pulseRuntime\('client-screenshot'\)/);
});
