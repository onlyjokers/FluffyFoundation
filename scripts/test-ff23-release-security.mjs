// Purpose: Execute FF-23 security, supply-chain, release, and operations validation.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { runFf23ReleaseSecurityGate } from './ff23/release-security-gate.mjs';

const report = await runFf23ReleaseSecurityGate();

const requiredCriteria = new Set([
  'dependency-review',
  'secret-scan',
  'codeql-equivalent',
  'provenance-notes',
  'production-config-validation',
  'backup-restore',
  'release-candidate-checklist',
  'rollback-incident-procedure',
]);

assert.equal(report.id, 'FF-23');
assert.equal(report.status, 'pass');
assert.equal(report.checks.every((check) => check.status === 'pass'), true);
assert.deepEqual(new Set(report.checks.map((check) => check.id)), requiredCriteria);
assert.equal(
  report.acceptedIssues.every((issue) => !['blocking', 'high', 'release-blocking'].includes(issue.severity)),
  true
);
assert.equal(report.proofMatrix.every((row) => row.status === 'pass'), true);
assert.equal(report.proofMatrix.some((row) => row.criterion === 'release-candidate-checklist'), true);
assert.equal(existsSync(report.evidencePath), true);

console.log(JSON.stringify(report, null, 2));
