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
  assert.doesNotThrow(() => assertPatchDeployableNodeType('boolean-variable'));
  assert.doesNotThrow(() => assertPatchDeployableNodeType('number-variable'));
  assert.doesNotThrow(() => assertPatchDeployableNodeType('string-variable'));
});

test('patch deployment policy rejects the legacy Aliyun TTS audio source node', () => {
  assert.throws(
    () => assertPatchDeployableNodeType('aliyun-tts'),
    /Patch contains non-deployable node type: aliyun-tts/
  );
});
