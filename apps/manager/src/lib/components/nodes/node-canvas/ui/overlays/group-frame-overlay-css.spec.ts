/**
 * Purpose: Regression tests for group frame overlay layout CSS.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const specDir = dirname(fileURLToPath(import.meta.url));
const layoutSourcePath = resolve(specDir, '../NodeCanvasLayout.svelte');
const overlaySourcePath = resolve(specDir, 'GroupFramesOverlay.svelte');

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

test('expanded custom node frames expose Edit Group while Edit node is active', () => {
  const source = readOverlaySource();

  assert.match(source, /isCustomNodeEditing[\s\S]*?Edit Group/);
});
