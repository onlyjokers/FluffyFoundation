// Purpose: Regression tests for pure Rete control helper behavior.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildClientPickerView } from './rete-control-helpers';
import type { GraphState, NodeInstance } from '$lib/nodes/types';

const clients = [
  { clientId: 'display-1', group: 'display', connected: true },
  { clientId: 'display-2', group: 'display', connected: true },
];

const graphState: GraphState = { nodes: [], connections: [] };

const node = (
  inputValues: Record<string, unknown>,
  config: Record<string, unknown> = {}
): NodeInstance => ({
  id: 'display-node',
  type: 'display-object',
  position: { x: 0, y: 0 },
  config,
  inputValues,
  outputValues: {},
});

test('display client picker highlights displayId when routing inputs are unset', () => {
  const view = buildClientPickerView({
    data: { controlType: 'client-picker', nodeId: 'display-node', nodeType: 'display-object' },
    graphState,
    audienceClients: clients,
    getNode: () => node({}, { displayId: 'display-2' }),
    getLastComputedInputs: () => null,
  });

  assert.deepEqual(
    view.map((item) => ({ id: item.client.clientId, selected: item.selected, primary: item.primary })),
    [
      { id: 'display-1', selected: false, primary: false },
      { id: 'display-2', selected: true, primary: true },
    ]
  );
});

test('display client picker highlights index and range ahead of displayId', () => {
  const view = buildClientPickerView({
    data: { controlType: 'client-picker', nodeId: 'display-node', nodeType: 'display-object' },
    graphState,
    audienceClients: clients,
    getNode: () => node({ index: 1, range: 2 }, { displayId: 'display-2' }),
    getLastComputedInputs: () => null,
  });

  assert.deepEqual(
    view.map((item) => ({ id: item.client.clientId, selected: item.selected, primary: item.primary })),
    [
      { id: 'display-1', selected: true, primary: true },
      { id: 'display-2', selected: true, primary: false },
    ]
  );
});
