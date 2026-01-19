import test from 'node:test';
import assert from 'node:assert/strict';

import { ControlPlaneService } from './control-plane.service.js';
import type { GroupPolicy } from './control-plane.types.js';

test('ControlPlaneService: setGroupPolicies seeds ownership to manager', async () => {
  const cp = new ControlPlaneService();
  cp.attachRedis(null);
  await cp.initFromRedisOrEnterSafeMode();

  const policies: GroupPolicy[] = [
    { groupId: 'g1', managerId: 'm1', transferable: false },
    { groupId: 'g2', managerId: 'm1', transferable: true },
  ];

  await cp.setGroupPolicies(policies);

  assert.equal(cp.getOwner('g1'), 'm1');
  assert.equal(cp.getOwner('g2'), 'm1');
});

test('ControlPlaneService: offer/accept pushes ownership for transferable group', async () => {
  const cp = new ControlPlaneService();
  cp.attachRedis(null);
  await cp.initFromRedisOrEnterSafeMode();
  await cp.setSafeMode(false);

  await cp.setGroupPolicies([{ groupId: 'g1', managerId: 'm1', transferable: true }]);

  const offer = await cp.offerTransfer('m1', 'c1', ['g1']);
  assert.ok(offer);

  const accepted = await cp.acceptTransfer(offer.offerId, 'c1');
  assert.deepEqual(accepted, ['g1']);
  assert.equal(cp.getOwner('g1'), 'c1');
});

test('ControlPlaneService: non-transferable group rolls back to manager on client-forward offer', async () => {
  const cp = new ControlPlaneService();
  cp.attachRedis(null);
  await cp.initFromRedisOrEnterSafeMode();
  await cp.setSafeMode(false);

  await cp.setGroupPolicies([
    { groupId: 'g1', managerId: 'm1', transferable: false },
    { groupId: 'g2', managerId: 'm1', transferable: true },
  ]);

  const offer1 = await cp.offerTransfer('m1', 'c1', ['g1', 'g2']);
  assert.ok(offer1);
  await cp.acceptTransfer(offer1.offerId, 'c1');

  assert.equal(cp.getOwner('g1'), 'c1');
  assert.equal(cp.getOwner('g2'), 'c1');

  const offer2 = await cp.offerTransfer('c1', 'c2', ['g1', 'g2']);
  assert.ok(offer2);

  assert.equal(cp.getOwner('g1'), 'm1');

  await cp.acceptTransfer(offer2.offerId, 'c2');
  assert.equal(cp.getOwner('g2'), 'c2');
});

test('ControlPlaneService: disconnect pops ownership back to previous owner', async () => {
  const cp = new ControlPlaneService();
  cp.attachRedis(null);
  await cp.initFromRedisOrEnterSafeMode();
  await cp.setSafeMode(false);

  await cp.setGroupPolicies([{ groupId: 'g1', managerId: 'm1', transferable: true }]);
  const offer = await cp.offerTransfer('m1', 'c1', ['g1']);
  assert.ok(offer);
  await cp.acceptTransfer(offer.offerId, 'c1');

  assert.equal(cp.getOwner('g1'), 'c1');

  await cp.handleActorDisconnected('c1');
  assert.equal(cp.getOwner('g1'), 'm1');
});
