/**
 * Purpose: FF-03 runtime protocol validation fixtures for valid messages and structured rejection paths.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PROTOCOL_VERSION,
  createCommandEnvelope,
  createControlMessage,
  createMediaMetaMessage,
  createPluginControlMessage,
  createSensorDataMessage,
  createSystemMessage,
  isValidMessage,
  validateMessage,
} from './index.js';

const validFixtures = [
  createControlMessage(
    createCommandEnvelope({ actor: 'manager', role: 'manager', scopeGroupId: 'stage-left' }),
    { mode: 'all' },
    'vibrate',
    { pattern: [100, 50, 100], repeat: 1 }
  ),
  createSensorDataMessage('client-1', 'gyro', { alpha: 1, beta: 2, gamma: 3 }),
  createMediaMetaMessage(
    createCommandEnvelope({ actor: 'manager', role: 'manager', scopeGroupId: 'stage-left' }),
    { mode: 'clientIds', ids: ['client-1'] },
    'video',
    '/media/demo.mp4',
    12345,
    {
      loop: true,
      volume: 0.8,
    }
  ),
  createPluginControlMessage(
    createCommandEnvelope({ actor: 'manager', role: 'manager', scopeGroupId: 'stage-left' }),
    { mode: 'group', groupId: 'stage-left' },
    'node-executor',
    'deploy',
    {
      graphId: 'main',
    }
  ),
  createSystemMessage('clientList', {
    clients: [{ clientId: 'client-1', connectedAt: 1000, selected: true }],
  }),
] as const;

test('validateMessage accepts current protocol fixtures for every message class', () => {
  for (const fixture of validFixtures) {
    const result = validateMessage(fixture);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(isValidMessage(fixture), true);
  }
});

test('validateMessage accepts media and plugin messages when optional object fields are omitted', () => {
  const media = createMediaMetaMessage(
    createCommandEnvelope({ actor: 'manager', role: 'manager', scopeGroupId: 'stage-left' }),
    { mode: 'all' },
    'audio',
    '/x',
    123
  );
  const plugin = createPluginControlMessage(
    createCommandEnvelope({ actor: 'manager', role: 'manager', scopeGroupId: 'stage-left' }),
    { mode: 'all' },
    'node-executor',
    'start'
  );

  assert.equal(validateMessage(media).ok, true);
  assert.equal(isValidMessage(media), true);
  assert.equal(validateMessage(plugin).ok, true);
  assert.equal(isValidMessage(plugin), true);
});

test('validateMessage rejects non-system mutating commands without envelope metadata', () => {
  for (const message of [
    {
      type: 'control',
      version: PROTOCOL_VERSION,
      from: 'manager',
      target: { mode: 'all' },
      action: 'vibrate',
      payload: { pattern: [100] },
    },
    {
      type: 'plugin',
      version: PROTOCOL_VERSION,
      from: 'manager',
      target: { mode: 'all' },
      pluginId: 'node-executor',
      command: 'deploy',
      payload: {},
    },
    {
      type: 'media',
      version: PROTOCOL_VERSION,
      from: 'manager',
      target: { mode: 'all' },
      mediaType: 'audio',
      url: '/media/demo.mp3',
      executeAt: 123,
    },
  ]) {
    const result = validateMessage(message);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.reasons.map((reason) => reason.path),
      ['scopeGroupId', 'actor', 'role', 'correlationId', 'idempotencyKey']
    );
  }
});

test('validateMessage rejects ambiguous command scope aliases', () => {
  const result = validateMessage({
    ...validFixtures[0],
    scopeGroupId: 'stage-left',
    scope: { scopeGroupId: 'stage-right' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reasons[0]?.code, 'protocol.scope.ambiguous');
  assert.equal(result.reasons[0]?.path, 'scope.scopeGroupId');
});

test('validateMessage rejects unsupported protocol versions with structured compatibility metadata', () => {
  const result = validateMessage({ ...validFixtures[0], version: PROTOCOL_VERSION + 1 });

  assert.equal(result.ok, false);
  assert.equal(result.reasons[0]?.code, 'protocol.version.unsupported');
  assert.equal(result.reasons[0]?.actor, 'manager');
  assert.equal(result.reasons[0]?.scope, 'protocol.version');
  assert.equal(result.reasons[0]?.type, 'control');
  assert.equal(result.reasons[0]?.path, 'version');
  assert.equal(result.reasons[0]?.decision, 'reject');
  assert.equal(isValidMessage({ ...validFixtures[0], version: PROTOCOL_VERSION + 1 }), false);
});

test('validateMessage rejects malformed control payloads with the failing field path', () => {
  const result = validateMessage({
    ...validFixtures[0],
    target: { mode: 'clientIds', ids: ['client-1', 42] },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.reasons.map((reason) => reason.path),
    ['target.ids[1]']
  );
  assert.equal(result.reasons[0]?.code, 'protocol.field.invalid');
  assert.equal(result.reasons[0]?.actor, 'manager');
  assert.equal(result.reasons[0]?.scope, 'message.control.target');
  assert.equal(result.reasons[0]?.type, 'control');
});

test('validateMessage rejects malformed sensor payloads for each concrete sensor type', () => {
  const cases = [
    createSensorDataMessage('client-1', 'gyro', { alpha: 1, beta: 'bad', gamma: 3 }),
    createSensorDataMessage('client-1', 'accel', { x: 1, y: 2, z: 3, includesGravity: 'yes' }),
    createSensorDataMessage('client-1', 'orientation', { alpha: 1, beta: null, gamma: 3, absolute: 'no' }),
    createSensorDataMessage('client-1', 'mic', { volume: 'loud' }),
  ];

  for (const message of cases) {
    const result = validateMessage(message);
    assert.equal(result.ok, false);
    assert.equal(result.reasons[0]?.type, 'data');
    assert.match(result.reasons[0]?.path ?? '', /^payload\./);
    assert.equal(result.reasons[0]?.decision, 'reject');
  }
});

test('validateMessage rejects malformed media, plugin, and system messages', () => {
  const invalidMessages = [
    { ...validFixtures[2], executeAt: 'soon' },
    { ...validFixtures[3], command: 'launch' },
    { ...validFixtures[4], payload: { clients: [{ clientId: '', connectedAt: 'then' }] } },
  ];

  for (const message of invalidMessages) {
    const result = validateMessage(message);
    assert.equal(result.ok, false);
    assert.equal(result.reasons[0]?.decision, 'reject');
    assert.ok(result.reasons[0]?.path);
  }
});

test('validateMessage reports unknown message types as schema rejections', () => {
  const result = validateMessage({ type: 'telemetry', version: PROTOCOL_VERSION });

  assert.equal(result.ok, false);
  assert.equal(result.reasons[0]?.code, 'protocol.type.unsupported');
  assert.equal(result.reasons[0]?.scope, 'message.type');
  assert.equal(result.reasons[0]?.path, 'type');
  assert.equal(result.reasons[0]?.decision, 'reject');
});
