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
  assert.deepEqual(out, { out: [{ type: 'box', color: '#4a90d9', showBackground: 0, audioSource: 'microphone' }] });
});

test('scene-box appends color, background opacity, and audio source config to the chain', () => {
  const registry = buildRegistry();
  const def = registry.get('scene-box');
  assert.ok(def, 'expected scene-box definition');

  assert.deepEqual(
    def.inputs.map((input) => ({ id: input.id, type: input.type })),
    [
      { id: 'in', type: 'scene' },
      { id: 'color', type: 'color' },
      { id: 'showBackground', type: 'number' },
      { id: 'audioSource', type: 'string' },
    ]
  );

  const context = { nodeId: 'box', time: 0, deltaTime: 0 };
  const out = def.process(
    { in: [], color: '#ff3366', showBackground: 0.25, audioSource: 'both' },
    { color: '#001122', showBackground: 0.75, audioSource: 'playback' },
    context
  );

  assert.deepEqual(out, {
    out: [{ type: 'box', color: '#ff3366', showBackground: 0.25, audioSource: 'both' }],
  });
});

test('scene-mel appends background opacity and audio source config to the chain', () => {
  const registry = buildRegistry();
  const def = registry.get('scene-mel');
  assert.ok(def, 'expected scene-mel definition');

  assert.deepEqual(
    def.inputs.map((input) => ({ id: input.id, type: input.type })),
    [
      { id: 'in', type: 'scene' },
      { id: 'showBackground', type: 'number' },
      { id: 'audioSource', type: 'string' },
    ]
  );

  const context = { nodeId: 'mel', time: 0, deltaTime: 0 };
  const out = def.process(
    { in: [], showBackground: 0.6, audioSource: 'playback' },
    { showBackground: 0, audioSource: 'both' },
    context
  );

  assert.deepEqual(out, { out: [{ type: 'mel', showBackground: 0.6, audioSource: 'playback' }] });
});

test('scene camera nodes do not expose background controls', () => {
  const registry = buildRegistry();
  const front = registry.get('scene-front-camera');
  const back = registry.get('scene-back-camera');
  assert.ok(front, 'expected scene-front-camera definition');
  assert.ok(back, 'expected scene-back-camera definition');

  assert.deepEqual(front.inputs.map((input) => input.id), ['in']);
  assert.deepEqual(front.configSchema, []);
  assert.deepEqual(back.inputs.map((input) => input.id), ['in']);
  assert.deepEqual(back.configSchema, []);

  const context = { nodeId: 'cam', time: 0, deltaTime: 0 };
  assert.deepEqual(front.process({ in: [] }, { showBackground: true }, context), {
    out: [{ type: 'frontCamera' }],
  });
  assert.deepEqual(back.process({ in: [] }, { showBackground: true }, context), {
    out: [{ type: 'backCamera' }],
  });
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
        audioSource: 'microphone',
        showBackground: 0,
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
      { id: 'showBackground', type: 'number' },
      { id: 'variant', type: 'string' },
      { id: 'palette', type: 'string' },
      { id: 'blend', type: 'string' },
      { id: 'audioSource', type: 'string' },
    ]
  );
});

test('scene-fct-track connectable select inputs override config fallbacks', () => {
  const registry = buildRegistry();
  const def = registry.get('scene-fct-track');
  assert.ok(def, 'expected scene-fct-track definition');

  const context = { nodeId: 'fct', time: 0, deltaTime: 0 };
  const out = def.process(
    {
      in: [],
      variant: 'acab',
      palette: 'red-black-invert',
      blend: 'over',
      audioSource: 'both',
    },
    {
      variant: 'shattered-reality',
      palette: 'red',
      blend: 'replace',
      audioSource: 'microphone',
    },
    context
  );

  assert.deepEqual(out.out[0], {
    type: 'fctTrack',
    variant: 'acab',
    palette: 'red-black-invert',
    sensitivity: 1,
    brightness: 1,
    contrast: 1,
    blend: 'over',
    audioSource: 'both',
    showBackground: 0,
  });
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
      showBackground: 0,
    },
    {
      variant: 'shattered-reality',
      palette: 'red',
      sensitivity: 0.1,
      brightness: 0.2,
      contrast: 0.3,
      blend: 'replace',
      audioSource: 'playback',
      showBackground: 1,
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
        audioSource: 'playback',
        showBackground: 0,
      },
    ],
  });
});

test('scene-fct-track uses show background config when the input is unconnected', () => {
  const registry = buildRegistry();
  const def = registry.get('scene-fct-track');
  assert.ok(def, 'expected scene-fct-track definition');

  const context = { nodeId: 'fct', time: 0, deltaTime: 0 };
  const out = def.process(
    { in: [] },
    {
      variant: 'shattered-reality',
      palette: 'red',
      showBackground: 1,
    },
    context
  );

  assert.equal(out.out[0].showBackground, 1);
});

test('scene box and FCT track preserve ordered overlay layers with background opacity', () => {
  const registry = buildRegistry();
  const box = registry.get('scene-box');
  const fct = registry.get('scene-fct-track');
  assert.ok(box, 'expected scene-box definition');
  assert.ok(fct, 'expected scene-fct-track definition');

  const context = { nodeId: 'n', time: 0, deltaTime: 0 };
  const boxOut = box.process({ in: [], showBackground: 0.4 }, { showBackground: 1 }, context).out;
  const fctOut = fct.process(
    { in: boxOut, showBackground: 0.2 },
    {
      variant: 'acab',
      palette: 'red-black',
      audioSource: 'both',
      showBackground: 1,
    },
    context
  ).out;

  assert.deepEqual(fctOut, [
    { type: 'box', color: '#4a90d9', showBackground: 0.4, audioSource: 'microphone' },
    {
      type: 'fctTrack',
      variant: 'acab',
      palette: 'red-black',
      sensitivity: 1,
      brightness: 1,
      contrast: 1,
      blend: 'replace',
      audioSource: 'both',
      showBackground: 0.2,
    },
  ]);
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
    payload: {
      scenes: [
        { type: 'box', color: '#4a90d9', showBackground: 0, audioSource: 'microphone' },
        { type: 'frontCamera' },
      ],
    },
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
          audioSource: 'microphone',
          showBackground: 1,
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
          audioSource: 'microphone',
          showBackground: 1,
        },
      ],
    },
  });

  runtime.stop();
});
