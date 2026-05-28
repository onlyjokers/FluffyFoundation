import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildGroupFrameProxyPorts,
  formatPortValue,
  hasPortValueText,
  inferBypassPorts,
  parseRenderedProjectionNodeId,
  resolveRenderedRuntimeNode,
  shouldUpdatePortValueText,
  resolveRenderedNodeType,
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

test('resolveRenderedNodeType falls back to projected view node type when no canonical instance exists', () => {
  assert.equal(resolveRenderedNodeType('', 'group-proxy'), 'group-proxy');
  assert.equal(resolveRenderedNodeType('number', 'group-proxy'), 'number');
});

test('resolveRenderedRuntimeNode maps custom projection nodes back to internal runtime state', () => {
  const nodes = new Map<string, any>([
    [
      'custom-1',
      {
        id: 'custom-1',
        config: {
          customNode: {
            internal: {
              nodes: [{ id: 'child-1', outputValues: { value: 'live' } }],
            },
          },
        },
      },
    ],
  ]);

  assert.deepEqual(parseRenderedProjectionNodeId('view:custom:custom-1:child-1'), {
    ownerNodeId: 'custom-1',
    internalNodeId: 'child-1',
  });
  assert.equal(
    resolveRenderedRuntimeNode({
      renderedNodeId: 'view:custom:custom-1:child-1',
      getNode: (nodeId) => nodes.get(nodeId),
      readCustomNodeState: (config) => (config.customNode as any) ?? null,
    })?.outputValues?.value,
    'live'
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
  assert.equal(formatPortValue('any', false), 'false');
  assert.equal(formatPortValue('any', { value: 1 }), '{"value":1}');
  assert.equal(formatPortValue('asset', undefined), null);
});

test('hasPortValueText treats rendered false and zero strings as visible values', () => {
  assert.equal(hasPortValueText('false'), true);
  assert.equal(hasPortValueText('0'), true);
  assert.equal(hasPortValueText(''), true);
  assert.equal(hasPortValueText(null), false);
  assert.equal(hasPortValueText(undefined), false);
});

test('shouldUpdatePortValueText skips equal live port value snapshots', () => {
  const previous = {
    inputs: { a: '1', b: '--' },
    outputs: { value: '1.5' },
  };
  const same = {
    inputs: { b: '--', a: '1' },
    outputs: { value: '1.5' },
  };
  const changed = {
    inputs: { a: '2', b: '--' },
    outputs: { value: '1.5' },
  };

  assert.equal(shouldUpdatePortValueText(previous, same), false);
  assert.equal(shouldUpdatePortValueText(previous, changed), true);
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
