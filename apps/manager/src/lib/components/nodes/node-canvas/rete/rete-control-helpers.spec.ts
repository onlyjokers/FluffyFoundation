// Purpose: Regression tests for pure Rete control helper behavior.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildAssetContentUrl,
  buildClientPickerView,
  shouldUpdateClientPickerView,
} from './rete-control-helpers';
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

test('shouldUpdateClientPickerView skips equal picker snapshots', () => {
  const previous = [
    { client: { clientId: 'display-1', connected: true } as any, selected: true, primary: true },
    { client: { clientId: 'display-2', connected: true } as any, selected: false, primary: false },
  ];
  const same = [
    { client: { clientId: 'display-1', connected: true } as any, selected: true, primary: true },
    { client: { clientId: 'display-2', connected: true } as any, selected: false, primary: false },
  ];
  const changed = [
    { client: { clientId: 'display-1', connected: true } as any, selected: false, primary: false },
    { client: { clientId: 'display-2', connected: true } as any, selected: true, primary: true },
  ];

  assert.equal(shouldUpdateClientPickerView(previous, same), false);
  assert.equal(shouldUpdateClientPickerView(previous, changed), true);
});

test('buildAssetContentUrl accepts asset refs and emits raw asset content URLs', () => {
  assert.equal(
    buildAssetContentUrl('https://10.30.229.86:3001', 'asset:12f199f0-4839-45cb-b08e-e75d80504aa4'),
    'https://10.30.229.86:3001/api/assets/12f199f0-4839-45cb-b08e-e75d80504aa4/content'
  );
});
