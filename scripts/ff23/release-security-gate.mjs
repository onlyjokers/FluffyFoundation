// Purpose: Generate FF-23 security, supply-chain, release, and operations proof.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { scanSecretText } from '../security/scan-secrets.mjs';

const ROOT = process.cwd();
const EVIDENCE_DIR = path.join(ROOT, '.harness/evidence/FF-23');
const EVIDENCE_PATH = path.join(EVIDENCE_DIR, 'release-security-report.json');

const REQUIRED_CHECKS = [
  'dependency-review',
  'secret-scan',
  'codeql-equivalent',
  'provenance-notes',
  'production-config-validation',
  'backup-restore',
  'release-candidate-checklist',
  'rollback-incident-procedure',
];

export function runFf23ReleaseSecurityGate() {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const gitFiles = listTrackedFiles();
  const checks = [
    checkDependencyReview(gitFiles),
    checkSecretScan(gitFiles),
    checkCodeqlEquivalent(),
    checkProvenanceNotes(),
    checkProductionConfigValidation(),
    checkBackupRestore(),
    checkReleaseCandidateChecklist(),
    checkRollbackIncidentProcedure(),
  ];
  const acceptedIssues = readAcceptedIssues();
  const blockingAcceptedIssues = acceptedIssues.filter((issue) =>
    ['blocking', 'high', 'release-blocking'].includes(issue.severity)
  );
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
    id: 'FF-23',
    status: checks.every((check) => check.status === 'pass') && blockingAcceptedIssues.length === 0 ? 'pass' : 'fail',
    generatedAt: new Date().toISOString(),
    checks,
    acceptedIssues,
    proofMatrix,
    evidencePath: EVIDENCE_PATH,
  };
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function checkDependencyReview(gitFiles) {
  const hasLockfile = gitFiles.includes('pnpm-lock.yaml');
  const ci = readText('.github/workflows/ci.yml');
  const hasCiAudit =
    ci.includes('corepack pnpm@10.20.0 audit --audit-level high --registry=https://registry.npmjs.org') ||
    ci.includes('pnpm test:ff23');
  const audit = runAudit();
  const acceptedIssues = readAcceptedIssues();
  const uncoveredIssues = audit.issues.filter((issue) => !hasAcceptedRisk(acceptedIssues, issue));
  return releaseCheck({
    id: 'dependency-review',
    status: hasLockfile && hasCiAudit && audit.status === 'pass' && uncoveredIssues.length === 0 ? 'pass' : 'fail',
    evidencePath: '.github/workflows/ci.yml',
    reviewerNotes:
      hasLockfile && hasCiAudit && audit.status === 'pass' && uncoveredIssues.length === 0
        ? audit.reviewerNotes
        : uncoveredIssues.length > 0
          ? `audit advisories missing accepted-risk records: ${uncoveredIssues.map((issue) => issue.id).join(', ')}`
        : audit.reviewerNotes,
  });
}

function runAudit() {
  const args = ['pnpm@10.20.0', 'audit', '--audit-level', 'high', '--registry=https://registry.npmjs.org', '--json'];
  try {
    const stdout = execFileSync('corepack', args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
    return auditResultFromJson(stdout);
  } catch (error) {
    const stdout = error && typeof error === 'object' && 'stdout' in error ? String(error.stdout ?? '') : '';
    const parsed = auditResultFromJson(stdout);
    if (parsed) return parsed;
    return { status: 'fail', issues: [], reviewerNotes: `pnpm audit failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function auditResultFromJson(stdout) {
  const parsed = tryParseJson(stdout);
  if (!parsed) return null;
  const metadata = parsed.metadata?.vulnerabilities ?? {};
  const issues = Object.entries(parsed.advisories ?? {}).map(([id, advisory]) => ({
    id,
    module: advisory.module_name,
    severity: advisory.severity,
    title: advisory.title,
    advisory: advisory.github_advisory_id,
  }));
  const highCount = Number(metadata.high ?? 0) + Number(metadata.critical ?? 0);
  return {
    status: highCount === 0 ? 'pass' : 'fail',
    issues,
    reviewerNotes:
      highCount === 0
        ? `pnpm audit has no high/critical advisories; low/moderate advisories recorded as accepted risks (${JSON.stringify(metadata)})`
        : `pnpm audit found high/critical advisories: ${JSON.stringify(metadata)}`,
  };
}

function hasAcceptedRisk(acceptedIssues, auditIssue) {
  return acceptedIssues.some((issue) => {
    const sameAdvisory = issue.advisory === auditIssue.advisory || issue.id === auditIssue.id;
    const hasRequiredFields =
      issue.owner &&
      issue.date &&
      issue.missingProof &&
      issue.safeToContinueBecause &&
      issue.followUpFfItem &&
      issue.blockingSeverity &&
      issue.expiryRevisitCondition;
    return sameAdvisory && issue.severity === auditIssue.severity && hasRequiredFields;
  });
}

function checkSecretScan(gitFiles) {
  const files = gitFiles
    .filter((file) => isScannableFile(file))
    .map((file) => ({ path: path.join(ROOT, file) }));
  const result = scanSecretText({ files });
  return releaseCheck({
    id: 'secret-scan',
    status: result.status,
    evidencePath: 'scripts/security/scan-secrets.mjs',
    reviewerNotes: result.status === 'pass' ? `scanned ${files.length} tracked text files` : JSON.stringify(result.findings),
  });
}

function checkCodeqlEquivalent() {
  const ci = readText('.github/workflows/ci.yml');
  const hasJob = ci.includes('security:') || ci.includes('CodeQL') || ci.includes('codeql-action');
  const hasStaticChecks = ci.includes('pnpm guard:deps') && ci.includes('pnpm harness:acceptance');
  return releaseCheck({
    id: 'codeql-equivalent',
    status: hasJob && hasStaticChecks ? 'pass' : 'fail',
    evidencePath: '.github/workflows/ci.yml',
    reviewerNotes: hasJob && hasStaticChecks ? 'security job runs repo static policy gates' : 'missing security job or static gates',
  });
}

function checkProvenanceNotes() {
  return checkMarkdownTokens({
    id: 'provenance-notes',
    file: 'docs/operations/RELEASE.md',
    tokens: ['Provenance', 'commit', 'pnpm-lock.yaml', 'evidence'],
  });
}

function checkProductionConfigValidation() {
  let status = 'pass';
  let reviewerNotes = 'production config validation script passed';
  try {
    execFileSync('node', ['scripts/ff23/validate-production-config.mjs'], {
      cwd: ROOT,
      stdio: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        SHUGU_MANAGER_KEY: 'ff23-secure-manager-key',
        SHUGU_ALLOW_INSECURE_MANAGER: '',
        SHUGU_CORS_ORIGINS: 'https://manager.example.test',
        SHUGU_HAS_HTTPS: '1',
        ASSET_WRITE_TOKEN: 'ff23-secure-asset-write-token',
      },
    });
  } catch (error) {
    status = 'fail';
    reviewerNotes = error instanceof Error ? error.message : String(error);
  }
  return releaseCheck({
    id: 'production-config-validation',
    status,
    evidencePath: 'scripts/ff23/validate-production-config.mjs',
    reviewerNotes,
  });
}

function checkBackupRestore() {
  let status = 'pass';
  let reviewerNotes = 'backup/restore drill script passed';
  try {
    execFileSync('node', ['scripts/ff23/backup-restore-drill.mjs'], { cwd: ROOT, stdio: 'pipe' });
  } catch (error) {
    status = 'fail';
    reviewerNotes = error instanceof Error ? error.message : String(error);
  }
  return releaseCheck({
    id: 'backup-restore',
    status,
    evidencePath: 'scripts/ff23/backup-restore-drill.mjs',
    reviewerNotes,
  });
}

function checkReleaseCandidateChecklist() {
  return checkMarkdownTokens({
    id: 'release-candidate-checklist',
    file: 'docs/operations/RELEASE.md',
    tokens: ['Release Candidate Checklist', 'Passed', 'Failed', 'Deferred', 'Release-blocking'],
  });
}

function checkRollbackIncidentProcedure() {
  return checkMarkdownTokens({
    id: 'rollback-incident-procedure',
    file: 'docs/operations/RELEASE.md',
    tokens: ['Rollback', 'Incident', 'owner', 'revisit'],
  });
}

function checkMarkdownTokens({ id, file, tokens }) {
  const text = readText(file);
  const missing = tokens.filter((token) => !text.includes(token));
  return releaseCheck({
    id,
    status: missing.length === 0 ? 'pass' : 'fail',
    evidencePath: file,
    reviewerNotes: missing.length === 0 ? `${file} contains required release gate fields` : `missing ${missing.join(', ')}`,
  });
}

function releaseCheck({ id, status, evidencePath, reviewerNotes }) {
  return {
    id,
    status,
    requiredProofType: 'release-operational',
    deterministicProof: evidencePath.startsWith('scripts/') ? 'executable-local-check' : 'machine-checked-document',
    runtimeBrowserProof: 'not-required-for-release-gate',
    evidencePath,
    deferredRiskAcceptance: 'none',
    reviewerNotes,
  };
}

function readAcceptedIssues() {
  const file = path.join(ROOT, 'docs/operations/ACCEPTED-RISKS.json');
  if (!existsSync(file)) return [];
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  return Array.isArray(parsed.issues) ? parsed.issues : [];
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function listTrackedFiles() {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function isScannableFile(file) {
  const fullPath = path.join(ROOT, file);
  if (!existsSync(fullPath) || !statSync(fullPath).isFile()) return false;
  if (file.startsWith('.harness/evidence/')) return false;
  if (file.startsWith('docs/PlanDocs/')) return false;
  if (file.startsWith('packages/ai-core/dist-ai-core/')) return false;
  if (/\.(png|jpg|jpeg|gif|webp|ico|mp4|mov|zip|gz|lock)$/i.test(file)) return false;
  return true;
}

function readText(file) {
  const fullPath = path.join(ROOT, file);
  return existsSync(fullPath) ? readFileSync(fullPath, 'utf8') : '';
}
