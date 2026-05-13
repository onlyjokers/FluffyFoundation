/**
 * Purpose: Regression coverage for MIDI bridge route planning.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeMidiBridgeRoutes } from './patch-midi-bridge';
import type { GraphState, NodeDefinition } from '$lib/nodes/types';

const graph: GraphState = {
  nodes: [
    { id: 'midi', type: 'midi-map', position: { x: 0, y: 0 }, config: {}, inputValues: {}, outputValues: {} },
    { id: 'target', type: 'number', position: { x: 0, y: 0 }, config: {}, inputValues: {}, outputValues: {} },
    { id: 'sink', type: 'sink-node', position: { x: 0, y: 0 }, config: {}, inputValues: {}, outputValues: {} },
    { id: 'plain', type: 'number', position: { x: 0, y: 0 }, config: {}, inputValues: {}, outputValues: {} },
  ],
  connections: [
    { id: 'valid', sourceNodeId: 'midi', sourcePortId: 'out', targetNodeId: 'target', targetPortId: 'in' },
    { id: 'skip-sink', sourceNodeId: 'midi', sourcePortId: 'out', targetNodeId: 'sink', targetPortId: 'sink' },
    { id: 'skip-non-midi', sourceNodeId: 'plain', sourcePortId: 'out', targetNodeId: 'target', targetPortId: 'in' },
  ],
};

const registry = {
  get(type: string): NodeDefinition | undefined {
    if (type === 'number') {
      return {
        type: 'number',
        label: 'Number',
        inputs: [{ id: 'in', type: 'number' }],
        outputs: [{ id: 'out', type: 'number' }],
        process: () => ({}),
      };
    }
    if (type === 'sink-node') {
      return {
        type: 'sink-node',
        label: 'Sink',
        inputs: [{ id: 'sink', type: 'number', kind: 'sink' }],
        outputs: [],
        process: () => ({}),
      };
    }
    return undefined;
  },
};

test('computeMidiBridgeRoutes maps MIDI outputs to patch input overrides and skips sink ports', () => {
  const result = computeMidiBridgeRoutes(graph, registry, new Set(['target', 'sink']));

  assert.deepEqual(result.routes, [
    {
      sourceNodeId: 'midi',
      sourcePortId: 'out',
      targetNodeId: 'target',
      targetPortId: 'in',
      targetType: 'number',
      key: 'target|in',
    },
  ]);
  assert.deepEqual(Array.from(result.keys), ['target|in']);
});
