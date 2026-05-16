// Purpose: tests for pure group-from-selection planning.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GraphState } from '$lib/nodes/types';
import type { LocalLoop } from '$lib/nodes';
import type { NodeGroup } from './group-types';
import { planGroupFromSelection } from './group-selection-plan';

const node = (id: string, type = 'number'): GraphState['nodes'][number] => ({
  id,
  type,
  position: { x: 0, y: 0 },
  config: {},
  inputValues: {},
  outputValues: {},
});

const group = (id: string, nodeIds: string[], parentId: string | null = null): NodeGroup => ({
  id,
  parentId,
  name: id,
  nodeIds,
  disabled: false,
  minimized: false,
});

const graph = (ids: string[]): GraphState => ({
  nodes: ids.map((id) => node(id)),
  connections: [],
});

test('planGroupFromSelection filters decoration nodes and creates a root group name', () => {
  const result = planGroupFromSelection({
    selectionNodeIds: ['a', 'group-port:1'],
    graph: { nodes: [node('a'), node('group-port:1', 'group-proxy')], connections: [] },
    groups: [],
    localLoops: [],
    createId: () => 'group:new',
  });

  assert.equal(result.group?.id, 'group:new');
  assert.equal(result.group?.name, 'Group 1');
  assert.deepEqual(result.group?.nodeIds, ['a']);
  assert.equal(result.deniedNodeIds.length, 0);
});

test('planGroupFromSelection can create an AI Space from the current selection', () => {
  const result = planGroupFromSelection({
    selectionNodeIds: ['a'],
    graph: graph(['a']),
    groups: [],
    localLoops: [],
    createId: () => 'ai-space:new',
    kind: 'ai-space',
  });

  assert.equal(result.group?.id, 'ai-space:new');
  assert.equal(result.group?.kind, 'ai-space');
  assert.equal(result.group?.name, 'AI Space 1');
  assert.deepEqual(result.group?.agentPolicy?.targetScope, {
    nodeIds: ['a'],
    allowNewNodes: true,
  });
});

test('planGroupFromSelection denies cross-group selections', () => {
  const result = planGroupFromSelection({
    selectionNodeIds: ['a', 'b'],
    graph: graph(['a', 'b']),
    groups: [group('existing', ['a'])],
    localLoops: [],
    createId: () => 'group:new',
  });

  assert.deepEqual(result.group?.nodeIds, ['b']);
  assert.deepEqual(result.deniedNodeIds, ['a']);
});

test('planGroupFromSelection expands eligible local loops inside the same parent group', () => {
  const localLoop: LocalLoop = {
    id: 'loop:1',
    nodeIds: ['a', 'b'],
    connectionIds: [],
    requiredCapabilities: [],
    clientsInvolved: [],
  };

  const result = planGroupFromSelection({
    selectionNodeIds: ['a'],
    graph: graph(['a', 'b']),
    groups: [],
    localLoops: [localLoop],
    createId: () => 'group:new',
  });

  assert.deepEqual(result.group?.nodeIds, ['a', 'b']);
});

test('planGroupFromSelection nests under the smallest containing group', () => {
  const result = planGroupFromSelection({
    selectionNodeIds: ['b'],
    graph: graph(['a', 'b']),
    groups: [group('parent', ['a', 'b'])],
    localLoops: [],
    createId: () => 'group:new',
  });

  assert.equal(result.group?.parentId, 'parent');
  assert.equal(result.group?.name, 'Sub Group 1');
});
