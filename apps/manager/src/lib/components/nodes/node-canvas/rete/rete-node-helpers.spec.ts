import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildGroupFrameProxyPorts,
  formatPortValue,
  inferBypassPorts,
  sortByIndex,
  type PortDefinitionLike,
} from './rete-node-helpers';

test('sortByIndex keeps existing index ordering semantics', () => {
  const entries: Array<[string, { index?: number } | undefined]> = [
    ['late', { index: 2 }],
    ['missing', undefined],
    ['early', { index: 1 }],
  ];

  assert.deepEqual(
    sortByIndex(entries).map(([key]) => key),
    ['missing', 'early', 'late']
  );
});

test('buildGroupFrameProxyPorts derives labels and frame-relative ordering', () => {
  const result = buildGroupFrameProxyPorts({
    groupId: 'group-1',
    groupTop: 100,
    nodes: [
      { id: 'target', type: 'number-node' },
      { id: 'source', type: 'number-node' },
      {
        id: 'proxy-out',
        type: 'group-proxy',
        config: { groupId: 'group-1', direction: 'output', portType: 'number' },
        position: { y: 150 },
      },
      {
        id: 'proxy-in',
        type: 'group-proxy',
        config: { groupId: 'group-1', direction: 'input', portType: 'bogus' },
        position: { y: 120 },
      },
    ],
    connections: [
      { sourceNodeId: 'source', sourcePortId: 'out', targetNodeId: 'proxy-out', targetPortId: 'in' },
      { sourceNodeId: 'proxy-in', sourcePortId: 'out', targetNodeId: 'target', targetPortId: 'in' },
    ],
    getPortLabel: (_nodeId, side, portId) => `${side}:${portId}`,
  });

  assert.deepEqual(
    result.ports.map((port) => [port.id, port.direction, port.portType, port.centerY, port.label]),
    [
      ['proxy-in', 'input', 'any', 30, 'input:in'],
      ['proxy-out', 'output', 'number', 60, 'output:out'],
    ]
  );
  assert.equal(result.areaHeight, 40);
});

test('formatPortValue matches ReteNode live port display semantics', () => {
  assert.equal(formatPortValue('number', 1.2300), '1.23');
  assert.equal(formatPortValue('number', null), '--');
  assert.equal(formatPortValue('fuzzy', 0.33333), '0.333');
  assert.equal(formatPortValue('boolean', true), 'true');
  assert.equal(formatPortValue('boolean', 'true'), null);
  assert.equal(formatPortValue('client', { clientId: 'client-1' }), 'client-1');
  assert.equal(formatPortValue('string', 'hello'), 'hello');
  assert.equal(formatPortValue('asset', undefined), null);
});

test('inferBypassPorts rejects command/client passthrough and finds compatible sink ports', () => {
  const makePort = (
    id: string,
    type: string,
    kind: PortDefinitionLike['kind'] = 'sink'
  ): PortDefinitionLike => ({ id, type, kind });

  assert.deepEqual(
    inferBypassPorts({
      inputs: [makePort('in', 'number')],
      outputs: [makePort('out', 'number')],
    }),
    { inId: 'in', outId: 'out', portType: 'number' }
  );

  assert.equal(
    inferBypassPorts({
      inputs: [makePort('in', 'command')],
      outputs: [makePort('out', 'command')],
    }),
    null
  );

  assert.deepEqual(
    inferBypassPorts({
      inputs: [makePort('left', 'audio')],
      outputs: [makePort('right', 'audio')],
    }),
    { inId: 'left', outId: 'right', portType: 'audio' }
  );
});
