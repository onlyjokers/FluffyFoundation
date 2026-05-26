// Purpose: Guard Manager JSON runtime override behavior for core validation-only nodes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('registerJsonSpecs re-registers specs with manager runtime kinds over core definitions', () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(currentDir, 'json-registration.ts'), 'utf8');

  assert.match(source, /runtimeRecord/);
  assert.match(source, /createDefinition\(spec as NodeSpec & \{ runtime: NodeRuntime \}\)/);
  assert.doesNotMatch(source, /if\s*\(\s*existing\s*\)\s*\{\s*nodeRegistry\.load\(\{\s*overlays:\s*\[spec\]\s*\}\)/);
});

test('display-related manager JSON specs carry explicit routing metadata', () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const displayText = JSON.parse(readFileSync(join(currentDir, '..', 'proc-display-text.json'), 'utf8')) as {
    metadata?: { platformTargets?: string[]; compatibility?: Array<{ target?: string }> };
  };
  const screenColor = JSON.parse(readFileSync(join(currentDir, '..', 'proc-screen-color.json'), 'utf8')) as {
    metadata?: { platformTargets?: string[]; compatibility?: Array<{ target?: string }> };
  };
  const showImage = JSON.parse(readFileSync(join(currentDir, '..', 'proc-show-image.json'), 'utf8')) as {
    metadata?: { platformTargets?: string[]; compatibility?: Array<{ target?: string }> };
  };
  const playVideo = JSON.parse(readFileSync(join(currentDir, '..', 'proc-play-video.json'), 'utf8')) as {
    metadata?: { platformTargets?: string[]; compatibility?: Array<{ target?: string }> };
  };
  const visualEffects = JSON.parse(readFileSync(join(currentDir, '..', 'proc-visual-effects.json'), 'utf8')) as {
    metadata?: { platformTargets?: string[]; compatibility?: Array<{ target?: string }> };
  };
  const pushImageUpload = JSON.parse(readFileSync(join(currentDir, '..', 'proc-push-image-upload.json'), 'utf8')) as {
    metadata?: { platformTargets?: string[]; compatibility?: Array<{ target?: string }> };
  };

  assert.equal(displayText.metadata?.platformTargets?.includes('display'), true);
  assert.equal(screenColor.metadata?.platformTargets?.includes('display'), true);
  assert.equal(showImage.metadata?.platformTargets?.includes('display'), true);
  assert.equal(playVideo.metadata?.platformTargets?.includes('display'), true);
  assert.equal(visualEffects.metadata?.platformTargets?.includes('display'), true);
  assert.equal(pushImageUpload.metadata?.platformTargets?.includes('display'), false);
  assert.equal(displayText.metadata?.compatibility?.some((rule) => rule.target === 'display-object'), true);
  assert.equal(screenColor.metadata?.compatibility?.some((rule) => rule.target === 'display-object'), true);
  assert.equal(showImage.metadata?.compatibility?.some((rule) => rule.target === 'display-object'), true);
  assert.equal(playVideo.metadata?.compatibility?.some((rule) => rule.target === 'display-object'), true);
  assert.equal(visualEffects.metadata?.compatibility?.some((rule) => rule.target === 'display-object'), true);
  assert.equal(pushImageUpload.metadata?.compatibility?.some((rule) => rule.target === 'display-object'), false);
});
