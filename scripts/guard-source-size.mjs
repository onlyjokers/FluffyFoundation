/**
 * Purpose: Keep production source files from growing back into god objects.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const scanRoots = ['apps', 'packages'];
const sourceExtensions = new Set(['.ts', '.js', '.mjs', '.svelte']);
const ignoredDirectories = new Set([
  '.git',
  '.svelte-kit',
  '.turbo',
  '.vite',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'vite-cache',
]);

const hardLimit = 800;
const warningLimit = 600;

function shouldSkipDirectory(name) {
  if (ignoredDirectories.has(name)) return true;
  if (name.startsWith('.svelte-kit')) return true;
  if (name.startsWith('.vite-cache')) return true;
  if (name.startsWith('build-')) return true;
  if (name.startsWith('dist-')) return true;
  if (name.startsWith('vite-cache')) return true;
  return false;
}

function isProductionSourceFile(filePath) {
  const relative = path.relative(repoRoot, filePath).split(path.sep).join('/');
  const ext = path.extname(filePath);
  if (!sourceExtensions.has(ext)) return false;
  if (relative.endsWith('.spec.ts') || relative.endsWith('.test.ts')) return false;
  return /^apps\/[^/]+\/src\//.test(relative) || /^packages\/[^/]+\/src\//.test(relative);
}

function collectFiles(directory) {
  const files = [];
  if (!fs.existsSync(directory)) return files;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(entry.name)) files.push(...collectFiles(fullPath));
    } else if (entry.isFile() && isProductionSourceFile(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.length === 0) return 0;
  return content.split('\n').length;
}

const files = scanRoots.flatMap((root) => collectFiles(path.join(repoRoot, root)));
const oversized = [];
const warnings = [];

for (const file of files) {
  const lines = countLines(file);
  const relative = path.relative(repoRoot, file).split(path.sep).join('/');
  if (lines >= hardLimit) {
    oversized.push({ relative, lines });
  } else if (lines > warningLimit) {
    warnings.push({ relative, lines });
  }
}

warnings.sort((a, b) => b.lines - a.lines);
oversized.sort((a, b) => b.lines - a.lines);

if (warnings.length > 0) {
  console.warn(`[guard:source-size] ${warnings.length} production source file(s) exceed ${warningLimit} lines:`);
  for (const item of warnings) console.warn(`- ${item.relative}: ${item.lines}`);
}

if (oversized.length > 0) {
  console.error(`\n[guard:source-size] ${oversized.length} production source file(s) are at or above ${hardLimit} lines:`);
  for (const item of oversized) console.error(`- ${item.relative}: ${item.lines}`);
  process.exit(1);
}

console.log(`[guard:source-size] no production source files are at or above ${hardLimit} lines`);
