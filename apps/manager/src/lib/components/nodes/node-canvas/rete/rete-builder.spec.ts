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

test('buildReteNode stores source instance metadata for projected view nodes', () => {
  const nodeRegistry = new NodeRegistry();
  nodeRegistry.register({
    type: 'group-proxy',
    label: 'Group Proxy',
    category: 'Group',
    inputs: [{ id: 'in', label: 'In', type: 'number' }],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [],
    process: () => ({}),
  });
  const builder = createReteBuilder({
    nodeRegistry,
    nodeEngine: {
      getNode: () => undefined,
      updateNodeInputValue: () => {},
      updateNodeConfig: () => {},
    },
    sockets: {
      any: new ClassicPreset.Socket('any'),
      number: new ClassicPreset.Socket('number'),
    },
    getNumberParamOptions: () => [],
    sendNodeOverride: () => {},
  });

  const node = builder.buildReteNode({
    id: 'view:custom:owner:proxy',
    type: 'group-proxy',
    config: { editorProjection: true, direction: 'input', portType: 'number' },
    inputValues: {},
    outputValues: {},
    position: { x: 0, y: 0 },
  }) as ClassicPreset.Node & { type?: string; config?: Record<string, unknown> };

  assert.equal(node.type, 'group-proxy');
  assert.deepEqual(node.config, { editorProjection: true, direction: 'input', portType: 'number' });
});

test('custom node Active gate can toggle off and back on even when returning to its initial value', () => {
  const nodeRegistry = new NodeRegistry();
  nodeRegistry.register({
    type: 'custom:test-gate-toggle',
    label: 'Gate Toggle Custom',
    category: 'Custom',
    inputs: [{ id: 'gate', label: 'Active', type: 'boolean', defaultValue: true }],
    outputs: [],
    configSchema: [],
    process: () => ({}),
  });
  const inputPatches: unknown[] = [];
  const configPatches: unknown[] = [];
  const config = {
    customNode: {
      definitionId: 'test-gate-toggle',
      groupId: 'group-1',
      role: 'mother',
      manualGate: true,
      internal: { nodes: [], connections: [] },
    },
  };
  const builder = createReteBuilder({
    nodeRegistry,
    nodeEngine: {
      getNode: () => ({
        id: 'custom-1',
        type: 'custom:test-gate-toggle',
        config,
        inputValues: { gate: true },
        outputValues: {},
        position: { x: 0, y: 0 },
      }),
      updateNodeInputValue: () => {},
      updateNodeConfig: () => {},
    },
    sockets: {
      any: new ClassicPreset.Socket('any'),
      boolean: new ClassicPreset.Socket('boolean'),
    },
    getNumberParamOptions: () => [],
    sendNodeOverride: () => {},
    sendSemanticNodeInputs: (nodeId, patch) => {
      inputPatches.push({ nodeId, patch });
      return true;
    },
    sendSemanticNodeParams: (nodeId, patch) => {
      configPatches.push({ nodeId, patch });
      return true;
    },
  });

  const node = builder.buildReteNode({
    id: 'custom-1',
    type: 'custom:test-gate-toggle',
    config,
    inputValues: { gate: true },
    outputValues: {},
    position: { x: 0, y: 0 },
  });

  const gateControl = node.inputs.gate?.control as { setValue: (value: boolean) => void };
  gateControl.setValue(false);
  gateControl.setValue(true);

  assert.deepEqual(inputPatches, [
    { nodeId: 'custom-1', patch: { gate: false } },
    { nodeId: 'custom-1', patch: { gate: true } },
  ]);
  assert.equal(
    Boolean(
      (
        (configPatches[1] as { patch?: { customNode?: { manualGate?: boolean } } } | undefined)
          ?.patch?.customNode
      )?.manualGate
    ),
    true
  );
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

test('display-object routing inputs render inline controls and dispatch semantic input commands', () => {
  const nodeRegistry = new NodeRegistry();
  nodeRegistry.register({
    type: 'display-object',
    label: 'Display',
    category: 'Objects',
    inputs: [
      { id: 'index', label: 'Index', type: 'number', min: 1, step: 1 },
      { id: 'range', label: 'Range', type: 'number', min: 1, step: 1 },
      { id: 'random', label: 'Random', type: 'boolean' },
      { id: 'in', label: 'In', type: 'command', kind: 'sink' },
    ],
    outputs: [],
    configSchema: [{ key: 'displayId', label: 'Displays', type: 'client-picker', defaultValue: '' }],
    process: () => ({}),
  });
  const inputs: unknown[] = [];
  const builder = createReteBuilder({
    nodeRegistry,
    nodeEngine: {
      getNode: () => ({
        id: 'display-1',
        type: 'display-object',
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
      number: new ClassicPreset.Socket('number'),
      boolean: new ClassicPreset.Socket('boolean'),
      command: new ClassicPreset.Socket('command'),
    },
    getNumberParamOptions: () => [],
    sendNodeOverride: () => {},
    sendSemanticNodeInputs: (nodeId, patch) => {
      inputs.push({ nodeId, patch });
      return true;
    },
  });

  const node = builder.buildReteNode({
    id: 'display-1',
    type: 'display-object',
    config: {},
    inputValues: {},
    outputValues: {},
    position: { x: 0, y: 0 },
  });

  const indexControl = node.inputs.index?.control as ClassicPreset.InputControl<'number'>;
  const rangeControl = node.inputs.range?.control as ClassicPreset.InputControl<'number'>;
  const randomControl = node.inputs.random?.control as { setValue: (value: boolean) => void };

  assert.ok(indexControl);
  assert.ok(rangeControl);
  assert.ok(randomControl);
  assert.equal((indexControl as unknown as { step?: number }).step, 1);
  assert.equal((indexControl as unknown as { integer?: boolean }).integer, true);

  indexControl.setValue(2);
  rangeControl.setValue(3);
  randomControl.setValue(true);

  assert.deepEqual(inputs, [
    { nodeId: 'display-1', patch: { index: 2 } },
    { nodeId: 'display-1', patch: { range: 3 } },
    { nodeId: 'display-1', patch: { random: true } },
  ]);
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

test('editor projection controls commit user changes through the projection callback', () => {
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
  const engineInputUpdates: unknown[] = [];
  const engineConfigUpdates: unknown[] = [];
  const semanticInputs: unknown[] = [];
  const semanticParams: unknown[] = [];
  const projectionUpdates: unknown[] = [];
  const activity: unknown[] = [];
  const builder = createReteBuilder({
    nodeRegistry,
    nodeEngine: {
      getNode: () => undefined,
      updateNodeInputValue: (nodeId, portId, value) => {
        engineInputUpdates.push({ nodeId, portId, value });
      },
      updateNodeConfig: (nodeId, patch) => {
        engineConfigUpdates.push({ nodeId, patch });
      },
    },
    sockets: {
      any: new ClassicPreset.Socket('any'),
      number: new ClassicPreset.Socket('number'),
    },
    getNumberParamOptions: () => [],
    sendNodeOverride: () => {},
    sendSemanticNodeInputs: (nodeId, patch) => {
      semanticInputs.push({ nodeId, patch });
      return true;
    },
    sendSemanticNodeParams: (nodeId, patch) => {
      semanticParams.push({ nodeId, patch });
      return true;
    },
    commitProjectionValue: (update) => {
      projectionUpdates.push(update);
      return true;
    },
    onNodeActivity: (nodeId, portId) => activity.push({ nodeId, portId }),
  });

  const node = builder.buildReteNode({
    id: 'view:custom:custom-1:inner',
    type: 'param-node',
    config: { editorProjection: true, gain: 1 },
    inputValues: { amount: 0 },
    outputValues: {},
    position: { x: 0, y: 0 },
  });

  const inputControl = node.inputs.amount?.control as ClassicPreset.InputControl<'number'>;
  const configControl = node.controls.gain as ClassicPreset.InputControl<'number'>;
  inputControl.setValue(5);
  configControl.setValue(2);

  assert.deepEqual(projectionUpdates, [
    { nodeId: 'view:custom:custom-1:inner', kind: 'input', key: 'amount', value: 5 },
    { nodeId: 'view:custom:custom-1:inner', kind: 'config', key: 'gain', value: 2 },
  ]);
  assert.deepEqual(engineInputUpdates, []);
  assert.deepEqual(engineConfigUpdates, []);
  assert.deepEqual(semanticInputs, []);
  assert.deepEqual(semanticParams, []);
  assert.deepEqual(activity, [
    { nodeId: 'view:custom:custom-1:inner', portId: 'amount' },
    { nodeId: 'view:custom:custom-1:inner', portId: 'gain' },
  ]);
});
