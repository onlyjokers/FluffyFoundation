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

function createBuilderWithSyncedInlineConfigSpy() {
  const nodeRegistry = new NodeRegistry();
  nodeRegistry.register({
    type: 'scene-like-node',
    label: 'Scene Like Node',
    category: 'Scene',
    inputs: [{ id: 'audioSource', label: 'Audio Source', type: 'string' }],
    outputs: [{ id: 'out', label: 'Out', type: 'scene' }],
    configSchema: [
      {
        key: 'audioSource',
        label: 'Audio Source',
        type: 'select',
        defaultValue: 'playback',
        options: [
          { value: 'microphone', label: 'Microphone' },
          { value: 'playback', label: 'Playback' },
        ],
      },
    ],
    process: () => ({}),
  });

  const configUpdates: Array<Record<string, unknown>> = [];
  const builder = createReteBuilder({
    nodeRegistry,
    nodeEngine: {
      getNode: () => ({
        id: 'scene-1',
        type: 'scene-like-node',
        config: {},
        inputValues: {},
        outputValues: {},
        position: { x: 0, y: 0 },
      }),
      updateNodeInputValue: () => {},
      updateNodeConfig: (_nodeId: string, patch: Record<string, unknown>) => {
        configUpdates.push(patch);
      },
    },
    sockets: {
      any: new ClassicPreset.Socket('any'),
      string: new ClassicPreset.Socket('string'),
      scene: new ClassicPreset.Socket('scene'),
    },
    getNumberParamOptions: () => [],
    sendNodeOverride: () => {},
  });

  return { builder, configUpdates };
}

function createBuilderWithSyncedInlineNumberConfigSpy() {
  const nodeRegistry = new NodeRegistry();
  nodeRegistry.register({
    type: 'scene-opacity-node',
    label: 'Scene Opacity Node',
    category: 'Scene',
    inputs: [{ id: 'showBackground', label: 'Show Background', type: 'number', min: 0, max: 1, step: 0.01 }],
    outputs: [{ id: 'out', label: 'Out', type: 'scene' }],
    configSchema: [
      { key: 'showBackground', label: 'Show Background', type: 'number', defaultValue: 1, min: 0, max: 1, step: 0.01 },
    ],
    process: () => ({}),
  });

  const configUpdates: Array<Record<string, unknown>> = [];
  const builder = createReteBuilder({
    nodeRegistry,
    nodeEngine: {
      getNode: () => ({
        id: 'scene-1',
        type: 'scene-opacity-node',
        config: {},
        inputValues: {},
        outputValues: {},
        position: { x: 0, y: 0 },
      }),
      updateNodeInputValue: () => {},
      updateNodeConfig: (_nodeId: string, patch: Record<string, unknown>) => {
        configUpdates.push(patch);
      },
    },
    sockets: {
      any: new ClassicPreset.Socket('any'),
      number: new ClassicPreset.Socket('number'),
      scene: new ClassicPreset.Socket('scene'),
    },
    getNumberParamOptions: () => [],
    sendNodeOverride: () => {},
  });

  return { builder, configUpdates };
}

function createBuilderWithSyncedConfigControlDefaultsSpy() {
  const nodeRegistry = new NodeRegistry();
  nodeRegistry.register({
    type: 'scene-config-node',
    label: 'Scene Config Node',
    category: 'Scene',
    inputs: [{ id: 'in', label: 'In', type: 'scene' }],
    outputs: [{ id: 'out', label: 'Out', type: 'scene' }],
    configSchema: [
      {
        key: 'audioSource',
        label: 'Audio Source',
        type: 'select',
        defaultValue: 'playback',
        options: [
          { value: 'microphone', label: 'Microphone' },
          { value: 'playback', label: 'Playback' },
        ],
      },
      { key: 'showBackground', label: 'Show Background', type: 'number', defaultValue: 1, min: 0, max: 1, step: 0.01 },
    ],
    process: () => ({}),
  });

  const configUpdates: Array<Record<string, unknown>> = [];
  const builder = createReteBuilder({
    nodeRegistry,
    nodeEngine: {
      getNode: () => ({
        id: 'scene-1',
        type: 'scene-config-node',
        config: {},
        inputValues: {},
        outputValues: {},
        position: { x: 0, y: 0 },
      }),
      updateNodeInputValue: () => {},
      updateNodeConfig: (_nodeId: string, patch: Record<string, unknown>) => {
        configUpdates.push(patch);
      },
    },
    sockets: {
      any: new ClassicPreset.Socket('any'),
      scene: new ClassicPreset.Socket('scene'),
    },
    getNumberParamOptions: () => [],
    sendNodeOverride: () => {},
  });

  return { builder, configUpdates };
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

test('builder treats projection sockets as editor-only and not connectable semantic ports', () => {
  const builder = createReteBuilder({
    nodeRegistry: new NodeRegistry(),
    nodeEngine: {
      getNode: () => ({
        id: 'view:custom:owner:inner',
        type: 'source-node',
        config: {},
        inputValues: {},
        outputValues: {},
        position: { x: 0, y: 0 },
      }),
      updateNodeInputValue: () => {},
      updateNodeConfig: () => {},
    },
    sockets: {
      any: new ClassicPreset.Socket('any'),
    },
    getNumberParamOptions: () => [],
    sendNodeOverride: () => {},
    isProjectionId: (id) => String(id).startsWith('view:'),
  });

  assert.equal(
    builder.getPortDefForSocket({ nodeId: 'view:custom:owner:inner', side: 'output', key: 'value' }),
    null
  );
  assert.equal(builder.inputAllowsMultiple('view:custom:owner:inner', 'sink'), false);
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

test('input and config control changes dispatch explicit semantic commands', () => {
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
  const params: unknown[] = [];
  const inputs: unknown[] = [];
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
    sendSemanticNodeParams: (nodeId, patch) => {
      params.push({ nodeId, patch });
      return true;
    },
    sendSemanticNodeInputs: (nodeId, patch) => {
      inputs.push({ nodeId, patch });
      return true;
    },
  });

  const node = builder.buildReteNode({
    id: 'param-1',
    type: 'param-node',
    config: { gain: 1 },
    inputValues: { amount: 0 },
    outputValues: {},
    position: { x: 0, y: 0 },
  });

  const inputControl = node.inputs.amount?.control as ClassicPreset.InputControl<'number'>;
  const configControl = node.controls.gain as ClassicPreset.InputControl<'number'>;
  inputControl.setValue(5);
  configControl.setValue(2);

  assert.deepEqual(inputs, [{ nodeId: 'param-1', patch: { amount: 5 } }]);
  assert.deepEqual(params, [{ nodeId: 'param-1', patch: { gain: 2 } }]);
});

test('inline config-backed controls sync their default config before first graph run', () => {
  const { builder, configUpdates } = createBuilderWithSyncedInlineConfigSpy();
  builder.buildReteNode({
    id: 'scene-1',
    type: 'scene-like-node',
    config: {},
    inputValues: {},
    outputValues: {},
    position: { x: 0, y: 0 },
  });

  assert.deepEqual(configUpdates, [{ audioSource: 'playback' }]);
});

test('inline number config-backed controls sync their default config before first graph run', () => {
  const { builder, configUpdates } = createBuilderWithSyncedInlineNumberConfigSpy();
  builder.buildReteNode({
    id: 'scene-1',
    type: 'scene-opacity-node',
    config: {},
    inputValues: {},
    outputValues: {},
    position: { x: 0, y: 0 },
  });

  assert.deepEqual(configUpdates, [{ showBackground: 1 }]);
});

test('config controls sync their default config before first graph run', () => {
  const { builder, configUpdates } = createBuilderWithSyncedConfigControlDefaultsSpy();
  builder.buildReteNode({
    id: 'scene-1',
    type: 'scene-config-node',
    config: {},
    inputValues: {},
    outputValues: {},
    position: { x: 0, y: 0 },
  });

  assert.deepEqual(configUpdates, [{ audioSource: 'playback', showBackground: 1 }]);
});

test('editor projection nodes never sync default config back to the semantic graph', () => {
  const inlineSelect = createBuilderWithSyncedInlineConfigSpy();
  inlineSelect.builder.buildReteNode({
    id: 'view:custom:owner:scene-select',
    type: 'scene-like-node',
    config: { editorProjection: true },
    inputValues: {},
    outputValues: {},
    position: { x: 0, y: 0 },
  });

  const inlineNumber = createBuilderWithSyncedInlineNumberConfigSpy();
  inlineNumber.builder.buildReteNode({
    id: 'view:custom:owner:scene-number',
    type: 'scene-opacity-node',
    config: { editorProjection: true },
    inputValues: {},
    outputValues: {},
    position: { x: 0, y: 0 },
  });

  const configControls = createBuilderWithSyncedConfigControlDefaultsSpy();
  configControls.builder.buildReteNode({
    id: 'view:custom:owner:scene-config',
    type: 'scene-config-node',
    config: { editorProjection: true },
    inputValues: {},
    outputValues: {},
    position: { x: 0, y: 0 },
  });

  assert.deepEqual(inlineSelect.configUpdates, []);
  assert.deepEqual(inlineNumber.configUpdates, []);
  assert.deepEqual(configControls.configUpdates, []);
});
