// Purpose: Regression coverage for NodeRuntime graph execution semantics.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { registerDefaultNodeDefinitions } from './definitions/register.js';
import { NodeRegistry } from './registry.js';
import { NodeRuntime } from './runtime.js';
import type { GraphState } from './types.js';
import type { NodeCommand } from './definitions/types.js';

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
        id: 'client',
        type: 'client-object',
        position: { x: 0, y: 0 },
        config: { clientId: 'client-a' },
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
        targetNodeId: 'client',
        targetPortId: 'in',
      },
    ],
  };

  runtime.loadGraph(graph);
  runtime.start();
  await waitFor(() => commands.some((entry) => entry.cmd.payload.frequency === 440));

  const synth = runtime.getNode('synth');
  assert.ok(synth);
  synth.inputValues.frequency = 880;
  await waitFor(() => commands.some((entry) => entry.cmd.payload.frequency === 880));
  runtime.stop();

  assert.equal(commands[0].clientId, 'client-a');
  assert.equal(commands[0].cmd.action, 'modulateSoundUpdate');
  assert.equal(commands[0].cmd.payload.frequency, 440);
  const updated = commands.find((entry) => entry.cmd.payload.frequency === 880);
  assert.ok(updated);
  assert.equal(updated.clientId, 'client-a');
  assert.equal(updated.cmd.action, 'modulateSoundUpdate');
});

test('configured client-object target receives command sink effects', async () => {
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
        inputValues: { active: true, frequency: 440, volume: 0.7, waveform: 'square', durationMs: 200 },
        outputValues: {},
      },
      {
        id: 'client',
        type: 'client-object',
        position: { x: 0, y: 0 },
        config: { clientId: 'client-b' },
        inputValues: { index: 1, range: 1, random: false },
        outputValues: {},
      },
    ],
    connections: [
      {
        id: 'c1',
        sourceNodeId: 'synth',
        sourcePortId: 'cmd',
        targetNodeId: 'client',
        targetPortId: 'in',
      },
    ],
  });

  runtime.start();
  await waitFor(() => commands.length > 0);
  runtime.stop();

  assert.equal(commands[0].clientId, 'client-b');
});
