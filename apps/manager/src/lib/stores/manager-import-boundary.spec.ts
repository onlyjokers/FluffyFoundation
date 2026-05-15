/**
 * Purpose: Regression tests for Manager store import boundaries.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

const repoRoot = resolve(process.cwd(), '..', '..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

test('Manager startup imports node engine without loading nodes barrel side effects', () => {
  const managerSource = source('apps/manager/src/lib/stores/manager.ts');
  const projectManagerSource = source('apps/manager/src/lib/project/projectManager.ts');

  assert.doesNotMatch(
    managerSource,
    /from\s+['"]\$lib\/nodes['"]/,
    'manager store must not import $lib/nodes barrel because it loads asset-manifest side effects'
  );
  assert.match(managerSource, /from\s+['"]\$lib\/nodes\/engine['"]/);

  assert.doesNotMatch(
    projectManagerSource,
    /from\s+['"]\$lib\/nodes['"]/,
    'project manager is imported during manager startup and must not load $lib/nodes barrel side effects'
  );
  assert.match(projectManagerSource, /from\s+['"]\$lib\/nodes\/engine['"]/);
});
