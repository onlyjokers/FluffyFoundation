/**
 * Purpose: Regression coverage for Rete builder helpers used by canvas connection interactions.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClassicPreset } from 'rete';
import { NodeRegistry, type NodeDefinition, type NodeInstance } from '@shugu/node-core';
import { createReteBuilder } from './rete-builder';

const testDefinition: NodeDefinition = {
  type: 'source-node',
  label: 'Source Node',
  category: 'Values',
  inputs: [{ id: 'sink', label: 'Sink', type: 'number', kind: 'sink' }],
  outputs: [{ id: 'value', label: 'Value', type: 'number' }],
  configSchema: [],
  process: () => ({}),
};

function createBuilderWithThisBoundGetNode() {
  const nodeRegistry = new NodeRegistry();
  nodeRegistry.register(testDefinition);

  const engine = {
    nodes: new Map<string, NodeInstance>([
      [
        'node-1',
        {
          id: 'node-1',
          type: 'source-node',
          config: {},
          inputValues: {},
          outputValues: {},
          position: { x: 0, y: 0 },
        },
      ],
    ]),
    getNode(nodeId: string): NodeInstance | undefined {
      return this.nodes.get(nodeId);
    },
    updateNodeInputValue: () => {},
    updateNodeConfig: () => {},
  };

  return createReteBuilder({
    nodeRegistry,
    nodeEngine: engine,
    sockets: {
      any: new ClassicPreset.Socket('any'),
      number: new ClassicPreset.Socket('number'),
    },
    getNumberParamOptions: () => [],
    sendNodeOverride: () => {},
  });
}

function createBuilderWithActivitySpy() {
  const nodeRegistry = new NodeRegistry();
  nodeRegistry.register({
    type: 'param-node',
    label: 'Param Node',
    category: 'Values',
    inputs: [{ id: 'amount', label: 'Amount', type: 'number', defaultValue: 0 }],
    outputs: [{ id: 'value', label: 'Value', type: 'number' }],
    configSchema: [{ key: 'gain', label: 'Gain', type: 'number', defaultValue: 1 }],
    process: () => ({}),
  });

  const activity: Array<{ nodeId: string; portId: string }> = [];
  const builder = createReteBuilder({
    nodeRegistry,
    nodeEngine: {
      getNode: () => ({
        id: 'param-1',
        type: 'param-node',
        config: { gain: 1 },
        inputValues: { amount: 0 },
        outputValues: {},
        position: { x: 0, y: 0 },
      }),
      updateNodeInputValue: () => {},
      updateNodeConfig: () => {},
    },
    sockets: {
      any: new ClassicPreset.Socket('any'),
      number: new ClassicPreset.Socket('number'),
    },
    getNumberParamOptions: () => [],
    sendNodeOverride: () => {},
    onNodeActivity: (nodeId, portId) => activity.push({ nodeId, portId }),
  });

  return { builder, activity };
}

test('getPortDefForSocket preserves nodeEngine.getNode receiver context', () => {
  const builder = createBuilderWithThisBoundGetNode();

  const port = builder.getPortDefForSocket({ nodeId: 'node-1', side: 'output', key: 'value' });

  assert.equal(port?.id, 'value');
  assert.equal(port?.type, 'number');
});

test('inputAllowsMultiple preserves nodeEngine.getNode receiver context', () => {
  const builder = createBuilderWithThisBoundGetNode();

  assert.equal(builder.inputAllowsMultiple('node-1', 'sink'), true);
});

test('input control changes notify canvas activity highlighting', () => {
  const { builder, activity } = createBuilderWithActivitySpy();
  const node = builder.buildReteNode({
    id: 'param-1',
    type: 'param-node',
    config: { gain: 1 },
    inputValues: { amount: 0 },
    outputValues: {},
    position: { x: 0, y: 0 },
  });

  const inputControl = node.inputs.amount?.control as ClassicPreset.InputControl<'number'>;
  inputControl.setValue(5);

  assert.deepEqual(activity, [{ nodeId: 'param-1', portId: 'amount' }]);
});

test('config control changes notify canvas activity highlighting', () => {
  const { builder, activity } = createBuilderWithActivitySpy();
  const node = builder.buildReteNode({
    id: 'param-1',
    type: 'param-node',
    config: { gain: 1 },
    inputValues: { amount: 0 },
    outputValues: {},
    position: { x: 0, y: 0 },
  });

  const configControl = node.controls.gain as ClassicPreset.InputControl<'number'>;
  configControl.setValue(2);

  assert.deepEqual(activity, [{ nodeId: 'param-1', portId: 'gain' }]);
});
