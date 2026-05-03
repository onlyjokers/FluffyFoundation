// Purpose: FF-09 guard that fails when touched Canvas UI code directly mutates graph semantics.

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const resultPath = join(here, 'ui-semantic-mutation-guard-result.json');

const files = [
  'apps/manager/src/lib/components/nodes/NodeCanvas.svelte',
  'apps/manager/src/lib/components/nodes/node-canvas/adapters/semantic-command-adapter.ts',
];

const violations = [];
const directMutators = [
  'nodeEngine.addNode(',
  'nodeEngine.addConnection(',
];

for (const rel of files) {
  const text = readFileSync(join(root, rel), 'utf8');
  const lines = text.split('\n');
  let insideCommandApplyBridge = false;
  lines.forEach((line, idx) => {
    if (line.includes('const applySemanticCommandToEngine')) insideCommandApplyBridge = true;
    if (line.includes('const canvasCommands')) insideCommandApplyBridge = false;
    if (line.includes('onCommand: (command)')) insideCommandApplyBridge = true;
    if (line.includes('onError: (message)')) insideCommandApplyBridge = false;

    for (const mutator of directMutators) {
      if (!line.includes(mutator)) continue;
      if (insideCommandApplyBridge) continue;
      violations.push({ file: rel, line: idx + 1, mutator, source: line.trim() });
    }
  });
}

const result = {
  ok: violations.length === 0,
  checkedFiles: files,
  scopedGestureMutators: directMutators,
  allowedBridge: 'NodeCanvas.applySemanticCommandToEngine',
  violations,
};

writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
assert.equal(violations.length, 0, `Direct UI semantic mutation found: ${JSON.stringify(violations)}`);
console.log(`FF-09 UI semantic mutation guard wrote ${resultPath}`);
