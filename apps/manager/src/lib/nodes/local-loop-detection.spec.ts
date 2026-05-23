// Purpose: tests for local client loop detection used by the manager node engine.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Connection, GraphState } from './types';
import { detectLocalClientLoops } from './local-loop-detection';

const node = (id: string, type: string) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  config: {},
  inputValues: {},
  outputValues: {},
});

const connection = (
  id: string,
  sourceNodeId: string,
  targetNodeId: string,
  sourcePortId = 'out',
  targetPortId = 'in'
): Connection => ({ id, sourceNodeId, sourcePortId, targetNodeId, targetPortId });

test('detectLocalClientLoops returns client-sensor cycles with stable ids and capabilities', () => {
  const graph: GraphState = {
    nodes: [
      node('client-a', 'client-loader'),
      node('sensors-a', 'proc-client-sensors'),
      node('screen-a', 'proc-screen-color'),
      node('loose-number', 'number'),
    ],
    connections: [
      connection('c1', 'client-a', 'sensors-a'),
      connection('c2', 'sensors-a', 'screen-a'),
      connection('c3', 'screen-a', 'client-a'),
    ],
  };

  const loops = detectLocalClientLoops(graph);

  assert.equal(loops.length, 1);
  assert.equal(loops[0].id, 'loop:client-a:17k12q6');
  assert.deepEqual(new Set(loops[0].nodeIds), new Set(['client-a', 'sensors-a', 'screen-a']));
  assert.deepEqual(new Set(loops[0].connectionIds), new Set(['c1', 'c2', 'c3']));
  assert.deepEqual(new Set(loops[0].requiredCapabilities), new Set(['sensors', 'screen']));
  assert.deepEqual(loops[0].clientsInvolved, ['client-a']);
});

test('detectLocalClientLoops ignores cycles without exactly one client and sensor node', () => {
  const graph: GraphState = {
    nodes: [
      node('client-a', 'client-loader'),
      node('client-b', 'client-loader'),
      node('n1', 'number'),
      node('n2', 'number'),
      node('sensors-a', 'proc-client-sensors'),
    ],
    connections: [
      connection('c1', 'client-a', 'n1'),
      connection('c2', 'n1', 'client-a'),
      connection('c3', 'client-b', 'sensors-a'),
      connection('c4', 'sensors-a', 'client-b'),
      connection('c5', 'client-a', 'client-b'),
      connection('c6', 'client-b', 'client-a'),
    ],
  };

  const loops = detectLocalClientLoops(graph);

  assert.equal(loops.length, 0);
});
