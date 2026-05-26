/**
 * Purpose: Regression tests for group frame overlay layout CSS.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const layoutSourcePath =
  'apps/manager/src/lib/components/nodes/node-canvas/ui/NodeCanvasLayout.svelte';
const overlaySourcePath =
  'apps/manager/src/lib/components/nodes/node-canvas/ui/overlays/GroupFramesOverlay.svelte';

const readLayoutSource = () => readFileSync(layoutSourcePath, 'utf8');
const readOverlaySource = () => readFileSync(overlaySourcePath, 'utf8');

test('group port nodes keep their collapsed socket subtree renderable', () => {
  const source = readLayoutSource();

  assert.doesNotMatch(source, /\.node\.group-port \.ports\)[\s\S]*?display:\s*none\s*!important;/);
  assert.match(source, /\.node\.group-port \.ports\)[\s\S]*?display:\s*block\s*!important;/);
});

test('group frame header reserves space for the native gate socket', () => {
  const source = readOverlaySource();

  assert.match(source, /\.group-frame-title-row\s*\{[\s\S]*?padding-left:\s*32px;/);
});
