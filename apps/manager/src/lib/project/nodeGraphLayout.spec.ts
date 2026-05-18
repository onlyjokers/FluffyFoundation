// Purpose: Verify Manager-only Node Graph layout persistence stays scoped to node positions.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  clearNodeGraphLayout,
  NODE_GRAPH_LAYOUT_STORAGE_KEY,
  patchNodeGraphLayoutPosition,
  readNodeGraphLayoutPositions,
  saveNodeGraphLayoutFromGraph,
} from './nodeGraphLayout';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    raw: values,
  };
}

test('saveNodeGraphLayoutFromGraph persists only node positions by id', () => {
  const storage = memoryStorage();

  saveNodeGraphLayoutFromGraph(
    {
      nodes: [
        {
          id: 'n1',
          type: 'number',
          position: { x: 12, y: 34 },
          config: { value: 1 },
          inputValues: {},
          outputValues: { out: 1 },
        },
      ],
    },
    storage
  );

  assert.deepEqual(JSON.parse(storage.raw.get(NODE_GRAPH_LAYOUT_STORAGE_KEY) ?? '{}'), {
    n1: { x: 12, y: 34 },
  });
  assert.deepEqual(Array.from(readNodeGraphLayoutPositions(storage)), [['n1', { x: 12, y: 34 }]]);
});

test('patchNodeGraphLayoutPosition updates one node without clearing other saved positions', () => {
  const storage = memoryStorage();
  saveNodeGraphLayoutFromGraph(
    {
      nodes: [
        { id: 'a', type: 'number', position: { x: 1, y: 2 }, config: {}, inputValues: {}, outputValues: {} },
        { id: 'b', type: 'number', position: { x: 3, y: 4 }, config: {}, inputValues: {}, outputValues: {} },
      ],
    },
    storage
  );

  patchNodeGraphLayoutPosition('b', { x: 30, y: 40 }, storage);

  assert.deepEqual(Array.from(readNodeGraphLayoutPositions(storage)), [
    ['a', { x: 1, y: 2 }],
    ['b', { x: 30, y: 40 }],
  ]);
});

test('clearNodeGraphLayout removes saved layout positions', () => {
  const storage = memoryStorage();
  patchNodeGraphLayoutPosition('n1', { x: 1, y: 2 }, storage);

  clearNodeGraphLayout(storage);

  assert.equal(storage.raw.has(NODE_GRAPH_LAYOUT_STORAGE_KEY), false);
});
