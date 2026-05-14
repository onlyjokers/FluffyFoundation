// Purpose: verify Manager plugin catalog state and lifecycle actions.
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import test from 'node:test';

import {
  createManagerPluginStore,
  createDefaultManagerPluginCatalog,
} from './manager-plugin-store';

test('manager plugin catalog exposes lifecycle, capability, budget, and compatibility state', () => {
  const store = createManagerPluginStore(createDefaultManagerPluginCatalog());
  const snapshot = get(store);

  const nodeExecutor = snapshot.plugins.find((plugin) => plugin.id === 'node-executor');
  assert.equal(nodeExecutor?.state, 'active');
  assert.equal(nodeExecutor?.compatible, true);
  assert.ok(nodeExecutor?.capabilities.includes('runtime.node-execution'));
  assert.equal(nodeExecutor?.resourceBudget?.cpuMsPerTick, 8);

  const localMedia = snapshot.plugins.find((plugin) => plugin.id === 'local-media');
  assert.equal(localMedia?.state, 'inactive');
  assert.equal(localMedia?.sideEffects.includes('filesystem'), true);

  const incompatible = snapshot.plugins.find((plugin) => plugin.id === 'legacy-visual');
  assert.equal(incompatible?.compatible, false);
  assert.equal(incompatible?.lastError, 'Requires plugin API 0; Manager supports 1.');
});

test('manager plugin lifecycle actions activate, stop, and configure compatible plugins only', () => {
  const store = createManagerPluginStore(createDefaultManagerPluginCatalog());

  const activated = store.activate('local-media');
  assert.equal(activated.ok, true);
  assert.equal(get(store).plugins.find((plugin) => plugin.id === 'local-media')?.state, 'active');

  const configured = store.configure('local-media', { root: 'asset-library' });
  assert.equal(configured.ok, true);
  assert.equal(get(store).plugins.find((plugin) => plugin.id === 'local-media')?.lastConfiguredAtRevision, 2);

  const stopped = store.stop('local-media');
  assert.equal(stopped.ok, true);
  assert.equal(get(store).plugins.find((plugin) => plugin.id === 'local-media')?.state, 'stopped');

  const incompatible = store.activate('legacy-visual');
  assert.equal(incompatible.ok, false);
  assert.equal(incompatible.reason, 'Requires plugin API 0; Manager supports 1.');
  assert.equal(get(store).plugins.find((plugin) => plugin.id === 'legacy-visual')?.state, 'error');
});
