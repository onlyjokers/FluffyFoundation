// Purpose: Regression coverage for group runtime-gate disabled node calculation.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GraphState } from '$lib/nodes/types';
import type { NodeGroup } from './group-types';
import { computeGroupDisabledNodeIds } from './group-disabled-nodes';

const graph: GraphState = {
  nodes: [
    { id: 'name', type: 'independent-variable-name', position: { x: 0, y: 0 }, config: {}, inputValues: {}, outputValues: {} },
    { id: 'setter', type: 'set-boolean-variable', position: { x: 0, y: 0 }, config: {}, inputValues: {}, outputValues: {} },
    { id: 'getter', type: 'get-boolean-variable', position: { x: 0, y: 0 }, config: {}, inputValues: {}, outputValues: {} },
    { id: 'gate', type: 'group-gate', position: { x: 0, y: 0 }, config: {}, inputValues: {}, outputValues: {} },
    { id: 'button', type: 'client-button', position: { x: 0, y: 0 }, config: {}, inputValues: {}, outputValues: {} },
  ],
  connections: [],
};

const group = (patch: Partial<NodeGroup> & { id: string; nodeIds: string[] }): NodeGroup => ({
  id: patch.id,
  parentId: patch.parentId ?? null,
  name: patch.name ?? patch.id,
  nodeIds: patch.nodeIds,
  disabled: patch.disabled ?? false,
  minimized: patch.minimized ?? false,
  runtimeActive: patch.runtimeActive,
});

test('computeGroupDisabledNodeIds keeps variable state nodes enabled when group gate closes', () => {
  const disabled = computeGroupDisabledNodeIds(graph, [
    group({
      id: 'group:inner',
      nodeIds: ['name', 'setter', 'getter', 'gate', 'button'],
      runtimeActive: false,
    }),
  ]);

  assert.deepEqual(Array.from(disabled).sort(), ['button']);
});

test('computeGroupDisabledNodeIds keeps state nodes enabled across nested gated groups', () => {
  const disabled = computeGroupDisabledNodeIds(graph, [
    group({
      id: 'group:inner',
      parentId: 'group:outer',
      nodeIds: ['setter', 'button'],
      runtimeActive: false,
    }),
    group({
      id: 'group:outer',
      nodeIds: ['name', 'getter', 'setter', 'button'],
      runtimeActive: false,
    }),
  ]);

  assert.deepEqual(Array.from(disabled).sort(), ['button']);
});
