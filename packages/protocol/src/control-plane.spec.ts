/**
 * Purpose: FF-12 contract tests for ControlPlane actor roles, capabilities, and Group ownership entries.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CONTROL_PLANE_CAPABILITIES_BY_ROLE,
  createExecutionPartition,
  createPartitionFailureReport,
  createControlPlaneActor,
  createGroupOwnershipEntry,
  getControlPlaneCapabilities,
  isControlPlaneActorRole,
  isExecutionTargetPlatform,
  validatePartitionLifecycleRequest,
} from './control-plane.js';

test('ControlPlane defines explicit capability scopes for manager, client, service, and AI actors', () => {
  assert.equal(isControlPlaneActorRole('root'), false);
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
  assert.throws(() => getControlPlaneCapabilities('root' as never));
});

test('Group ownership entry records owner stack, transferability, surface, and readonly visibility', () => {
  const entry = createGroupOwnershipEntry({
    groupId: 'stage-left',
    owner: createControlPlaneActor({ id: 'manager-1', role: 'manager' }),
    ownerStack: [createControlPlaneActor({ id: 'manager-original', role: 'manager' })],
    transferable: true,
    surface: 'public',
    selectedClientIds: ['client-1'],
  });

  assert.equal(entry.groupId, 'stage-left');
  assert.equal(entry.owner.actorId, 'manager-1');
  assert.equal(entry.ownerStack[0]?.role, 'manager');
  assert.equal(entry.transferable, true);
  assert.equal(entry.surface, 'public');
  assert.equal(entry.visibility.defaultAccess, 'visible-readonly');
  assert.deepEqual(entry.selectedClientIds, ['client-1']);
});

test('Execution partitions define FF-14 target platforms and structured status metadata', () => {
  assert.equal(isExecutionTargetPlatform('manager'), true);
  assert.equal(isExecutionTargetPlatform('client'), true);
  assert.equal(isExecutionTargetPlatform('display'), true);
  assert.equal(isExecutionTargetPlatform('server'), true);
  assert.equal(isExecutionTargetPlatform('worker'), true);
  assert.equal(isExecutionTargetPlatform('local-only'), true);
  assert.equal(isExecutionTargetPlatform('browser'), false);

  const partition = createExecutionPartition({
    id: 'partition:display',
    nodeIds: ['visual-1'],
    targetPlatform: 'display',
    status: 'deployed',
    requiredCapabilities: ['display.render'],
    boundRevision: 12,
    resourceBudget: { maxTickHz: 30, maxMemoryMb: 128 },
    watchdog: { timeoutMs: 1500, failureThreshold: 2 },
  });

  assert.deepEqual(partition, {
    id: 'partition:display',
    nodeIds: ['visual-1'],
    targetPlatform: 'display',
    status: 'deployed',
    requiredCapabilities: ['display.render'],
    boundRevision: 12,
    resourceBudget: { maxTickHz: 30, maxMemoryMb: 128 },
    watchdog: { timeoutMs: 1500, failureThreshold: 2 },
  });
});

test('partition lifecycle validation rejects bad capability and revision mismatches', () => {
  const rejected = validatePartitionLifecycleRequest({
    operation: 'deploy',
    partition: createExecutionPartition({
      id: 'partition:client',
      nodeIds: ['n1'],
      targetPlatform: 'client',
      requiredCapabilities: ['sensor.gyro', 'camera.front'],
      boundRevision: 5,
    }),
    actor: createControlPlaneActor({ id: 'manager-1', role: 'manager' }),
    availableCapabilities: ['sensor.gyro'],
    currentRevision: 5,
  });

  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason?.code, 'partition.capability.missing');
  assert.deepEqual(rejected.reason?.missingCapabilities, ['camera.front']);

  const stale = validatePartitionLifecycleRequest({
    operation: 'start',
    partition: createExecutionPartition({
      id: 'partition:client',
      nodeIds: ['n1'],
      targetPlatform: 'client',
      boundRevision: 4,
    }),
    actor: createControlPlaneActor({ id: 'manager-1', role: 'manager' }),
    availableCapabilities: [],
    currentRevision: 5,
  });

  assert.equal(stale.ok, false);
  assert.equal(stale.reason?.code, 'partition.revision_mismatch');
  assert.equal(stale.reason?.expectedRevision, 5);
  assert.equal(stale.reason?.actualRevision, 4);
});

test('partition failure reports preserve watchdog and budget details for AI-visible audit', () => {
  const report = createPartitionFailureReport({
    partitionId: 'partition:worker',
    targetPlatform: 'worker',
    code: 'watchdog.timeout',
    message: 'Partition watchdog timed out.',
    atRevision: 9,
    watchdog: { timeoutMs: 500, lastHeartbeatAt: 1000, missedHeartbeats: 3 },
    resourceBudget: { maxTickHz: 60, maxMemoryMb: 64, observedTickHz: 90, observedMemoryMb: 72 },
  });

  assert.equal(report.kind, 'partition-failure-report');
  assert.equal(report.partitionId, 'partition:worker');
  assert.equal(report.watchdog?.missedHeartbeats, 3);
  assert.equal(report.resourceBudget?.observedTickHz, 90);
});
