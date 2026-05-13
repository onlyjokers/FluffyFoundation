/**
 * Purpose: Prevent generated artifacts and historical run outputs from being tracked by Git.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const trackedFiles = execFileSync('git', ['ls-files'], {
  cwd: repoRoot,
  encoding: 'utf8',
})
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const artifactMatchers = [
  {
    name: 'node_modules',
    matches: (file) => file.split('/').includes('node_modules'),
  },
  {
    name: 'build output',
    matches: (file) => file.split('/').slice(0, -1).some((part) => part === 'dist' || part.startsWith('dist-')),
  },
  {
    name: 'build directory',
    matches: (file) => file.split('/').slice(0, -1).some((part) => part === 'build' || part.startsWith('build-')),
  },
  {
    name: 'SvelteKit output',
    matches: (file) => file.split('/').slice(0, -1).some((part) => part === '.svelte-kit' || part.startsWith('.svelte-kit')),
  },
  {
    name: 'test results',
    matches: (file) => file.split('/').includes('test-results'),
  },
];

const violations = [];

for (const file of trackedFiles) {
  for (const matcher of artifactMatchers) {
    if (matcher.matches(file)) {
      violations.push({ file, kind: matcher.name });
      break;
    }
  }
}

if (violations.length > 0) {
  console.error(`[guard:tracked-artifacts] found ${violations.length} tracked artifact path(s):`);
  for (const violation of violations) {
    console.error(`- ${violation.file} (${violation.kind})`);
  }
  console.error('\nRemove them from the Git index with git rm --cached, keeping local files on disk.');
  process.exit(1);
}

console.log('[guard:tracked-artifacts] no tracked artifact paths found');
