// Purpose: verify FF-12 Group sovereignty policy in the shared semantic command layer.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGroupSovereigntyPolicy,
  createSemanticCommandBus,
} from '../dist-node-core/semantic-command-bus.js';

const graph = {
  nodes: [
    {
      id: 'n1',
      type: 'number',
      position: { x: 0, y: 0 },
      config: {},
      inputValues: {},
      outputValues: {},
    },
  ],
  connections: [],
};

const ownedGroup = {
  id: 'group:stage-left',
  parentId: null,
  name: 'Stage Left',
  nodeIds: ['n1'],
  disabled: false,
  owner: { actorId: 'manager-a', role: 'manager', capabilities: ['group.mutate', 'group.reclaim'] },
  ownerStack: [{ actorId: 'root', role: 'root', capabilities: ['root.stopAll', 'group.reclaim'] }],
  transferable: true,
  surface: 'public',
  visibility: { defaultAccess: 'visible-readonly' },
};

function createBus(groups = [ownedGroup]) {
  return createSemanticCommandBus({
    graph,
    groups,
    definitions: [{ type: 'number', label: 'Number', category: 'Values', inputs: [], outputs: [], configSchema: [] }],
    policy: createGroupSovereigntyPolicy(),
  });
}

test('illegal actor can view public Group but cannot mutate it', () => {
  const bus = createBus();

  const denied = bus.dispatch({
    actor: { id: 'manager-b', role: 'manager' },
    command: { type: 'node.params.update', nodeId: 'n1', params: { value: 9 } },
  });

  assert.equal(denied.ok, false);
  assert.equal(denied.stage, 'policy');
  assert.match(denied.message, /visible-readonly/);
  assert.equal(bus.getSnapshot().nodes[0]?.params.value, undefined);
});

test('Manager can reclaim a transferable public Group and then mutate it', () => {
  const bus = createBus();

  const reclaimed = bus.dispatch({
    actor: { id: 'manager-b', role: 'manager' },
    command: { type: 'group.reclaim', groupId: 'group:stage-left' },
  });
  assert.equal(reclaimed.ok, true);
  assert.equal(bus.getSnapshot().groups[0]?.owner?.actorId, 'manager-b');
  assert.equal(bus.getSnapshot().groups[0]?.ownerStack.at(-1)?.actorId, 'manager-a');

  const changed = bus.dispatch({
    actor: { id: 'manager-b', role: 'manager' },
    command: { type: 'node.params.update', nodeId: 'n1', params: { value: 9 } },
  });
  assert.equal(changed.ok, true);
  assert.equal(bus.getSnapshot().nodes[0]?.params.value, 9);
});

test('Root has emergency authority to stop all partitions across Group ownership', () => {
  const bus = createSemanticCommandBus({
    graph,
    groups: [ownedGroup],
    partitions: [
      { id: 'partition:one', nodeIds: ['n1'], status: 'deployed' },
      { id: 'partition:two', nodeIds: [], status: 'deployed' },
    ],
    definitions: [{ type: 'number', label: 'Number', category: 'Values', inputs: [], outputs: [], configSchema: [] }],
    policy: createGroupSovereigntyPolicy(),
  });

  const stopped = bus.dispatch({
    actor: { id: 'root', role: 'root' },
    command: { type: 'partition.stop.all' },
  });

  assert.equal(stopped.ok, true);
  assert.deepEqual(
    bus.getSnapshot().partitions.map((partition) => partition.status),
    ['stopped', 'stopped']
  );
});

test('Group delete archives by default and restore reactivates the Group', () => {
  const bus = createBus();

  const deleted = bus.dispatch({
    actor: { id: 'manager-a', role: 'manager' },
    command: { type: 'group.delete', groupId: 'group:stage-left' },
  });
  assert.equal(deleted.ok, true);
  assert.equal(bus.getSnapshot().groups[0]?.archived, true);
  assert.equal(bus.getSnapshot().groups.length, 1);

  const restored = bus.dispatch({
    actor: { id: 'manager-a', role: 'manager' },
    command: { type: 'group.restore', groupId: 'group:stage-left' },
  });
  assert.equal(restored.ok, true);
  assert.equal(bus.getSnapshot().groups[0]?.archived, false);
});

test('AI actor can create proposals but cannot directly mutate Canvas graph or read secrets', () => {
  const bus = createBus();

  const proposed = bus.dispatch({
    actor: { id: 'ai-1', role: 'ai' },
    command: {
      type: 'proposal.create',
      proposal: {
        id: 'proposal:ai-1',
        title: 'Suggest value update',
        commands: [{ type: 'node.params.update', nodeId: 'n1', params: { value: 3 } }],
      },
    },
  });
  assert.equal(proposed.ok, true);

  const direct = bus.dispatch({
    actor: { id: 'ai-1', role: 'ai' },
    command: { type: 'node.params.update', nodeId: 'n1', params: { value: 3 } },
  });
  assert.equal(direct.ok, false);
  assert.match(direct.message, /proposal/);
});

test('unauthorized actor cannot approve proposals through semantic command bus policy', () => {
  const bus = createSemanticCommandBus({
    graph,
    groups: [ownedGroup],
    definitions: [{ type: 'number', label: 'Number', category: 'Values', inputs: [], outputs: [], configSchema: [] }],
    policy: createGroupSovereigntyPolicy(),
    revision: 40,
    proposals: [
      {
        id: 'proposal:restricted',
        title: 'Restricted approval',
        status: 'proposed',
        commands: [{ type: 'node.params.update', nodeId: 'n1', params: { value: 7 } }],
      },
    ],
  });

  const denied = bus.dispatch({
    actor: { id: 'ai-1', role: 'ai' },
    command: { type: 'proposal.approve', proposalId: 'proposal:restricted', approvedBy: 'ai-1' },
  });

  assert.equal(denied.ok, false);
  assert.equal(denied.stage, 'policy');
  assert.match(denied.message, /approval authority/);
  assert.equal(bus.getSnapshot().proposals?.[0]?.status, 'proposed');
  assert.equal(bus.getSnapshot().revision, 40);
  assert.equal(bus.getHistory().length, 0);
  assert.equal(bus.getAuditLog().length, 0);
});
