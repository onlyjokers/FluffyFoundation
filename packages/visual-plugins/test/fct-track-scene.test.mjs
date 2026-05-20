// Purpose: Verify the FCT track visual plugin contract and scene lifecycle.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FCT_TRACK_PALETTES,
  FCT_TRACK_VARIANTS,
  FCT_VISIBLE_THEME_STYLES,
  FctTrackScene,
  BoxScene,
  MelSpectrogramScene,
  SHATTERED_REALITY_FRAGMENT_SHADER,
  buildStageAudioFeaturesForFct,
  fctTrackVisualPlugin,
  selectFctAudioFeatures,
  selectVisualAudioFeatures,
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

test('FctTrackScene leaves DOM backgrounds transparent and delegates background opacity to WebGL', () => {
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

  const scene = new FctTrackScene({ palette: 'red-black', showBackground: 0.35 });
  scene.mount(container);
  assert.equal(container.style.background, 'transparent');
  assert.equal(children[0].style.background, 'transparent');
  assert.equal(scene.getConfig().audioSource, 'microphone');

  scene.configure({ showBackground: 1, audioSource: 'both' });
  assert.equal(container.style.background, 'transparent');
  assert.equal(children[0].style.background, 'transparent');
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

test('FctTrackScene audio source selection does not fall back playback to microphone', () => {
  const microphone = { rms: 0.8, lowEnergy: 0.8 };
  const playback = { rms: 0.2, lowEnergy: 0.2 };

  assert.equal(
    selectFctAudioFeatures(
      {
        audioFeatures: microphone,
        microphoneAudioFeatures: microphone,
      },
      'playback'
    ),
    undefined
  );
  assert.equal(
    selectFctAudioFeatures(
      {
        audioFeatures: microphone,
        microphoneAudioFeatures: microphone,
        playbackAudioFeatures: playback,
      },
      'playback'
    ),
    playback
  );
  assert.equal(
    selectFctAudioFeatures(
      {
        audioFeatures: microphone,
        microphoneAudioFeatures: microphone,
      },
      'microphone'
    ),
    microphone
  );
});

test('shared visual audio source selection keeps playback isolated and mixes both', () => {
  const microphone = { rms: 0.8, lowEnergy: 0.8, melBands: [-1, -2] };
  const playback = { rms: 0.2, lowEnergy: 0.2, melBands: [-7, -6] };

  assert.equal(
    selectVisualAudioFeatures(
      {
        audioFeatures: microphone,
        microphoneAudioFeatures: microphone,
      },
      'playback'
    ),
    undefined
  );
  assert.equal(
    selectVisualAudioFeatures(
      {
        audioFeatures: microphone,
        microphoneAudioFeatures: microphone,
        playbackAudioFeatures: playback,
      },
      'playback'
    ),
    playback
  );
  assert.deepEqual(
    selectVisualAudioFeatures(
      {
        audioFeatures: microphone,
        microphoneAudioFeatures: microphone,
        playbackAudioFeatures: playback,
      },
      'both'
    ),
    { rms: 0.5, lowEnergy: 0.5, beatDetected: false, melBands: [-4, -4] }
  );
});

test('BoxScene and MelSpectrogramScene accept playback audio source configuration', () => {
  const box = new BoxScene({ audioSource: 'playback', showBackground: 0.4 });
  box.configure({ audioSource: 'both', showBackground: 0.7 });

  const mel = new MelSpectrogramScene({ audioSource: 'playback', showBackground: 0.25 });
  mel.configure({ audioSource: 'both', showBackground: 0.5 });
});

test('BoxScene keeps fractional backgrounds renderer-alpha transparent', () => {
  const source = BoxScene.toString();
  assert.doesNotMatch(source, /showBackground\s*>\s*0[\s\S]*new THREE\.Color/);
});

test('FctTrackScene keeps foreground rendering when hiding the background', () => {
  const source = FctTrackScene.toString();
  assert.doesNotMatch(source, /colorMask\(true,\s*true,\s*true,\s*this\.showBackground\)/);
});

test('BoxScene accepts CSS color configuration', () => {
  const scene = new BoxScene({ color: '#ff3366' });
  assert.equal(scene.id, 'box-scene');
  scene.configure({ color: 'red' });
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
  assert.equal(container.style.background, 'transparent');
  assert.equal(children[0].style.background, 'transparent');

  scene.configure({ palette: 'light' });
  assert.equal(container.style.background, 'transparent');
  assert.equal(children[0].style.background, 'transparent');
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

test('scene registry maps camera payloads to camera scene layer plugin ids', () => {
  assert.equal(sceneIdForType('frontCamera'), 'front-camera-scene');
  assert.equal(sceneIdForType('backCamera'), 'back-camera-scene');
});
