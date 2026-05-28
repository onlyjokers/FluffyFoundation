// Purpose: Regression coverage for manager patch deployment node-type policy.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertPatchDeployableNodeType } from './engine-deployment-policy';

test('patch deployment policy allows FCT track scene chain nodes', () => {
  assert.doesNotThrow(() => assertPatchDeployableNodeType('scene-fct-track'));
});

test('patch deployment policy allows variable nodes as local patch state', () => {
  assert.doesNotThrow(() => assertPatchDeployableNodeType('set-boolean-variable'));
  assert.doesNotThrow(() => assertPatchDeployableNodeType('get-boolean-variable'));
  assert.doesNotThrow(() => assertPatchDeployableNodeType('independent-variable-name'));
  assert.doesNotThrow(() => assertPatchDeployableNodeType('boolean-variable'));
  assert.doesNotThrow(() => assertPatchDeployableNodeType('number-variable'));
  assert.doesNotThrow(() => assertPatchDeployableNodeType('string-variable'));
});

test('patch deployment policy allows pulse conversion nodes as local patch logic', () => {
  assert.doesNotThrow(() => assertPatchDeployableNodeType('boolean-to-pulse'));
  assert.doesNotThrow(() => assertPatchDeployableNodeType('pulse-to-boolean'));
});

test('patch deployment policy allows ClientUI recording and STT nodes', () => {
  assert.doesNotThrow(() => assertPatchDeployableNodeType('record-sound-button'));
  assert.doesNotThrow(() => assertPatchDeployableNodeType('speech-to-text'));
});

test('patch deployment policy allows Display Text command nodes', () => {
  assert.doesNotThrow(() => assertPatchDeployableNodeType('proc-display-text'));
});

test('patch deployment policy allows group gates as runtime group controls', () => {
  assert.doesNotThrow(() => assertPatchDeployableNodeType('group-gate'));
});

test('patch deployment policy allows AI Note documentation nodes', () => {
  assert.doesNotThrow(() => assertPatchDeployableNodeType('ai-note'));
});

test('patch deployment policy rejects group proxy canvas interface nodes', () => {
  assert.throws(
    () => assertPatchDeployableNodeType('group-proxy'),
    /Patch contains non-deployable node type: group-proxy/
  );
});

test('patch deployment policy rejects the legacy Aliyun TTS audio source node', () => {
  assert.throws(
    () => assertPatchDeployableNodeType('aliyun-tts'),
    /Patch contains non-deployable node type: aliyun-tts/
  );
});

test('patch deployment policy rejects legacy Static Video Player', () => {
  assert.throws(
    () => assertPatchDeployableNodeType('video-out'),
    /Patch contains non-deployable node type: video-out/
  );
});

test('patch deployment policy rejects legacy Effect Layer Player', () => {
  assert.throws(
    () => assertPatchDeployableNodeType('effect-out'),
    /Patch contains non-deployable node type: effect-out/
  );
});
