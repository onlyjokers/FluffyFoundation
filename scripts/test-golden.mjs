// Purpose: Execute FF-21 golden scenario proof matrix validation.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { buildFf21GoldenSuite } from '../packages/ai-core/dist-ai-core/index.js';

const suite = buildFf21GoldenSuite();
const requiredScenarioIds = [
  'manager-client',
  'root-publish',
  'display-fallback',
  'asset-preload',
  'node-executor-deploy',
  'control-plane-transfer-reclaim',
  'ai-graph-edit',
  'rollback',
  'show-stop',
];

assert.equal(suite.status, 'complete');
assert.deepEqual(
  suite.scenarios.map((scenario) => scenario.id),
  requiredScenarioIds
);
assert.deepEqual(new Set(suite.scenarios.map((scenario) => scenario.releaseLabel)), new Set(['release', 'slow']));

for (const scenario of suite.scenarios) {
  assert.notEqual(scenario.proofType, 'manual');
  assert.equal(scenario.status, 'proven');
  assert.equal(existsSync(scenario.evidencePath), true, `${scenario.id} evidence missing at ${scenario.evidencePath}`);
}

console.log(JSON.stringify(suite, null, 2));
