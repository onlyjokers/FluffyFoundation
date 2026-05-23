// Purpose: Regression coverage for manager patch deployment node-type policy.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertPatchDeployableNodeType } from './engine-deployment-policy';

test('patch deployment policy allows FCT track scene chain nodes', () => {
  assert.doesNotThrow(() => assertPatchDeployableNodeType('scene-fct-track'));
});

test('patch deployment policy allows Aliyun TTS audio source nodes', () => {
  assert.doesNotThrow(() => assertPatchDeployableNodeType('aliyun-tts'));
});
