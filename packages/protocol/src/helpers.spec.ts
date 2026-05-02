/**
 * Purpose: Regression tests for protocol helpers and target matching.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createCommandEnvelope,
  createControlMessage,
  createMediaMetaMessage,
  createPluginControlMessage,
} from './helpers.js';
import { matchesTarget } from './helpers/matches-target.js';

test('matchesTarget returns true for all mode', () => {
  assert.equal(matchesTarget('c1', { mode: 'all' }), true);
});

test('matchesTarget matches group id', () => {
  assert.equal(matchesTarget('c1', { mode: 'group', groupId: 'g1' }, 'g1'), true);
  assert.equal(matchesTarget('c1', { mode: 'group', groupId: 'g1' }, 'g2'), false);
});

test('createControlMessage fills version + timestamp', () => {
  const message = createControlMessage(
    createCommandEnvelope({ actor: 'manager-1', role: 'manager', scopeGroupId: 'group-a' }),
    { mode: 'all' },
    'vibrate',
    { durationMs: 100 }
  );
  assert.equal(message.version, 1);
  assert.equal(typeof message.clientTimestamp, 'number');
});

test('createControlMessage requires command envelope metadata for non-system commands', () => {
  const message = createControlMessage(
    createCommandEnvelope({ actor: 'manager-1', role: 'manager', scopeGroupId: 'group-a' }),
    { mode: 'all' },
    'vibrate',
    { pattern: [100] }
  );

  assert.equal(message.actor, 'manager-1');
  assert.equal(message.role, 'manager');
  assert.equal(message.scopeGroupId, 'group-a');
  assert.equal(typeof message.correlationId, 'string');
  assert.equal(typeof message.idempotencyKey, 'string');
});

test('createPluginControlMessage accepts legacy actorId aliases and emits normalized envelope fields', () => {
  const message = createPluginControlMessage(
    {
      actorId: 'manager-legacy',
      actorRole: 'manager',
      scopeGroupId: 'group-legacy',
      correlationId: 'corr-1',
      idempotencyKey: 'idem-1',
    },
    { mode: 'group', groupId: 'group-legacy' },
    'node-executor',
    'deploy',
    {}
  );

  assert.equal(message.actor, 'manager-legacy');
  assert.equal(message.role, 'manager');
  assert.equal(message.scopeGroupId, 'group-legacy');
  assert.equal(message.correlationId, 'corr-1');
  assert.equal(message.idempotencyKey, 'idem-1');
});

test('createMediaMetaMessage emits normalized envelope fields for scoped media commands', () => {
  const message = createMediaMetaMessage(
    createCommandEnvelope({ actor: 'manager-1', role: 'manager', scopeGroupId: 'group-media' }),
    { mode: 'group', groupId: 'group-media' },
    'audio',
    '/media/demo.mp3',
    123
  );

  assert.equal(message.actor, 'manager-1');
  assert.equal(message.role, 'manager');
  assert.equal(message.scopeGroupId, 'group-media');
  assert.equal(typeof message.correlationId, 'string');
  assert.equal(typeof message.idempotencyKey, 'string');
});
