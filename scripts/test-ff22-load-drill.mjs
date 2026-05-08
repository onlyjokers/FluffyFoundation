// Purpose: Execute FF-22 load and show-mode resilience budget validation.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { runFf22LoadDrill } from './ff22/load-drill-runner.mjs';

const report = await runFf22LoadDrill();

assert.equal(report.status, 'pass');
assert.equal(report.budgets.every((budget) => budget.status === 'pass'), true);
assert.equal(report.drills.every((drill) => drill.status === 'pass'), true);
assert.equal(report.drills.some((drill) => drill.id === 'network-interruption'), true);
assert.equal(report.drills.some((drill) => drill.id === 'display-refresh'), true);
assert.equal(report.drills.some((drill) => drill.id === 'client-reconnect'), true);
assert.equal(report.drills.some((drill) => drill.id === 'root-stop-all'), true);
assert.equal(existsSync(report.evidencePath), true);

console.log(JSON.stringify(report, null, 2));
