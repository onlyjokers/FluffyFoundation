/**
 * Purpose: Static regression tests that Manager is the single product control surface.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = process.cwd();

function readRepoFile(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

test('manager route does not expose Root navigation or published-group-only console', () => {
  const page = readRepoFile('apps/manager/src/routes/+page.svelte');

  assert.equal(page.includes('/manager/root'), false);
  assert.equal(page.includes('PublishedGroupControls'), false);
  assert.equal(page.includes('Fluffy Root'), false);
});

test('manager route reuses the server URL saved during login before connecting', () => {
  const page = readRepoFile('apps/manager/src/routes/+page.svelte');

  assert.match(page, /shugu-server-url/);
  assert.match(page, /serverUrl\s*=\s*savedServerUrl/);
});

test('root product route files are retired', () => {
  assert.equal(existsSync(join(root, 'apps/manager/src/routes/root/+page.svelte')), false);
  assert.equal(existsSync(join(root, 'apps/manager/src/routes/root/RootWorkspace.svelte')), false);
  assert.equal(existsSync(join(root, 'apps/manager/src/routes/root/RootConnectPanel.svelte')), false);
});

test('root-only authoring and published-group-only Manager files are retired', () => {
  assert.equal(existsSync(join(root, 'apps/manager/src/lib/stores/root-authoring.ts')), false);
  assert.equal(existsSync(join(root, 'apps/manager/src/lib/components/PublishedGroupControls.svelte')), false);
});
