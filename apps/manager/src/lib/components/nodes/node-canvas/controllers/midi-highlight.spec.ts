/**
 * Purpose: Regression coverage for canvas activity highlight traversal.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeNodeActivityHighlightState } from './midi-highlight';

const graph = {
  nodes: [
    { id: 'source', type: 'number', position: { x: 0, y: 0 }, config: {}, inputValues: {}, outputValues: {} },
    { id: 'scale', type: 'math-scale', position: { x: 0, y: 0 }, config: {}, inputValues: {}, outputValues: {} },
    { id: 'sink', type: 'client-object', position: { x: 0, y: 0 }, config: {}, inputValues: {}, outputValues: {} },
  ],
  connections: [
    {
      id: 'source-to-scale',
      sourceNodeId: 'source',
      sourcePortId: 'out',
      targetNodeId: 'scale',
      targetPortId: 'in',
    },
    {
      id: 'scale-to-sink',
      sourceNodeId: 'scale',
      sourcePortId: 'out',
      targetNodeId: 'sink',
      targetPortId: 'index',
    },
  ],
};

test('node activity highlight uses MIDI visual state for downstream graph changes', () => {
  const result = computeNodeActivityHighlightState({
    graph,
    disabledNodeIds: new Set(),
    sourceNodeId: 'source',
    sourcePortId: 'out',
    traversalStopNodeTypes: new Set(['client-object']),
  });

  assert.ok(result);
  assert.deepEqual([...result.nodeIds].sort(), ['scale', 'source']);
  assert.deepEqual([...result.connectionIds].sort(), ['scale-to-sink', 'source-to-scale']);
  assert.deepEqual([...result.outputPortsByNode.get('source') ?? []], ['out']);
  assert.deepEqual([...result.inputPortsByNode.get('scale') ?? []], ['in']);
  assert.deepEqual([...result.outputPortsByNode.get('scale') ?? []], ['out']);
  assert.equal(result.inputPortsByNode.has('sink'), false);
});

test('node activity highlight follows custom-node expanded projection connections', () => {
  const projectionGraph = {
    nodes: [
      {
        id: 'source',
        type: 'number',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'custom-1',
        type: 'custom:def-1',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'view:custom:custom-1:input-proxy',
        type: 'group-proxy',
        position: { x: 0, y: 0 },
        config: { editorProjection: true },
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'view:custom:custom-1:inner',
        type: 'scene-fct-track',
        position: { x: 0, y: 0 },
        config: { editorProjection: true },
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [
      {
        id: 'canonical-source-to-custom',
        sourceNodeId: 'source',
        sourcePortId: 'value',
        targetNodeId: 'custom-1',
        targetPortId: 'brightness',
      },
      {
        id: 'view:custom:custom-1:conn:external-in:canonical-source-to-custom',
        sourceNodeId: 'source',
        sourcePortId: 'value',
        targetNodeId: 'view:custom:custom-1:input-proxy',
        targetPortId: 'in',
      },
      {
        id: 'view:custom:custom-1:conn:proxy-to-inner',
        sourceNodeId: 'view:custom:custom-1:input-proxy',
        sourcePortId: 'out',
        targetNodeId: 'view:custom:custom-1:inner',
        targetPortId: 'brightness',
      },
    ],
  };

  const result = computeNodeActivityHighlightState({
    graph: projectionGraph,
    disabledNodeIds: new Set(),
    sourceNodeId: 'source',
    sourcePortId: 'value',
    traversalStopNodeTypes: new Set(['client-object']),
  });

  assert.ok(result);
  assert.deepEqual(
    [...result.connectionIds].sort(),
    [
      'canonical-source-to-custom',
      'view:custom:custom-1:conn:external-in:canonical-source-to-custom',
      'view:custom:custom-1:conn:proxy-to-inner',
    ]
  );
  assert.deepEqual(
    [...result.nodeIds].sort(),
    ['custom-1', 'source', 'view:custom:custom-1:inner', 'view:custom:custom-1:input-proxy']
  );
});
