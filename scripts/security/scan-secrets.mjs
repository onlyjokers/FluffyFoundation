// Purpose: FF-23 lightweight secret scanner for release gates.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const DEFAULT_ALLOWED_PATHS = new Set([
  'DEPLOY.md',
  'docs/PlanDocs/0109_RootManagerControlPlane/phase1_regression_playbook.md',
  'docs/PlanDocs/0109_RootManagerControlPlane/plan_progress.md',
  'docs/PlanDocs/0109_RootManagerControlPlane/phase2_3_server_hygiene.md',
  'docs/PlanDocs/1217_ClientRecursiveNodeGroup/Plan_porgress.md',
  'docs/PlanDocs/1218_OneNodeSystem/Plan_porgress.md',
  'docs/PlanDocs/1221_newMultiMediaSystem/Asset_Service_serve.md',
  'docs/PlanDocs/1221_newMultiMediaSystem/plan.md',
  'docs/PlanDocs/1221_newMultiMediaSystem/plan_progress.md',
  'docs/node-executor.md',
  'tools/remotion-skills/skills/remotion/rules/maps.md',
]);

const DEFAULT_ALLOWED_PATTERNS = [
  /^apps\/manager\/src\/routes\/.*\.svelte$/,
  /^apps\/server\/src\/.*\.(ts|spec\.ts)$/,
  /^packages\/ai-core\/(src|test|dist-ai-core)\/.*\.(ts|mjs|js)$/,
  /^scripts\/e2e\/.*\.mjs$/,
  /^scripts\/security\/scan-secrets\.mjs$/,
];

const SECRET_PATTERNS = [
  { id: 'private-key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { id: 'openai-key', pattern: /\bsk-(?:live|proj|test)-[A-Za-z0-9_-]{16,}\b/ },
  { id: 'bearer-token', pattern: /\bBearer\s+[A-Za-z0-9._-]{24,}\b/ },
  {
    id: 'assigned-secret',
    pattern: /\b(?:SECRET|PASSWORD|PRIVATE_KEY|SHUGU_MANAGER_KEY|ASSET_WRITE_TOKEN|ASSET_READ_TOKEN)\s*=\s*['"]?[A-Za-z0-9._/-]{12,}/i,
  },
];

export function scanSecretText(input, options = {}) {
  const allowlist = new Set([...(options.allowedPaths ?? []), ...DEFAULT_ALLOWED_PATHS]);
  const allowedPatterns = [...(options.allowedPatterns ?? []), ...DEFAULT_ALLOWED_PATTERNS];
  const findings = [];

  for (const file of input.files) {
    const rel = normalizePath(relative(ROOT, file.path));
    if (allowlist.has(rel) || allowedPatterns.some((pattern) => pattern.test(rel))) continue;
    const text = file.text ?? readFileSync(file.path, 'utf8');
    for (const rule of SECRET_PATTERNS) {
      if (rule.pattern.test(text)) {
        findings.push({
          file: rel,
          rule: rule.id,
          severity: 'blocking',
        });
      }
    }
  }

  return {
    status: findings.length === 0 ? 'pass' : 'fail',
    findings,
  };
}

function normalizePath(value) {
  return value.split('\\').join('/');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv
    .slice(2)
    .filter((path) => existsSync(path) && statSync(path).isFile())
    .map((path) => ({ path }));
  const result = scanSecretText({ files });
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'pass') process.exit(1);
}
