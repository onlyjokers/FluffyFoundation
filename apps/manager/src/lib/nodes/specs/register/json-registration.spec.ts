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
