// Purpose: Verify the FCT track visual plugin contract and scene lifecycle.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FCT_TRACK_PALETTES,
  FCT_TRACK_VARIANTS,
  FCT_VISIBLE_THEME_STYLES,
  FctTrackScene,
  SHATTERED_REALITY_FRAGMENT_SHADER,
  buildStageAudioFeaturesForFct,
  fctTrackVisualPlugin,
  sceneIdForType,
} from '../dist-visual-plugins-out/index.js';

test('FCT visual plugin manifest declares visual scene capability', () => {
  assert.equal(fctTrackVisualPlugin.manifest.id, 'fct-track-visuals');
  assert.deepEqual(fctTrackVisualPlugin.manifest.capabilities, ['visual.scene']);
  assert.deepEqual(fctTrackVisualPlugin.manifest.sideEffects, ['visual']);
});

test('FctTrackScene supports all planned variants and palettes', () => {
  assert.deepEqual(FCT_TRACK_VARIANTS, [
    'shattered-reality',
    'acab',
    'il-crollo-del-cielo',
    'fantasmi-interrotti',
    'strategia-della-tensione',
    'alice-e-le-onde-eterne-della-fine',
  ]);
  assert.deepEqual(FCT_TRACK_PALETTES, [
    'red',
    'dark',
    'light',
    'red-white-invert',
    'red-black',
    'red-black-invert',
  ]);

  for (const variant of FCT_TRACK_VARIANTS) {
    for (const palette of FCT_TRACK_PALETTES) {
      const scene = new FctTrackScene({ variant, palette });
      assert.equal(scene.id, 'fct-track-scene');
      assert.equal(scene.getConfig().variant, variant);
      assert.equal(scene.getConfig().palette, palette);
    }
  }
});

test('FctTrackScene mount and unmount own a single canvas element', () => {
  const children = [];
  const container = {
    style: {},
    clientWidth: 320,
    clientHeight: 240,
    appendChild(node) {
      children.push(node);
      node.parentNode = this;
    },
    removeChild(node) {
      const index = children.indexOf(node);
      if (index >= 0) children.splice(index, 1);
      node.parentNode = null;
    },
  };

  const scene = new FctTrackScene();
  scene.mount(container);
  assert.equal(children.length, 1);
  assert.equal(children[0].dataset.shuguSceneId, 'fct-track-scene');

  scene.unmount();
  assert.equal(children.length, 0);
});

test('FctTrackScene can hide its theme background for overlay composition', () => {
  const children = [];
  const container = {
    style: {},
    clientWidth: 320,
    clientHeight: 240,
    appendChild(node) {
      children.push(node);
      node.parentNode = this;
    },
    removeChild(node) {
      const index = children.indexOf(node);
      if (index >= 0) children.splice(index, 1);
      node.parentNode = null;
    },
  };

  const scene = new FctTrackScene({ palette: 'red-black', showBackground: false });
  scene.mount(container);
  assert.equal(container.style.background, 'transparent');
  assert.equal(children[0].style.background, 'transparent');
  assert.equal(scene.getConfig().audioSource, 'microphone');

  scene.configure({ showBackground: true, audioSource: 'both' });
  assert.equal(container.style.background, '#000');
  assert.equal(children[0].style.background, '#000');
  assert.equal(scene.getConfig().audioSource, 'both');
  scene.unmount();
});

test('FctTrackScene normalizes log-power mel bands into FFT texture values', () => {
  const features = buildStageAudioFeaturesForFct(
    {
      melBands: [-8, -4, 0],
      lowEnergy: 0.2,
      midEnergy: 0.4,
      highEnergy: 0.6,
    },
    1
  );

  assert.deepEqual(features.fft?.slice(0, 3), [0, 0.5, 1]);
  assert.equal(features.low, 0.2);
  assert.equal(features.mid, 0.4);
  assert.equal(features.high, 0.6);
});

test('FctTrackScene applies the FCT visible theme surface for red and light palettes', () => {
  assert.deepEqual(FCT_VISIBLE_THEME_STYLES.red, {
    background: '#fff',
    overlayColor: '#de000d',
    overlayBlendMode: 'screen',
    overlayOpacity: '1',
  });
  assert.deepEqual(FCT_VISIBLE_THEME_STYLES.light, {
    background: '#000',
    overlayColor: '#de000d',
    overlayBlendMode: 'screen',
    overlayOpacity: '0',
  });

  const children = [];
  const container = {
    style: {},
    clientWidth: 320,
    clientHeight: 240,
    appendChild(node) {
      children.push(node);
      node.parentNode = this;
    },
    removeChild(node) {
      const index = children.indexOf(node);
      if (index >= 0) children.splice(index, 1);
      node.parentNode = null;
    },
  };

  const scene = new FctTrackScene({ palette: 'red' });
  scene.mount(container);
  assert.equal(container.style.background, '#fff');
  assert.equal(children[0].style.background, '#fff');

  scene.configure({ palette: 'light' });
  assert.equal(container.style.background, '#000');
  assert.equal(children[0].style.background, '#000');
  scene.unmount();
});

test('FctTrackScene uses the migrated FCT WebGL shader renderer contract', () => {
  const source = FctTrackScene.toString();
  assert.match(SHATTERED_REALITY_FRAGMENT_SHADER, /LineLight/);
  assert.match(SHATTERED_REALITY_FRAGMENT_SHADER, /uFrequencyData/);
  assert.match(source, /createMirroredStageRenderer/);
  assert.doesNotMatch(source, /getContext\('2d'/);
  assert.doesNotMatch(source, /drawShards|drawBars|drawGhosts/);
});

test('scene registry maps fctTrack payloads to the FCT scene plugin id', () => {
  assert.equal(sceneIdForType('fctTrack'), 'fct-track-scene');
});
