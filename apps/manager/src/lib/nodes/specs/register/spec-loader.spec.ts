// Purpose: Guard that Manager JSON specs outside the register folder are loaded.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

test('loadSpecs glob includes top-level manager node specs', () => {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(currentDir, 'spec-loader.ts'), 'utf8');

  assert.match(source, /['"]\.\.\/\*\.json['"]/);
});
