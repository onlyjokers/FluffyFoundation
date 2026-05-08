// Purpose: Execute FF-24 dogfood, documentation, and launch-readiness validation.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const EVIDENCE_DIR = '.harness/evidence/FF-24';
const REPORT_PATH = path.join(EVIDENCE_DIR, 'launch-readiness-report.json');

const REQUIRED_PRIOR_ITEMS = ['FF-18', 'FF-19', 'FF-20', 'FF-21', 'FF-22', 'FF-23'];
const REQUIRED_OPERATOR_TOPICS = [
  'Root',
  'Manager',
  'Client',
  'Display',
  'AI Operator',
  'rehearsal',
  'show mode',
  'recovery',
  'troubleshooting',
];
const REQUIRED_DEVELOPER_TOPICS = ['nodes', 'plugins', 'connectors', 'registry', 'validation', 'tests', 'AI descriptions'];

const checks = [
  checkDocument('operator-manual', 'docs/operations/OPERATOR-MANUAL.md', REQUIRED_OPERATOR_TOPICS),
  checkDocument('developer-guide', 'docs/operations/DEVELOPER-GUIDE.md', REQUIRED_DEVELOPER_TOPICS),
  checkDogfoodReports(),
  checkGoldenSuite(),
  checkPriorItemsComplete(),
  checkAcceptedRisks(),
  checkLaunchReview(),
  checkLaunchDecisionConsistency(),
];

const proofMatrix = checks.map((check) => ({
  criterion: check.id,
  requiredProofType: check.requiredProofType,
  deterministicProof: check.deterministicProof,
  runtimeBrowserProof: check.runtimeBrowserProof,
  evidencePath: check.evidencePath,
  status: check.status,
  deferredRiskAcceptance: check.deferredRiskAcceptance,
  reviewerNotes: check.reviewerNotes,
}));

const report = {
  id: 'FF-24',
  status: checks.every((check) => check.status === 'pass') ? 'pass' : 'fail',
  generatedAt: new Date().toISOString(),
  checks,
  proofMatrix,
  evidencePath: path.join(ROOT, REPORT_PATH),
};

writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

assert.equal(report.status, 'pass');
assert.equal(proofMatrix.every((row) => row.status === 'pass'), true);

console.log(JSON.stringify(report, null, 2));

function checkDocument(id, file, tokens) {
  const text = readText(file);
  const missing = tokens.filter((token) => !text.toLowerCase().includes(token.toLowerCase()));
  return launchCheck({
    id,
    status: missing.length === 0 ? 'pass' : 'fail',
    requiredProofType: 'implementation',
    deterministicProof: 'machine-checked-document',
    runtimeBrowserProof: 'not-required-for-manual',
    evidencePath: file,
    reviewerNotes: missing.length === 0 ? `${file} covers required topics` : `missing topics: ${missing.join(', ')}`,
  });
}

function checkDogfoodReports() {
  const paths = ['dogfood-session-1.md', 'dogfood-session-2.md'].map((file) => path.join(EVIDENCE_DIR, file));
  const missing = paths.filter((file) => !existsSync(file));
  const invalid = paths.filter((file) => {
    const text = readText(file);
    return !text.includes('Runtime proof: real') || !text.includes('Recovery notes:') || text.includes('synthetic-only');
  });
  return launchCheck({
    id: 'dogfood-rehearsals',
    status: missing.length === 0 && invalid.length === 0 ? 'pass' : 'fail',
    requiredProofType: 'runtime-browser',
    deterministicProof: 'not-sufficient-alone',
    runtimeBrowserProof: 'required',
    evidencePath: paths.join(', '),
    reviewerNotes:
      missing.length === 0 && invalid.length === 0
        ? 'two dogfood reports include real runtime proof and recovery notes'
        : `missing=${missing.join(', ') || 'none'} invalid=${invalid.join(', ') || 'none'}`,
  });
}

function checkGoldenSuite() {
  const reportPath = '.harness/evidence/FF-21/golden-suite.json';
  const outputPath = '.harness/evidence/FF-24/test-golden-output.txt';
  const golden = tryReadJson(reportPath);
  const output = readText(outputPath);
  return launchCheck({
    id: 'release-candidate-golden-suite',
    status: golden?.status === 'complete' && output.includes('"status": "complete"') ? 'pass' : 'fail',
    requiredProofType: 'deterministic',
    deterministicProof: 'full-golden-suite',
    runtimeBrowserProof: 'not-required-for-golden-suite',
    evidencePath: `${reportPath}, ${outputPath}`,
    reviewerNotes:
      golden?.status === 'complete' && output.includes('"status": "complete"')
        ? 'golden suite passed on the FF-24 release-candidate run'
        : 'missing FF-24 release-candidate golden suite output',
  });
}

function checkPriorItemsComplete() {
  const missing = REQUIRED_PRIOR_ITEMS.filter((id) => !existsSync(path.join('.harness/evidence', id, 'summary.md')));
  return launchCheck({
    id: 'prior-ff-items',
    status: missing.length === 0 ? 'pass' : 'fail',
    requiredProofType: 'release-operational',
    deterministicProof: 'evidence-manifest',
    runtimeBrowserProof: 'covered-by-prior-item-evidence',
    evidencePath: REQUIRED_PRIOR_ITEMS.map((id) => `.harness/evidence/${id}/summary.md`).join(', '),
    reviewerNotes: missing.length === 0 ? 'FF-18 through FF-23 evidence summaries exist' : `missing: ${missing.join(', ')}`,
  });
}

function checkAcceptedRisks() {
  const risks = tryReadJson('docs/operations/ACCEPTED-RISKS.json')?.issues ?? [];
  const blockers = risks.filter((issue) => ['blocking', 'high', 'release-blocking'].includes(issue.severity));
  const incomplete = risks.filter(
    (issue) =>
      !issue.owner ||
      !issue.date ||
      !issue.missingProof ||
      !issue.safeToContinueBecause ||
      !issue.followUpFfItem ||
      !issue.blockingSeverity ||
      !issue.expiryRevisitCondition
  );
  return launchCheck({
    id: 'risk-review',
    status: blockers.length === 0 && incomplete.length === 0 ? 'pass' : 'fail',
    requiredProofType: 'release-operational',
    deterministicProof: 'machine-checked-risk-record',
    runtimeBrowserProof: 'not-required-for-risk-record',
    evidencePath: 'docs/operations/ACCEPTED-RISKS.json',
    reviewerNotes:
      blockers.length === 0 && incomplete.length === 0
        ? `${risks.length} accepted risks reviewed; no blocking/high/release-blocking risks`
        : `blockers=${blockers.length} incomplete=${incomplete.length}`,
  });
}

function checkLaunchReview() {
  const file = path.join(EVIDENCE_DIR, 'final-launch-review.md');
  const text = readText(file);
  const hasDecision = text.includes('Final decision:');
  const hasAllowedDecision = text.includes('production ready') || text.includes('blocked, not production ready');
  const required = ['Explicit blockers:', 'Commands run:', 'Dogfood reports:'];
  const missing = required.filter((token) => !text.includes(token));
  if (!hasDecision) missing.push('Final decision:');
  if (!hasAllowedDecision) missing.push('production ready or blocked decision');
  return launchCheck({
    id: 'final-launch-review',
    status: missing.length === 0 ? 'pass' : 'fail',
    requiredProofType: 'release-operational',
    deterministicProof: 'machine-checked-launch-review',
    runtimeBrowserProof: 'required-for-launch-claims',
    evidencePath: file,
    reviewerNotes:
      missing.length === 0
        ? 'final launch review includes decision, blockers, commands, and dogfood paths'
        : `missing ${missing.join(', ')}`,
  });
}

function checkLaunchDecisionConsistency() {
  const files = [
    path.join(EVIDENCE_DIR, 'summary.md'),
    path.join(EVIDENCE_DIR, 'final-launch-review.md'),
    '.harness/status/current-task.md',
    '.harness/status/current-phase.md',
    '.harness/handoffs/2026-05-09-FF-24-launch-readiness.md',
  ];
  const staleBlockedClaims = files.filter((file) => {
    const text = readText(file);
    return text.includes('blocked, not production ready') || text.includes('blocked decision');
  });
  return launchCheck({
    id: 'launch-decision-consistency',
    status: staleBlockedClaims.length === 0 ? 'pass' : 'fail',
    requiredProofType: 'release-operational',
    deterministicProof: 'machine-checked-status-consistency',
    runtimeBrowserProof: 'covered-by-final-launch-review',
    evidencePath: files.join(', '),
    reviewerNotes:
      staleBlockedClaims.length === 0
        ? 'FF-24 summary, final review, status, and handoff use the same production-ready decision'
        : `stale blocked launch decision remains in ${staleBlockedClaims.join(', ')}`,
  });
}

function launchCheck({
  id,
  status,
  requiredProofType,
  deterministicProof,
  runtimeBrowserProof,
  evidencePath,
  reviewerNotes,
}) {
  return {
    id,
    status,
    requiredProofType,
    deterministicProof,
    runtimeBrowserProof,
    evidencePath,
    deferredRiskAcceptance: 'none',
    reviewerNotes,
  };
}

function readText(file) {
  const fullPath = path.join(ROOT, file);
  return existsSync(fullPath) ? readFileSync(fullPath, 'utf8') : '';
}

function tryReadJson(file) {
  try {
    return JSON.parse(readText(file));
  } catch {
    return null;
  }
}
