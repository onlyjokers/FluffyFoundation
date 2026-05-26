// Purpose: Regression coverage for NodeRuntime graph execution semantics.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { registerDefaultNodeDefinitions } from './definitions/register.js';
import { NodeRegistry } from './registry.js';
import { NodeRuntime, type NodeRuntimeWatchdogInfo } from './runtime.js';
import type { GraphState } from './types.js';
import type { NodeCommand } from './definitions/types.js';
import { createSemanticCommandBus } from './semantic-command-bus.js';

const createCommandRuntime = (commands: Array<{ clientId: string; cmd: NodeCommand }>) => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a'],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
    executeCommandForClientId: (clientId, cmd) => {
      commands.push({ clientId, cmd });
    },
  });
  return new NodeRuntime(registry);
};

const waitFor = async (predicate: () => boolean, timeoutMs = 500): Promise<void> => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const payloadFrequency = (cmd: NodeCommand): number | undefined =>
  (cmd.payload as { frequency?: number } | undefined)?.frequency;

const testNode = (id: string, type: string): GraphState['nodes'][number] => ({
  id,
  type,
  position: { x: 0, y: 0 },
  config: {},
  inputValues: {},
  outputValues: {},
});

test('input value changes retrigger command sink effects', async () => {
  const commands: Array<{ clientId: string; cmd: NodeCommand }> = [];
  const runtime = createCommandRuntime(commands);
  const graph: GraphState = {
    nodes: [
      {
        id: 'synth',
        type: 'proc-synth-update',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: {
          active: true,
          waveform: 'square',
          frequency: 440,
          volume: 0.7,
          modDepth: 0,
          modFrequency: 12,
          durationMs: 200,
        },
        outputValues: {},
      },
      {
        id: 'agg',
        type: 'cmd-aggregator',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'loader',
        type: 'client-loader',
        position: { x: 0, y: 0 },
        config: { clientId: 'client-a' },
        inputValues: {},
        outputValues: {},
      },
      {
        id: 'executor',
        type: 'client-executor',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [
      {
        id: 'c1',
        sourceNodeId: 'synth',
        sourcePortId: 'cmd',
        targetNodeId: 'agg',
        targetPortId: 'in1',
      },
      {
        id: 'c2',
        sourceNodeId: 'agg',
        sourcePortId: 'cmd',
        targetNodeId: 'executor',
        targetPortId: 'in',
      },
      {
        id: 'c3',
        sourceNodeId: 'loader',
        sourcePortId: 'client',
        targetNodeId: 'executor',
        targetPortId: 'client',
      },
    ],
  };

  runtime.loadGraph(graph);
  runtime.start();
  await waitFor(() => commands.some((entry) => payloadFrequency(entry.cmd) === 440));

  const synth = runtime.getNode('synth');
  assert.ok(synth);
  synth.inputValues.frequency = 880;
  await waitFor(() => commands.some((entry) => payloadFrequency(entry.cmd) === 880));
  runtime.stop();

  assert.equal(commands[0].clientId, 'client-a');
  assert.equal(commands[0].cmd.action, 'modulateSoundUpdate');
  assert.equal(payloadFrequency(commands[0].cmd), 440);
  const updated = commands.find((entry) => payloadFrequency(entry.cmd) === 880);
  assert.ok(updated);
  assert.equal(updated.clientId, 'client-a');
  assert.equal(updated.cmd.action, 'modulateSoundUpdate');
});

test('client loader selects client collections and executor routes command sink effects', async () => {
  const commands: Array<{ clientId: string; cmd: NodeCommand }> = [];
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a', 'client-b'],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
    executeCommandForClientId: (clientId, cmd) => {
      commands.push({ clientId, cmd });
    },
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    nodes: [
      {
        id: 'synth',
        type: 'proc-synth-update',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: {
          active: true,
          frequency: 440,
          volume: 0.7,
          waveform: 'square',
          durationMs: 200,
        },
        outputValues: {},
      },
      {
        id: 'loader',
        type: 'client-loader',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: { index: 1, range: 2, random: false },
        outputValues: {},
      },
      {
        id: 'executor',
        type: 'client-executor',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [
      {
        id: 'c1',
        sourceNodeId: 'synth',
        sourcePortId: 'cmd',
        targetNodeId: 'executor',
        targetPortId: 'in',
      },
      {
        id: 'c2',
        sourceNodeId: 'loader',
        sourcePortId: 'client',
        targetNodeId: 'executor',
        targetPortId: 'client',
      },
    ],
  });

  runtime.start();
  const loader = runtime.getNode('loader');
  assert.ok(loader);
  await waitFor(
    () =>
      Array.isArray(loader.outputValues.indexs) &&
      (loader.outputValues.indexs as string[]).length === 2 &&
      commands.some((entry) => entry.clientId === 'client-a') &&
      commands.some((entry) => entry.clientId === 'client-b')
  );
  const loaderOutput = { ...loader.outputValues };
  runtime.stop();

  assert.deepEqual(
    new Set(commands.map((entry) => entry.clientId)),
    new Set(['client-a', 'client-b'])
  );
  assert.deepEqual(loaderOutput.indexs, ['client-a', 'client-b']);
  assert.equal(loaderOutput.number, 2);
  assert.deepEqual((loaderOutput.client as { clientIds?: string[] }).clientIds, [
    'client-a',
    'client-b',
  ]);
});

test('client executor clears old clients when target selection changes for long-lived text and image commands', async () => {
  const commands: Array<{ clientId: string; cmd: NodeCommand }> = [];
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a', 'client-b'],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
    executeCommandForClientId: (clientId, cmd) => {
      commands.push({ clientId, cmd });
    },
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    nodes: [
      {
        id: 'text',
        type: 'proc-display-text',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: { text: 'caption', durationMs: 0 },
        outputValues: {},
      },
      {
        id: 'image',
        type: 'proc-show-image',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: { in: '/poster.png' },
        outputValues: {},
      },
      {
        id: 'loader',
        type: 'client-loader',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: { index: 1, range: 1, random: false },
        outputValues: {},
      },
      {
        id: 'executor',
        type: 'client-executor',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [
      {
        id: 'text-cmd',
        sourceNodeId: 'text',
        sourcePortId: 'cmd',
        targetNodeId: 'executor',
        targetPortId: 'in',
      },
      {
        id: 'image-cmd',
        sourceNodeId: 'image',
        sourcePortId: 'cmd',
        targetNodeId: 'executor',
        targetPortId: 'in',
      },
      {
        id: 'loader-client',
        sourceNodeId: 'loader',
        sourcePortId: 'client',
        targetNodeId: 'executor',
        targetPortId: 'client',
      },
    ],
  });

  runtime.start();
  await waitFor(() =>
    commands.some((entry) => entry.clientId === 'client-a' && entry.cmd.action === 'showImage')
  );

  commands.length = 0;
  const loader = runtime.getNode('loader');
  assert.ok(loader);
  loader.inputValues.index = 2;

  await waitFor(
    () =>
      commands.some((entry) => entry.clientId === 'client-a' && entry.cmd.action === 'hideText') &&
      commands.some((entry) => entry.clientId === 'client-a' && entry.cmd.action === 'hideImage') &&
      commands.some((entry) => entry.clientId === 'client-b' && entry.cmd.action === 'showText') &&
      commands.some((entry) => entry.clientId === 'client-b' && entry.cmd.action === 'showImage')
  );
  runtime.stop();

  assert.deepEqual(
    commands
      .slice(0, 4)
      .map((entry) => `${entry.clientId}:${entry.cmd.action}`)
      .sort(),
    ['client-a:hideImage', 'client-a:hideText', 'client-b:showImage', 'client-b:showText']
  );
});

test('client executor clears long-lived commands that disappear from an active command bundle', async () => {
  const commands: Array<{ clientId: string; cmd: NodeCommand }> = [];
  const enabledByNode = new Map<string, boolean>();
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a'],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
    executeCommandForClientId: (clientId, cmd) => {
      commands.push({ clientId, cmd });
    },
  });

  const runtime = new NodeRuntime(registry, {
    isNodeEnabled: (nodeId) => enabledByNode.get(nodeId) ?? true,
  });
  runtime.loadGraph({
    nodes: [
      {
        id: 'text',
        type: 'proc-display-text',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: { text: 'caption', durationMs: 0 },
        outputValues: {},
      },
      {
        id: 'image',
        type: 'proc-show-image',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: { in: '/poster.png' },
        outputValues: {},
      },
      {
        id: 'loader',
        type: 'client-loader',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: { index: 1, range: 1, random: false },
        outputValues: {},
      },
      {
        id: 'executor',
        type: 'client-executor',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [
      {
        id: 'text-cmd',
        sourceNodeId: 'text',
        sourcePortId: 'cmd',
        targetNodeId: 'executor',
        targetPortId: 'in',
      },
      {
        id: 'image-cmd',
        sourceNodeId: 'image',
        sourcePortId: 'cmd',
        targetNodeId: 'executor',
        targetPortId: 'in',
      },
      {
        id: 'loader-client',
        sourceNodeId: 'loader',
        sourcePortId: 'client',
        targetNodeId: 'executor',
        targetPortId: 'client',
      },
    ],
  });

  try {
    runtime.start();
    await waitFor(() =>
      commands.some((entry) => entry.clientId === 'client-a' && entry.cmd.action === 'showImage')
    );

    commands.length = 0;
    enabledByNode.set('image', false);

    await waitFor(() =>
      commands.some((entry) => entry.clientId === 'client-a' && entry.cmd.action === 'hideImage')
    );
  } finally {
    runtime.stop();
  }

  assert.ok(
    commands.some((entry) => entry.clientId === 'client-a' && entry.cmd.action === 'hideImage'),
    'old image should be hidden when its command disappears while the sink remains connected'
  );
});

test('display text processor maps text inputs to showText commands', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });

  const definition = registry.get('proc-display-text');
  assert.ok(definition);
  const output = definition.process(
    { text: '你好，AI 已收到', durationMs: 0 },
    {
      text: 'fallback',
      color: '#ffffff',
      backgroundColor: 'rgba(0, 0, 0, 0.72)',
      durationMs: 0,
    },
    { nodeId: 'n-display-text', time: 0, deltaTime: 0 }
  );

  assert.deepEqual(output, {
    cmd: {
      action: 'showText',
      payload: {
        text: '你好，AI 已收到',
        color: '#ffffff',
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
      },
    },
  });
});

test('display-compatible command processors advertise display routing metadata', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });

  const displayCommands = [
    ['proc-show-image', 'showImage'],
    ['proc-play-video', 'playMedia'],
    ['proc-screen-color', 'screenColor'],
    ['proc-display-text', 'showText'],
    ['play-media', 'playMedia'],
    ['effect-out', 'visualEffects'],
    ['scene-out', 'visualScenes'],
  ] as const;

  for (const [type] of displayCommands) {
    const definition = registry.get(type);
    assert.ok(definition, `${type} is registered`);
    assert.ok(
      definition.metadata?.platformTargets.includes('display'),
      `${type} should advertise Display support`
    );
    assert.ok(
      definition.metadata?.compatibility.some((rule) => rule.target === 'display-object'),
      `${type} should document Display routing through display-object`
    );
  }
});

test('client-only command processors do not advertise Display support', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });

  for (const type of ['proc-flashlight', 'proc-synth-update', 'proc-push-image-upload']) {
    const definition = registry.get(type);
    assert.ok(definition, `${type} is registered`);
    assert.equal(definition.metadata?.platformTargets.includes('display'), false);
    assert.ok(
      definition.metadata?.compatibility.some((rule) => rule.target === 'client-executor'),
      `${type} should document Client routing through client-executor`
    );
  }
});

test('image player replaces the legacy static image player', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });

  assert.equal(registry.get('image-out'), undefined);
  assert.equal(registry.get('proc-show-image')?.label, 'Image Player');
});

test('video player emits dynamic video commands and stop commands', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });

  const definition = registry.get('proc-play-video');
  assert.ok(definition, 'proc-play-video is registered');
  assert.equal(definition.label, 'Video Player');
  assert.deepEqual(definition.inputs.map((port) => [port.id, port.type]), [['in', 'video']]);
  assert.deepEqual(definition.outputs.map((port) => [port.id, port.type]), [['cmd', 'command']]);

  assert.deepEqual(
    definition.process(
      { in: 'asset:clip#muted=true&vol=42&loop=1' },
      {},
      { nodeId: 'video-player-1', time: 0, deltaTime: 0 }
    ),
    {
      cmd: {
        action: 'playMedia',
        payload: {
          url: 'asset:clip#muted=true&vol=42&loop=1',
          mediaType: 'video',
          loop: true,
          muted: true,
          volume: 42,
        },
      },
    }
  );

  assert.deepEqual(
    definition.process(
      { in: '' },
      {},
      { nodeId: 'video-player-1', time: 16, deltaTime: 16 }
    ),
    { cmd: { action: 'stopMedia', payload: {} } }
  );
});

test('client UI nodes expose interaction state through runtime dependencies', () => {
  let buttonPressed = true;
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a'],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
    clientUi: {
      consumeClientButtonPressed: (nodeId) => {
        assert.equal(nodeId, 'button');
        const current = buttonPressed;
        buttonPressed = false;
        return current;
      },
      getClientUiState: (nodeId) => {
        assert.equal(nodeId, 'input');
        return {
          displayed: true,
          kind: 'input',
          pressed: false,
          inputContent: 'hello',
          firstInputed: true,
        };
      },
    },
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    nodes: [
      {
        id: 'input',
        type: 'client-input-box',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: { display: true },
        outputValues: {},
      },
      {
        id: 'button',
        type: 'client-button',
        position: { x: 0, y: 0 },
        config: {},
        inputValues: { display: true },
        outputValues: {},
      },
    ],
    connections: [
      {
        id: 'c1',
        sourceNodeId: 'input',
        sourcePortId: 'out',
        targetNodeId: 'button',
        targetPortId: 'in',
      },
    ],
  });

  runtime.step();

  assert.equal(runtime.getNode('input')?.outputValues.inputContent, 'hello');
  assert.equal(runtime.getNode('input')?.outputValues.firstInputed, true);
  assert.equal(runtime.getNode('button')?.outputValues.pressed, true);

  runtime.step();

  assert.equal(runtime.getNode('button')?.outputValues.pressed, false);
});

test('set/get boolean variable latch client button feedback by variable name through a sink boundary', async () => {
  let buttonPressed = false;
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a'],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
    clientUi: {
      consumeClientButtonPressed: (nodeId) => {
        assert.equal(nodeId, 'button');
        const current = buttonPressed;
        buttonPressed = false;
        return current;
      },
    },
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    nodes: [
      testNode('button', 'client-button'),
      {
        ...testNode('pressed-set', 'set-boolean-variable'),
        config: { name: 'pressed', defaultValue: false, mode: 'latchTrue' },
      },
      { ...testNode('pressed-get', 'get-boolean-variable'), config: { name: 'pressed', defaultValue: false } },
      testNode('not-pressed', 'logic-not'),
    ],
    connections: [
      {
        id: 'button-pressed',
        sourceNodeId: 'button',
        sourcePortId: 'pressed',
        targetNodeId: 'pressed-set',
        targetPortId: 'set',
      },
      {
        id: 'pressed-not',
        sourceNodeId: 'pressed-get',
        sourcePortId: 'value',
        targetNodeId: 'not-pressed',
        targetPortId: 'in',
      },
      {
        id: 'not-display',
        sourceNodeId: 'not-pressed',
        sourcePortId: 'out',
        targetNodeId: 'button',
        targetPortId: 'display',
      },
    ],
  });

  try {
    runtime.start();
    await waitFor(
      () =>
        runtime.getNode('pressed-get')?.outputValues.value === false &&
        runtime.getNode('not-pressed')?.outputValues.out === true &&
        runtime.getNode('button')?.outputValues.pressed === false
    );

    buttonPressed = true;
    await waitFor(() => runtime.getNode('button')?.outputValues.pressed === true);
    assert.equal(runtime.getNode('pressed-get')?.outputValues.value, false);

    await waitFor(
      () =>
        runtime.getNode('pressed-get')?.outputValues.value === true &&
        runtime.getNode('not-pressed')?.outputValues.out === false &&
        runtime.getNode('button')?.outputValues.pressed === false
    );

    buttonPressed = false;
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(runtime.getNode('pressed-get')?.outputValues.value, true);
  } finally {
    runtime.stop();
  }
});

test('pulse to boolean toggles client button pulses into stable boolean state', async () => {
  let buttonPressed = false;
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a'],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
    clientUi: {
      consumeClientButtonPressed: () => {
        const current = buttonPressed;
        buttonPressed = false;
        return current;
      },
    },
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    nodes: [
      testNode('button', 'client-button'),
      { ...testNode('toggle', 'pulse-to-boolean'), config: { mode: 'toggle', defaultValue: false } },
    ],
    connections: [
      {
        id: 'button-toggle',
        sourceNodeId: 'button',
        sourcePortId: 'pressed',
        targetNodeId: 'toggle',
        targetPortId: 'pulse',
      },
    ],
  });

  try {
    runtime.start();
    await waitFor(() => runtime.getNode('toggle')?.outputValues.value === false);

    buttonPressed = true;
    await waitFor(() => runtime.getNode('toggle')?.outputValues.value === true);

    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(runtime.getNode('toggle')?.outputValues.value, true);

    buttonPressed = true;
    await waitFor(() => runtime.getNode('toggle')?.outputValues.value === false);
  } finally {
    runtime.stop();
  }
});

test('pulse to boolean supports latch and momentary modes', async () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    nodes: [
      { ...testNode('pulse', 'bool'), inputValues: { value: false } },
      { ...testNode('latch-true', 'pulse-to-boolean'), config: { mode: 'latchTrue', defaultValue: false } },
      { ...testNode('latch-false', 'pulse-to-boolean'), config: { mode: 'latchFalse', defaultValue: true } },
      { ...testNode('momentary', 'pulse-to-boolean'), config: { mode: 'momentary', defaultValue: false } },
    ],
    connections: [
      {
        id: 'pulse-latch-true',
        sourceNodeId: 'pulse',
        sourcePortId: 'value',
        targetNodeId: 'latch-true',
        targetPortId: 'pulse',
      },
      {
        id: 'pulse-latch-false',
        sourceNodeId: 'pulse',
        sourcePortId: 'value',
        targetNodeId: 'latch-false',
        targetPortId: 'pulse',
      },
      {
        id: 'pulse-momentary',
        sourceNodeId: 'pulse',
        sourcePortId: 'value',
        targetNodeId: 'momentary',
        targetPortId: 'pulse',
      },
    ],
  });

  try {
    runtime.start();
    await waitFor(
      () =>
        runtime.getNode('latch-true')?.outputValues.value === false &&
        runtime.getNode('latch-false')?.outputValues.value === true &&
        runtime.getNode('momentary')?.outputValues.value === false
    );

    const pulse = runtime.getNode('pulse');
    assert.ok(pulse);
    pulse.inputValues.value = true;
    await waitFor(
      () =>
        runtime.getNode('latch-true')?.outputValues.value === true &&
        runtime.getNode('latch-false')?.outputValues.value === false &&
        runtime.getNode('momentary')?.outputValues.value === true
    );

    pulse.inputValues.value = false;
    await waitFor(() => runtime.getNode('momentary')?.outputValues.value === false);
    assert.equal(runtime.getNode('latch-true')?.outputValues.value, true);
    assert.equal(runtime.getNode('latch-false')?.outputValues.value, false);
  } finally {
    runtime.stop();
  }
});

test('boolean to pulse emits one pulse when the boolean input changes', async () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    nodes: [
      { ...testNode('source', 'bool'), inputValues: { value: false } },
      testNode('pulse', 'boolean-to-pulse'),
    ],
    connections: [
      {
        id: 'source-pulse',
        sourceNodeId: 'source',
        sourcePortId: 'value',
        targetNodeId: 'pulse',
        targetPortId: 'value',
      },
    ],
  });

  try {
    runtime.start();
    await waitFor(() => runtime.getNode('pulse')?.outputValues.pulse === false);

    const source = runtime.getNode('source');
    assert.ok(source);
    source.inputValues.value = true;
    await waitFor(() => runtime.getNode('pulse')?.outputValues.pulse === true);
    await waitFor(() => runtime.getNode('pulse')?.outputValues.pulse === false);

    source.inputValues.value = false;
    await waitFor(() => runtime.getNode('pulse')?.outputValues.pulse === true);
    await waitFor(() => runtime.getNode('pulse')?.outputValues.pulse === false);
  } finally {
    runtime.stop();
  }
});

test('set boolean variable supports explicit pulse false writes and reset to default', async () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    nodes: [
      { ...testNode('source', 'bool'), inputValues: { value: true } },
      { ...testNode('reset', 'bool'), inputValues: { value: false } },
      {
        ...testNode('setter', 'set-boolean-variable'),
        config: { name: 'flag', defaultValue: false, mode: 'followInput' },
      },
      { ...testNode('getter', 'get-boolean-variable'), config: { name: 'flag', defaultValue: false } },
    ],
    connections: [
      {
        id: 'source-set',
        sourceNodeId: 'source',
        sourcePortId: 'value',
        targetNodeId: 'setter',
        targetPortId: 'set',
      },
      {
        id: 'reset-set',
        sourceNodeId: 'reset',
        sourcePortId: 'value',
        targetNodeId: 'setter',
        targetPortId: 'reset',
      },
    ],
  });

  try {
    runtime.start();
    await waitFor(() => runtime.getNode('getter')?.outputValues.value === true);

    const source = runtime.getNode('source');
    assert.ok(source);
    source.inputValues.value = false;
    await waitFor(() => runtime.getNode('getter')?.outputValues.value === false);

    source.inputValues.value = true;
    await waitFor(() => runtime.getNode('getter')?.outputValues.value === true);

    const reset = runtime.getNode('reset');
    assert.ok(reset);
    reset.inputValues.value = true;
    await waitFor(() => runtime.getNode('getter')?.outputValues.value === false);
  } finally {
    runtime.stop();
  }
});

test('set boolean variable reset accepts pulse input', async () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    nodes: [
      { ...testNode('source', 'bool'), inputValues: { value: true } },
      { ...testNode('reset-source', 'bool'), inputValues: { value: false } },
      testNode('reset-pulse', 'boolean-to-pulse'),
      {
        ...testNode('setter', 'set-boolean-variable'),
        config: { name: 'flag', defaultValue: false, mode: 'followInput' },
      },
      { ...testNode('getter', 'get-boolean-variable'), config: { name: 'flag' } },
    ],
    connections: [
      {
        id: 'source-set',
        sourceNodeId: 'source',
        sourcePortId: 'value',
        targetNodeId: 'setter',
        targetPortId: 'set',
      },
      {
        id: 'reset-source-pulse',
        sourceNodeId: 'reset-source',
        sourcePortId: 'value',
        targetNodeId: 'reset-pulse',
        targetPortId: 'value',
      },
      {
        id: 'reset-pulse-setter',
        sourceNodeId: 'reset-pulse',
        sourcePortId: 'pulse',
        targetNodeId: 'setter',
        targetPortId: 'reset',
      },
    ],
  });

  try {
    runtime.start();
    await waitFor(() => runtime.getNode('getter')?.outputValues.value === true);

    const resetSource = runtime.getNode('reset-source');
    assert.ok(resetSource);
    resetSource.inputValues.value = true;
    await waitFor(() => runtime.getNode('getter')?.outputValues.value === false);
  } finally {
    runtime.stop();
  }
});

test('set boolean variable default initializes before any sink write', async () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    nodes: [
      { ...testNode('getter', 'get-boolean-variable'), config: { name: 'flag' } },
      {
        ...testNode('setter', 'set-boolean-variable'),
        config: { name: 'flag', defaultValue: true, mode: 'latchTrue' },
      },
    ],
    connections: [],
  });

  try {
    runtime.start();
    await waitFor(() => runtime.getNode('getter')?.outputValues.value === true);
  } finally {
    runtime.stop();
  }
});

test('boolean variable default can drive client button display and show anything', async () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a'],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    nodes: [
      {
        ...testNode('setter', 'set-boolean-variable'),
        config: { name: 'flag', defaultValue: true, mode: 'latchTrue' },
      },
      { ...testNode('getter', 'get-boolean-variable'), config: { name: 'flag' } },
      testNode('button', 'client-button'),
      testNode('preview', 'show-anything'),
    ],
    connections: [
      {
        id: 'value-display',
        sourceNodeId: 'getter',
        sourcePortId: 'value',
        targetNodeId: 'button',
        targetPortId: 'display',
      },
      {
        id: 'value-preview',
        sourceNodeId: 'getter',
        sourcePortId: 'value',
        targetNodeId: 'preview',
        targetPortId: 'in',
      },
    ],
  });

  try {
    runtime.start();
    await waitFor(() => {
      const buttonOut = runtime.getNode('button')?.outputValues.out;
      return (
        runtime.getNode('getter')?.outputValues.value === true &&
        runtime.getNode('preview')?.outputValues.value === 'true' &&
        Array.isArray(buttonOut) &&
        buttonOut.some((item) => (item as { type?: string }).type === 'button')
      );
    });
  } finally {
    runtime.stop();
  }
});

test('set and get boolean variable nodes accept connected name default and mode inputs', async () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    nodes: [
      { ...testNode('name-source', 'string'), inputValues: { value: 'dynamic-flag' } },
      { ...testNode('mode-source', 'string'), inputValues: { value: 'followInput' } },
      { ...testNode('default-source', 'bool'), inputValues: { value: true } },
      { ...testNode('source', 'bool'), inputValues: { value: false } },
      {
        ...testNode('setter', 'set-boolean-variable'),
        config: { name: 'config-flag', defaultValue: false, mode: 'latchTrue' },
      },
      { ...testNode('getter', 'get-boolean-variable'), config: { name: 'config-flag' } },
    ],
    connections: [
      {
        id: 'name-setter',
        sourceNodeId: 'name-source',
        sourcePortId: 'value',
        targetNodeId: 'setter',
        targetPortId: 'name',
      },
      {
        id: 'name-getter',
        sourceNodeId: 'name-source',
        sourcePortId: 'value',
        targetNodeId: 'getter',
        targetPortId: 'name',
      },
      {
        id: 'mode-setter',
        sourceNodeId: 'mode-source',
        sourcePortId: 'value',
        targetNodeId: 'setter',
        targetPortId: 'mode',
      },
      {
        id: 'default-setter',
        sourceNodeId: 'default-source',
        sourcePortId: 'value',
        targetNodeId: 'setter',
        targetPortId: 'defaultValue',
      },
      {
        id: 'source-setter',
        sourceNodeId: 'source',
        sourcePortId: 'value',
        targetNodeId: 'setter',
        targetPortId: 'set',
      },
    ],
  });

  try {
    runtime.start();
    await waitFor(() => runtime.getNode('getter')?.outputValues.value === false);

    const source = runtime.getNode('source');
    assert.ok(source);
    source.inputValues.value = true;
    await waitFor(() => runtime.getNode('getter')?.outputValues.value === true);

    source.inputValues.value = false;
    await waitFor(() => runtime.getNode('getter')?.outputValues.value === false);
  } finally {
    runtime.stop();
  }
});

test('named boolean variable state clears when variable nodes stop', async () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });

  const first = new NodeRuntime(registry);
  first.loadGraph({
    nodes: [
      { ...testNode('source', 'bool'), inputValues: { value: true } },
      {
        ...testNode('setter', 'set-boolean-variable'),
        config: { name: 'session-flag', defaultValue: false, mode: 'followInput' },
      },
      { ...testNode('getter', 'get-boolean-variable'), config: { name: 'session-flag', defaultValue: false } },
    ],
    connections: [
      {
        id: 'source-set',
        sourceNodeId: 'source',
        sourcePortId: 'value',
        targetNodeId: 'setter',
        targetPortId: 'set',
      },
    ],
  });

  first.start();
  await waitFor(() => first.getNode('getter')?.outputValues.value === true);
  first.stop();

  const second = new NodeRuntime(registry);
  second.loadGraph({
    nodes: [
      {
        ...testNode('getter-again', 'get-boolean-variable'),
        config: { name: 'session-flag', defaultValue: false },
      },
    ],
    connections: [],
  });
  second.step();

  assert.equal(second.getNode('getter-again')?.outputValues.value, false);
});

test('number and string variables commit on write pulses and reset to defaults', async () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    nodes: [
      { ...testNode('number-source', 'float'), inputValues: { value: 12.5 } },
      { ...testNode('string-source', 'string'), inputValues: { value: 'alpha' } },
      { ...testNode('write', 'bool'), inputValues: { value: true } },
      { ...testNode('reset', 'bool'), inputValues: { value: false } },
      { ...testNode('number-var', 'number-variable'), config: { defaultValue: 3 } },
      { ...testNode('string-var', 'string-variable'), config: { defaultValue: 'idle' } },
    ],
    connections: [
      {
        id: 'number-value',
        sourceNodeId: 'number-source',
        sourcePortId: 'value',
        targetNodeId: 'number-var',
        targetPortId: 'value',
      },
      {
        id: 'string-value',
        sourceNodeId: 'string-source',
        sourcePortId: 'value',
        targetNodeId: 'string-var',
        targetPortId: 'value',
      },
      {
        id: 'number-write',
        sourceNodeId: 'write',
        sourcePortId: 'value',
        targetNodeId: 'number-var',
        targetPortId: 'write',
      },
      {
        id: 'string-write',
        sourceNodeId: 'write',
        sourcePortId: 'value',
        targetNodeId: 'string-var',
        targetPortId: 'write',
      },
      {
        id: 'number-reset',
        sourceNodeId: 'reset',
        sourcePortId: 'value',
        targetNodeId: 'number-var',
        targetPortId: 'reset',
      },
      {
        id: 'string-reset',
        sourceNodeId: 'reset',
        sourcePortId: 'value',
        targetNodeId: 'string-var',
        targetPortId: 'reset',
      },
    ],
  });

  try {
    runtime.start();
    await waitFor(
      () =>
        runtime.getNode('number-var')?.outputValues.value === 12.5 &&
        runtime.getNode('string-var')?.outputValues.value === 'alpha'
    );

    const write = runtime.getNode('write');
    const numberSource = runtime.getNode('number-source');
    const stringSource = runtime.getNode('string-source');
    assert.ok(write);
    assert.ok(numberSource);
    assert.ok(stringSource);
    write.inputValues.value = false;
    numberSource.inputValues.value = 44;
    stringSource.inputValues.value = 'beta';

    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(runtime.getNode('number-var')?.outputValues.value, 12.5);
    assert.equal(runtime.getNode('string-var')?.outputValues.value, 'alpha');

    write.inputValues.value = true;
    await waitFor(
      () =>
        runtime.getNode('number-var')?.outputValues.value === 44 &&
        runtime.getNode('string-var')?.outputValues.value === 'beta'
    );

    const reset = runtime.getNode('reset');
    assert.ok(reset);
    reset.inputValues.value = true;
    await waitFor(
      () =>
        runtime.getNode('number-var')?.outputValues.value === 3 &&
        runtime.getNode('string-var')?.outputValues.value === 'idle'
    );
  } finally {
    runtime.stop();
  }
});

test('default registry exposes split variable nodes', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });

  assert.ok(registry.get('set-boolean-variable'));
  assert.ok(registry.get('get-boolean-variable'));
  assert.ok(registry.get('number-variable'));
  assert.ok(registry.get('string-variable'));
});

test('default registry exposes pulse event ports and pulse to boolean conversion', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });

  assert.equal(registry.get('client-button')?.outputs.find((port) => port.id === 'pressed')?.type, 'pulse');
  const converter = registry.get('pulse-to-boolean');
  assert.ok(converter);
  assert.equal(converter.inputs.find((port) => port.id === 'pulse')?.type, 'pulse');
  assert.equal(converter.outputs.find((port) => port.id === 'value')?.type, 'boolean');
  const booleanToPulse = registry.get('boolean-to-pulse');
  assert.ok(booleanToPulse);
  assert.equal(booleanToPulse.inputs.find((port) => port.id === 'value')?.type, 'boolean');
  assert.equal(booleanToPulse.outputs.find((port) => port.id === 'pulse')?.type, 'pulse');
});

test('client loader applies index range and random to loaded client ids', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a', 'client-b', 'client-c', 'client-d'],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });
  const loader = registry.get('client-loader');
  assert.ok(loader);

  const context = { nodeId: 'loader-loaded-subset', time: 0, deltaTime: 0 };
  const selected = loader.process(
    {
      loadIndexs: ['client-a', 'client-b', 'client-c'],
      index: 2,
      range: 2,
      random: false,
    },
    {},
    context
  );

  assert.deepEqual(selected.indexs, ['client-b', 'client-c']);
  assert.equal(selected.number, 2);
  assert.equal((selected.client as { clientId?: string }).clientId, 'client-b');
  assert.deepEqual((selected.client as { clientIds?: string[] }).clientIds, [
    'client-b',
    'client-c',
  ]);

  const selectedWithCachedClientId = loader.process(
    {
      loadIndexs: ['client-a', 'client-b', 'client-c'],
      index: 3,
      range: 1,
      random: false,
    },
    { clientId: 'client-a' },
    context
  );

  assert.deepEqual(selectedWithCachedClientId.indexs, ['client-c']);
  assert.equal((selectedWithCachedClientId.client as { clientId?: string }).clientId, 'client-c');

  const randomA = loader.process(
    {
      loadIndexs: ['client-a', 'client-b', 'client-c'],
      index: 1,
      range: 2,
      random: true,
    },
    {},
    { ...context, nodeId: 'loader-random-subset' }
  );
  const randomB = loader.process(
    {
      loadIndexs: ['client-a', 'client-b', 'client-c'],
      index: 2,
      range: 2,
      random: true,
    },
    {},
    { ...context, nodeId: 'loader-random-subset' }
  );

  assert.equal((randomA.indexs as string[]).length, 2);
  assert.equal((randomB.indexs as string[]).length, 2);
  assert.notDeepEqual(randomA.indexs, randomB.indexs);
  assert.ok(
    (randomA.indexs as string[]).every((clientId) =>
      ['client-a', 'client-b', 'client-c'].includes(clientId)
    )
  );
  assert.ok(
    (randomB.indexs as string[]).every((clientId) =>
      ['client-a', 'client-b', 'client-c'].includes(clientId)
    )
  );
});

test('default registry replaces legacy client-object with loader and executor nodes', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a'],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });

  assert.equal(registry.get('client-object'), undefined);
  assert.equal(registry.get('client-loader')?.label, 'Client Loader');
  assert.equal(registry.get('client-executor')?.label, 'Client Executor');
});

test('default registry exposes int, float, and display-object for server semantic authority', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });

  const display = registry.get('display-object');
  const intNode = registry.get('int');
  const floatNode = registry.get('float');

  assert.equal(display?.label, 'Display');
  assert.equal(display?.metadata?.platformTargets.includes('display'), true);
  assert.equal(
    display?.inputs.some((input) => input.id === 'in' && input.type === 'command'),
    true
  );
  assert.equal(
    display?.configSchema.some((field) => field.key === 'displayId'),
    true
  );
  assert.equal(registry.get('number'), undefined);
  assert.equal(intNode?.label, 'Int');
  assert.equal(intNode?.configSchema.find((field) => field.key === 'value')?.step, 1);
  assert.equal(floatNode?.label, 'Float');
  assert.equal(floatNode?.configSchema.find((field) => field.key === 'value')?.step, 0.01);
});

test('url to qr generator converts a string input into an image data url', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });
  const node = registry.get('url-to-qr-generator');
  assert.ok(node);
  assert.deepEqual(
    node.inputs.map((input) => [input.id, input.type]),
    [['url', 'string']]
  );
  assert.deepEqual(
    node.outputs.map((output) => [output.id, output.type]),
    [['image', 'image']]
  );

  const result = node.process(
    { url: 'https://fluffyfoundation.xyz/client?sessionId=session-a' },
    {},
    { nodeId: 'qr', time: 0, deltaTime: 0 }
  );

  assert.match(String(result.image), /^data:image\/svg\+xml;charset=utf-8,/);
  assert.match(decodeURIComponent(String(result.image).split(',', 2)[1] ?? ''), /<svg/);
});

test('gpt image gen exposes prompt image trigger inputs and image asset outputs', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
    imageAssets: {
      getGeneratedImageAsset: () => '',
    },
  });

  const node = registry.get('gpt-image-gen');
  assert.ok(node);
  assert.equal(node.label, 'GPT Image Gen');
  assert.deepEqual(
    node.inputs.map((input) => [input.id, input.type]),
    [
      ['prompt', 'string'],
      ['image', 'image'],
      ['trigger', 'boolean'],
      ['model', 'string'],
      ['size', 'string'],
      ['quality', 'string'],
    ]
  );
  assert.deepEqual(
    node.outputs.map((output) => [output.id, output.type]),
    [
      ['image', 'image'],
      ['assetId', 'string'],
    ]
  );
  assert.deepEqual(
    node.inputs
      .filter((input) => ['model', 'size', 'quality'].includes(input.id))
      .map((input) => [input.id, input.type, input.options?.map((option) => option.value)]),
    [
      ['model', 'string', ['gpt-image-2']],
      ['size', 'string', ['1024x1024', '1024x1536', '1536x1024']],
      ['quality', 'string', ['low', 'medium', 'high']],
    ]
  );
  const modelField = node.configSchema.find((field) => field.key === 'model');
  const sizeField = node.configSchema.find((field) => field.key === 'size');
  const qualityField = node.configSchema.find((field) => field.key === 'quality');
  assert.equal(modelField?.type, 'select');
  assert.equal(modelField?.defaultValue, 'gpt-image-2');
  assert.deepEqual(
    modelField?.options?.map((option) => option.value),
    ['gpt-image-2']
  );
  assert.equal(modelField?.connectable, true);
  assert.equal(sizeField?.defaultValue, '1024x1024');
  assert.equal(sizeField?.connectable, true);
  assert.equal(qualityField?.defaultValue, 'low');
  assert.equal(qualityField?.connectable, true);
});

test('gpt image gen triggers generation on rising edges and reuses same-signature cache', () => {
  const calls: Array<Record<string, unknown>> = [];
  const readyAssetBySignature = new Map<string, string>();
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
    imageAssets: {
      getGeneratedImageAsset: (request) => {
        const signature = JSON.stringify(request);
        const ready = readyAssetBySignature.get(signature);
        if (ready) return ready;
        calls.push(request);
        const assetId = calls.length === 1 ? 'asset-1' : 'asset-2';
        readyAssetBySignature.set(signature, assetId);
        return assetId;
      },
    },
  });

  const node = registry.get('gpt-image-gen');
  assert.ok(node);
  const context = { nodeId: 'gpt-image-gen-test', time: 0, deltaTime: 0 };
  const config = { model: 'gpt-image-2', size: '1024x1024', quality: 'low' };
  const baseInputs = {
    prompt: 'a small red cube on a table',
    image: 'asset:source-image',
  };

  assert.deepEqual(node.process({ ...baseInputs, trigger: false }, config, context), {
    image: '',
    assetId: '',
  });
  assert.equal(calls.length, 0);

  assert.deepEqual(node.process({ ...baseInputs, trigger: true }, config, context), {
    image: 'asset:asset-1',
    assetId: 'asset-1',
  });
  assert.deepEqual(calls[0], {
    prompt: 'a small red cube on a table',
    image: 'asset:source-image',
    model: 'gpt-image-2',
    size: '1024x1024',
    quality: 'low',
  });

  assert.deepEqual(node.process({ ...baseInputs, trigger: true }, config, context), {
    image: 'asset:asset-1',
    assetId: 'asset-1',
  });
  assert.equal(calls.length, 1);

  assert.deepEqual(node.process({ ...baseInputs, trigger: false }, config, context), {
    image: 'asset:asset-1',
    assetId: 'asset-1',
  });
  assert.deepEqual(node.process({ ...baseInputs, trigger: true }, config, context), {
    image: 'asset:asset-1',
    assetId: 'asset-1',
  });
  assert.equal(calls.length, 1);

  assert.deepEqual(
    node.process({ ...baseInputs, prompt: 'a blue cube', trigger: true }, config, context),
    {
      image: 'asset:asset-1',
      assetId: 'asset-1',
    }
  );
  assert.equal(calls.length, 1);

  node.process({ ...baseInputs, prompt: 'a blue cube', trigger: false }, config, context);
  assert.deepEqual(
    node.process({ ...baseInputs, prompt: 'a blue cube', trigger: true }, config, context),
    {
      image: 'asset:asset-2',
      assetId: 'asset-2',
    }
  );
  assert.equal(calls.length, 2);
});

test('gpt image gen connectable option inputs override config fallbacks', () => {
  const calls: Array<Record<string, unknown>> = [];
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
    imageAssets: {
      getGeneratedImageAsset: (request) => {
        calls.push(request);
        return 'asset-option-inputs';
      },
    },
  });

  const node = registry.get('gpt-image-gen');
  assert.ok(node);
  const result = node.process(
    {
      prompt: 'a glass sphere',
      image: '',
      trigger: true,
      model: 'gpt-image-2',
      size: '1536x1024',
      quality: 'high',
    },
    { model: 'ignored-model', size: '1024x1024', quality: 'low' },
    { nodeId: 'gpt-image-gen-option-inputs', time: 0, deltaTime: 0 }
  );

  assert.deepEqual(result, { image: 'asset:asset-option-inputs', assetId: 'asset-option-inputs' });
  assert.deepEqual(calls[0], {
    prompt: 'a glass sphere',
    model: 'gpt-image-2',
    size: '1536x1024',
    quality: 'high',
  });
});

test('client permission filter supports all and any permission matching', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a', 'client-b', 'display-1'],
    getSelectedClientIds: () => [],
    getClientPermissions: (clientId) => {
      if (clientId === 'client-a') return { microphone: 'granted', motion: 'granted' };
      if (clientId === 'client-b') return { microphone: 'granted', motion: 'denied' };
      return { microphone: 'granted', motion: 'granted' };
    },
    isAudienceClient: (clientId) => clientId !== 'display-1',
    executeCommand: () => {},
  });
  const node = registry.get('client-permission-filter');
  assert.ok(node);

  assert.deepEqual(
    node.process(
      {},
      { microphone: true, motion: true, matchMode: 'all' },
      { nodeId: 'filter', time: 0, deltaTime: 0 }
    ),
    {
      client: { clientId: 'client-a', clientIds: ['client-a'], sensors: null },
      indexs: ['client-a'],
      number: 1,
      rejectedIndexs: ['client-b'],
    }
  );
  assert.deepEqual(
    node.process(
      {},
      { microphone: true, motion: true, matchMode: 'any' },
      { nodeId: 'filter', time: 0, deltaTime: 0 }
    ),
    {
      client: { clientId: 'client-a', clientIds: ['client-a', 'client-b'], sensors: null },
      indexs: ['client-a', 'client-b'],
      number: 2,
      rejectedIndexs: [],
    }
  );
});

test('client permission filter pass-throughs empty requirements and filters client input collections', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a', 'client-b', 'client-c'],
    getSelectedClientIds: () => [],
    getClientPermissions: (clientId) =>
      clientId === 'client-b' ? { camera: 'granted' } : { camera: 'pending' },
    executeCommand: () => {},
  });
  const node = registry.get('client-permission-filter');
  assert.ok(node);

  assert.deepEqual(
    node.process(
      { client: { clientId: 'client-a', clientIds: ['client-a', 'client-b'] } },
      { camera: true, matchMode: 'all' },
      { nodeId: 'filter', time: 0, deltaTime: 0 }
    ),
    {
      client: { clientId: 'client-b', clientIds: ['client-b'], sensors: null },
      indexs: ['client-b'],
      number: 1,
      rejectedIndexs: ['client-a'],
    }
  );
  assert.deepEqual(
    node.process(
      { client: { clientId: 'client-a', clientIds: ['client-a', 'client-b'] } },
      { matchMode: 'all' },
      { nodeId: 'filter', time: 0, deltaTime: 0 }
    ),
    {
      client: { clientId: 'client-a', clientIds: ['client-a', 'client-b'], sensors: null },
      indexs: ['client-a', 'client-b'],
      number: 2,
      rejectedIndexs: [],
    }
  );
});

test('client permission filter supports boolean inputs overriding permission config toggles', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a', 'client-b'],
    getSelectedClientIds: () => [],
    getClientPermissions: (clientId) =>
      clientId === 'client-b' ? { camera: 'granted' } : { camera: 'denied' },
    executeCommand: () => {},
  });
  const node = registry.get('client-permission-filter');
  assert.ok(node);

  assert.deepEqual(
    node.inputs
      .filter((input) => input.type === 'boolean')
      .map((input) => input.id)
      .sort(),
    ['camera', 'geolocation', 'microphone', 'motion', 'wakeLock'].sort()
  );
  assert.deepEqual(
    node.process(
      { camera: false },
      { camera: true, matchMode: 'all' },
      { nodeId: 'filter', time: 0, deltaTime: 0 }
    ),
    {
      client: { clientId: 'client-a', clientIds: ['client-a', 'client-b'], sensors: null },
      indexs: ['client-a', 'client-b'],
      number: 2,
      rejectedIndexs: [],
    }
  );
  assert.deepEqual(
    node.process(
      { camera: true },
      { camera: false, matchMode: 'all' },
      { nodeId: 'filter', time: 0, deltaTime: 0 }
    ),
    {
      client: { clientId: 'client-b', clientIds: ['client-b'], sensors: null },
      indexs: ['client-b'],
      number: 1,
      rejectedIndexs: ['client-a'],
    }
  );
});

test('url session node creates a new session only on trigger pulses', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });
  const node = registry.get('url-session');
  assert.ok(node);

  const context = { nodeId: 'url-session-1', time: 0, deltaTime: 0 };
  const idle = node.process({}, { baseUrl: 'https://example.test/client' }, context);
  assert.equal(idle.sessionId, '');
  assert.equal(idle.url, 'https://example.test/client');

  const first = node.process(
    { trigger: true },
    { baseUrl: 'https://example.test/client' },
    context
  );
  assert.match(String(first.sessionId), /^us_[a-z0-9]+$/);
  assert.equal(first.url, `https://example.test/client?sessionId=${first.sessionId}`);

  const held = node.process({ trigger: true }, { baseUrl: 'https://example.test/client' }, context);
  assert.equal(held.sessionId, first.sessionId);
  assert.equal(held.url, first.url);

  node.process({ trigger: false }, { baseUrl: 'https://example.test/client' }, context);
  const second = node.process(
    { trigger: true },
    { baseUrl: 'https://example.test/client' },
    context
  );
  assert.notEqual(second.sessionId, first.sessionId);
});

test('client url session filter narrows client collections and pass-throughs empty sessions', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => ['client-a', 'client-b', 'client-c', 'display-1'],
    getSelectedClientIds: () => [],
    getClientUrlSessionId: (clientId) => {
      if (clientId === 'client-a') return 'session-a';
      if (clientId === 'client-b') return 'session-b';
      if (clientId === 'display-1') return 'session-a';
      return null;
    },
    isAudienceClient: (clientId) => clientId !== 'display-1',
    executeCommand: () => {},
  });
  const node = registry.get('client-url-session-filter');
  assert.ok(node);

  const filtered = node.process(
    { sessionId: 'session-a' },
    {},
    { nodeId: 'url-filter', time: 0, deltaTime: 0 }
  );
  assert.deepEqual(filtered.indexs, ['client-a']);
  assert.deepEqual(filtered.rejectedIndexs, ['client-b', 'client-c']);
  assert.equal(filtered.number, 1);
  assert.equal((filtered.client as { clientId?: string }).clientId, 'client-a');
  assert.deepEqual((filtered.client as { clientIds?: string[] }).clientIds, ['client-a']);

  const subset = node.process(
    {
      client: { clientId: 'client-b', clientIds: ['client-b', 'client-c'] },
      sessionId: 'session-b',
    },
    {},
    { nodeId: 'url-filter', time: 0, deltaTime: 0 }
  );
  assert.deepEqual(subset.indexs, ['client-b']);
  assert.deepEqual(subset.rejectedIndexs, ['client-c']);

  const passThrough = node.process(
    { client: { clientId: 'client-b', clientIds: ['client-b', 'client-c'] } },
    {},
    { nodeId: 'url-filter', time: 0, deltaTime: 0 }
  );
  assert.deepEqual(passThrough.indexs, ['client-b', 'client-c']);
  assert.deepEqual(passThrough.rejectedIndexs, []);
});

test('semantic command normalization migrates legacy number source nodes to float', () => {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    executeCommand: () => {},
  });
  const bus = createSemanticCommandBus({
    graph: { nodes: [], connections: [] },
    definitions: registry.list(),
    runtimeStatus: { running: false, deployedPartitionIds: [] },
    revision: 0,
  });

  const added = bus.dispatch({
    actor: { id: 'cli', role: 'operator' },
    command: {
      type: 'node.add',
      node: {
        id: 'legacy-number',
        type: 'number',
        position: { x: 0, y: 0 },
        config: { value: 1 },
        inputValues: {},
        outputValues: {},
      },
    },
  });

  assert.equal(added.ok, true);
  assert.equal(added.command.type, 'node.add');
  assert.equal(added.command.type === 'node.add' ? added.command.node.type : null, 'float');
  assert.equal(bus.getSnapshot().nodes[0]?.type, 'float');
});

test('runtime watchdog reports compile errors without stopping an already running graph', () => {
  const registry = new NodeRegistry();
  registry.register({
    type: 'const',
    label: 'Const',
    category: 'Test',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [],
    process: () => ({ out: 1 }),
  });
  registry.register({
    type: 'pass',
    label: 'Pass',
    category: 'Test',
    inputs: [{ id: 'in', label: 'In', type: 'number' }],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [],
    process: (inputs) => ({ out: inputs.in }),
  });

  const watchdogs: NodeRuntimeWatchdogInfo[] = [];
  let tickCount = 0;
  const runtime = new NodeRuntime(registry, {
    onTick: () => {
      tickCount += 1;
    },
    onWatchdog: (info) => {
      watchdogs.push(info);
    },
  });

  runtime.loadGraph({
    nodes: [testNode('a', 'pass'), testNode('b', 'pass')],
    connections: [
      { id: 'c1', sourceNodeId: 'a', sourcePortId: 'out', targetNodeId: 'b', targetPortId: 'in' },
      { id: 'c2', sourceNodeId: 'b', sourcePortId: 'out', targetNodeId: 'a', targetPortId: 'in' },
    ],
  });

  try {
    runtime.start();
    runtime.step();
    assert.equal(watchdogs.at(-1)?.reason, 'compile-error');
    runtime.step();
    assert.equal(tickCount, 2);
  } finally {
    runtime.stop();
  }
});

test('runtime watchdog reports sink bursts without stopping the active graph', () => {
  const registry = new NodeRegistry();
  registry.register({
    type: 'prod',
    label: 'Prod',
    category: 'Test',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'command' }],
    configSchema: [],
    process: () => ({ out: { action: 'flashlight', payload: { mode: 'on' } } }),
  });
  registry.register({
    type: 'sink',
    label: 'Sink',
    category: 'Test',
    inputs: [{ id: 'in', label: 'In', type: 'command', kind: 'sink' }],
    outputs: [],
    configSchema: [],
    process: () => ({}),
    onSink: () => {},
  });

  const watchdogs: NodeRuntimeWatchdogInfo[] = [];
  let tickCount = 0;
  const runtime = new NodeRuntime(registry, {
    watchdog: { maxSinkValuesPerTick: 1 },
    onTick: () => {
      tickCount += 1;
    },
    onWatchdog: (info) => {
      watchdogs.push(info);
    },
  });

  runtime.loadGraph({
    nodes: [testNode('p1', 'prod'), testNode('p2', 'prod'), testNode('s', 'sink')],
    connections: [
      { id: 'c1', sourceNodeId: 'p1', sourcePortId: 'out', targetNodeId: 's', targetPortId: 'in' },
      { id: 'c2', sourceNodeId: 'p2', sourcePortId: 'out', targetNodeId: 's', targetPortId: 'in' },
    ],
  });

  try {
    runtime.start();
    runtime.step();
    assert.equal(watchdogs.at(-1)?.reason, 'sink-burst');
    runtime.step();
    assert.equal(tickCount, 2);
  } finally {
    runtime.stop();
  }
});

test('loadGraph preserves the previous graph when the next graph is invalid', () => {
  const registry = new NodeRegistry();
  registry.register({
    type: 'const',
    label: 'Const',
    category: 'Test',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [],
    process: () => ({ out: 1 }),
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    nodes: [testNode('good', 'const')],
    connections: [],
  });

  assert.throws(
    () =>
      runtime.loadGraph({
        nodes: [testNode('bad', 'missing-type')],
        connections: [],
      }),
    /unknown node type/i
  );

  const graph = runtime.exportGraph();
  assert.deepEqual(
    graph.nodes.map((node) => node.id),
    ['good']
  );
  assert.deepEqual(graph.connections, []);
});
