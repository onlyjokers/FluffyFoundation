/**
 * Purpose: FF-12 contract tests for ControlPlane actor roles, capabilities, and Group ownership entries.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CONTROL_PLANE_CAPABILITIES_BY_ROLE,
  createControlPlaneActor,
  createGroupOwnershipEntry,
  createTransferOffer,
  getControlPlaneCapabilities,
  isControlPlaneActorRole,
} from './control-plane.js';

test('ControlPlane defines explicit capability scopes for manager, client, service, and AI actors', () => {
  assert.equal(isControlPlaneActorRole('manager'), true);
  assert.equal(isControlPlaneActorRole('client'), true);
  assert.equal(isControlPlaneActorRole('service'), true);
  assert.equal(isControlPlaneActorRole('ai'), true);

  assert.ok(CONTROL_PLANE_CAPABILITIES_BY_ROLE.manager.includes('group.reclaim'));
  assert.ok(CONTROL_PLANE_CAPABILITIES_BY_ROLE.manager.includes('group.mutate'));
  assert.ok(CONTROL_PLANE_CAPABILITIES_BY_ROLE.client.includes('group.view'));
  assert.equal(CONTROL_PLANE_CAPABILITIES_BY_ROLE.client.includes('group.mutate'), false);
  assert.ok(CONTROL_PLANE_CAPABILITIES_BY_ROLE.service.includes('partition.stop'));
  assert.ok(CONTROL_PLANE_CAPABILITIES_BY_ROLE.ai.includes('proposal.create'));
  assert.equal(CONTROL_PLANE_CAPABILITIES_BY_ROLE.ai.includes('group.mutate'), false);
  assert.equal((CONTROL_PLANE_CAPABILITIES_BY_ROLE.ai as string[]).includes('secret.read'), false);
});

test('ControlPlane actors are normalized with role-bounded capabilities', () => {
  const actor = createControlPlaneActor({
    id: 'ai-operator-1',
    role: 'ai',
    capabilities: ['proposal.create', 'group.mutate'],
  });

  assert.deepEqual(actor, {
    id: 'ai-operator-1',
    role: 'ai',
    capabilities: ['proposal.create'],
  });
  assert.deepEqual(getControlPlaneCapabilities('root'), [
    'group.view',
    'group.mutate',
    'group.reclaim',
    'group.release',
    'group.transfer.offer',
    'group.transfer.accept',
    'group.transfer.deny',
    'group.transfer.revoke',
    'group.archive',
    'group.restore',
    'partition.deploy',
    'partition.stop',
    'root.stopAll',
    'proposal.create',
  ]);
});

test('Group ownership entry records owner stack, transferability, surface, and readonly visibility', () => {
  const entry = createGroupOwnershipEntry({
    groupId: 'stage-left',
    owner: createControlPlaneActor({ id: 'manager-1', role: 'manager' }),
    ownerStack: [createControlPlaneActor({ id: 'root', role: 'root' })],
    transferable: true,
    surface: 'public',
    selectedClientIds: ['client-1'],
  });

  assert.equal(entry.groupId, 'stage-left');
  assert.equal(entry.owner.actorId, 'manager-1');
  assert.equal(entry.ownerStack[0]?.role, 'root');
  assert.equal(entry.transferable, true);
  assert.equal(entry.surface, 'public');
  assert.equal(entry.visibility.defaultAccess, 'visible-readonly');
  assert.deepEqual(entry.selectedClientIds, ['client-1']);
});

test('client transfer offers carry target confirmation, TTL, and scoped mutate capability', () => {
  const offer = createTransferOffer({
    transferId: 'transfer-stage-left-client-1',
    groupId: 'stage-left',
    offeredBy: createControlPlaneActor({ id: 'manager-1', role: 'manager' }),
    targetClientId: 'client-1',
    ttlMs: 30_000,
    now: 1_000,
  });

  assert.equal(offer.status, 'pending');
  assert.equal(offer.groupId, 'stage-left');
  assert.equal(offer.targetClientId, 'client-1');
  assert.equal(offer.expiresAt, 31_000);
  assert.equal(offer.capability.scopeGroupId, 'stage-left');
  assert.equal(offer.capability.targetClientId, 'client-1');
  assert.deepEqual(offer.capability.capabilities, ['group.view', 'group.mutate', 'group.release']);
});
