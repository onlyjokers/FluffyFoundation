// Purpose: tests for pure patch-runtime helper behavior.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GraphState, NodeDefinition } from '$lib/nodes/types';
import {
  applyTimeRangePlayheadsToPatchPayload,
  computeTopologySignature,
  isDefinitionBypassableWhenDisabled,
} from './patch-runtime-helpers';

const graphA: Pick<GraphState, 'nodes' | 'connections'> = {
  nodes: [
    { id: 'b', type: 'number', position: { x: 0, y: 0 }, config: {}, inputValues: {}, outputValues: {} },
    { id: 'a', type: 'logic-add', position: { x: 0, y: 0 }, config: {}, inputValues: {}, outputValues: {} },
  ],
  connections: [
    { id: 'c2', sourceNodeId: 'b', sourcePortId: 'out', targetNodeId: 'a', targetPortId: 'b' },
    { id: 'c1', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' },
  ],
};

const graphB: Pick<GraphState, 'nodes' | 'connections'> = {
  nodes: [...graphA.nodes].reverse(),
  connections: [...graphA.connections].reverse(),
};

test('computeTopologySignature is stable regardless of node and connection order', () => {
  assert.equal(computeTopologySignature(graphA), computeTopologySignature(graphB));
});

test('isDefinitionBypassableWhenDisabled allows matching non-command input and output ports', () => {
  const def: NodeDefinition = {
    type: 'pass',
    label: 'Pass',
    inputs: [{ id: 'in', type: 'number' }],
    outputs: [{ id: 'out', type: 'number' }],
    process: () => ({}),
  };

  assert.equal(isDefinitionBypassableWhenDisabled(def), true);
});

test('isDefinitionBypassableWhenDisabled rejects command/client pass-throughs', () => {
  const def: NodeDefinition = {
    type: 'cmd-pass',
    label: 'Command Pass',
    inputs: [{ id: 'in', type: 'command' }],
    outputs: [{ id: 'out', type: 'command' }],
    process: () => ({}),
  };

  assert.equal(isDefinitionBypassableWhenDisabled(def), false);
});

test('applyTimeRangePlayheadsToPatchPayload injects cursorSec for asset media nodes only', () => {
  const payload = {
    graph: {
      nodes: [
        {
          id: 'audio',
          type: 'load-audio-from-assets',
          position: { x: 0, y: 0 },
          config: {},
          inputValues: { assetId: 'a1' },
          outputValues: {},
        },
        {
          id: 'number',
          type: 'number',
          position: { x: 0, y: 0 },
          config: {},
          inputValues: {},
          outputValues: {},
        },
      ],
      connections: [],
    },
    meta: {
      loopId: 'patch:test',
      requiredCapabilities: [],
      tickIntervalMs: 33,
      protocolVersion: 'test',
      executorVersion: 'test',
    },
    assetRefs: [],
  };

  applyTimeRangePlayheadsToPatchPayload(payload, (nodeId) => (nodeId === 'audio' ? 12.5 : null));

  assert.equal(payload.graph.nodes[0].inputValues.cursorSec, 12.5);
  assert.equal(Object.hasOwn(payload.graph.nodes[1].inputValues, 'cursorSec'), false);
});
