// Purpose: Verify Manager opens Display through a stable SvelteKit route.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildDefaultDisplayUrl } from './display-bridge';

test('buildDefaultDisplayUrl uses the canonical trailing-slash Display route in dev', () => {
  const url = buildDefaultDisplayUrl({
    origin: 'https://localhost:5173',
    dev: true,
  });

  assert.equal(url.toString(), 'https://localhost:5175/display/');
});
