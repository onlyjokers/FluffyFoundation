/**
 * Purpose: Unit tests for visual scene chain nodes + scene layer player.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NodeRegistry,
  NodeRuntime,
  registerDefaultNodeDefinitions,
} from '../dist-node-core/index.js';

function buildRegistry({ onCommand } = {}) {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    getLatestSensor: () => null,
    getSensorForClientId: () => null,
    executeCommand: onCommand ?? (() => {}),
    executeCommandForClientId: () => {},
  });
  return registry;
}

function nodeInstance(id, type, overrides = {}) {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    config: {},
    inputValues: {},
    outputValues: {},
    ...overrides,
  };
}

test('scene-box appends {type:\"box\"} to the chain', () => {
  const registry = buildRegistry();
  const def = registry.get('scene-box');
  assert.ok(def, 'expected scene-box definition');

  const context = { nodeId: 'n1', time: 0, deltaTime: 0 };
  const out = def.process({ in: [] }, {}, context);
  assert.deepEqual(out, { out: [{ type: 'box' }] });
});

test('scene-fct-track appends configured FCT track scene to the chain', () => {
  const registry = buildRegistry();
  const def = registry.get('scene-fct-track');
  assert.ok(def, 'expected scene-fct-track definition');

  const context = { nodeId: 'fct', time: 0, deltaTime: 0 };
  const out = def.process(
    { in: [{ type: 'box' }] },
    {
      variant: 'acab',
      palette: 'red-black-invert',
      sensitivity: 1.25,
      brightness: 0.85,
      contrast: 1.1,
      blend: 'over',
    },
    context
  );

  assert.deepEqual(out, {
    out: [
      { type: 'box' },
      {
        type: 'fctTrack',
        variant: 'acab',
        palette: 'red-black-invert',
        sensitivity: 1.25,
        brightness: 0.85,
        contrast: 1.1,
        blend: 'over',
      },
    ],
  });
});

test('scene-fct-track exposes numeric parameters as connectable inputs', () => {
  const registry = buildRegistry();
  const def = registry.get('scene-fct-track');
  assert.ok(def, 'expected scene-fct-track definition');

  assert.deepEqual(
    def.inputs.map((input) => ({ id: input.id, type: input.type })),
    [
      { id: 'in', type: 'scene' },
      { id: 'sensitivity', type: 'number' },
      { id: 'brightness', type: 'number' },
      { id: 'contrast', type: 'number' },
    ]
  );
});

test('scene-fct-track numeric inputs override config fallbacks', () => {
  const registry = buildRegistry();
  const def = registry.get('scene-fct-track');
  assert.ok(def, 'expected scene-fct-track definition');

  const context = { nodeId: 'fct', time: 0, deltaTime: 0 };
  const out = def.process(
    {
      in: [],
      sensitivity: 1.4,
      brightness: 0.65,
      contrast: 1.35,
    },
    {
      variant: 'shattered-reality',
      palette: 'red',
      sensitivity: 0.1,
      brightness: 0.2,
      contrast: 0.3,
      blend: 'replace',
    },
    context
  );

  assert.deepEqual(out, {
    out: [
      {
        type: 'fctTrack',
        variant: 'shattered-reality',
        palette: 'red',
        sensitivity: 1.4,
        brightness: 0.65,
        contrast: 1.35,
        blend: 'replace',
      },
    ],
  });
});

test('scene-out sends visualScenes and clears on stop', () => {
  const sent = [];
  const registry = buildRegistry({
    onCommand: (cmd) => sent.push(cmd),
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    nodes: [
      nodeInstance('box', 'scene-box'),
      nodeInstance('cam', 'scene-front-camera'),
      nodeInstance('out', 'scene-out'),
    ],
    connections: [
      {
        id: 'c1',
        sourceNodeId: 'box',
        sourcePortId: 'out',
        targetNodeId: 'cam',
        targetPortId: 'in',
      },
      {
        id: 'c2',
        sourceNodeId: 'cam',
        sourcePortId: 'out',
        targetNodeId: 'out',
        targetPortId: 'in',
      },
    ],
  });
  runtime.compileNow();

  runtime.start();
  runtime.tick();

  assert.ok(sent.length >= 1);
  assert.deepEqual(sent[0], {
    action: 'visualScenes',
    payload: { scenes: [{ type: 'box' }, { type: 'frontCamera' }] },
  });

  runtime.stop();

  assert.ok(sent.length >= 2, 'expected a clear command on stop');
  assert.deepEqual(sent[sent.length - 1], {
    action: 'visualScenes',
    payload: { scenes: [] },
  });
});

test('scene-out sends configured FCT track scenes', () => {
  const sent = [];
  const registry = buildRegistry({
    onCommand: (cmd) => sent.push(cmd),
  });

  const runtime = new NodeRuntime(registry);
  runtime.loadGraph({
    nodes: [
      nodeInstance('fct', 'scene-fct-track', {
        config: {
          variant: 'strategia-della-tensione',
          palette: 'red-black',
          sensitivity: 0.75,
          brightness: 1.2,
          contrast: 0.95,
          blend: 'replace',
        },
      }),
      nodeInstance('out', 'scene-out'),
    ],
    connections: [
      {
        id: 'c1',
        sourceNodeId: 'fct',
        sourcePortId: 'out',
        targetNodeId: 'out',
        targetPortId: 'in',
      },
    ],
  });
  runtime.compileNow();

  runtime.start();
  runtime.tick();

  assert.ok(sent.length >= 1);
  assert.deepEqual(sent[0], {
    action: 'visualScenes',
    payload: {
      scenes: [
        {
          type: 'fctTrack',
          variant: 'strategia-della-tensione',
          palette: 'red-black',
          sensitivity: 0.75,
          brightness: 1.2,
          contrast: 0.95,
          blend: 'replace',
        },
      ],
    },
  });

  runtime.stop();
});
