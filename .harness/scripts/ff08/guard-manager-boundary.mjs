#!/usr/bin/env node
/**
 * Purpose: Guard the active classic Manager topology so retired Root routes do not reappear.
 */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const managerRouteRoot = path.join(repoRoot, 'apps/manager/src/routes/manager');
const retiredRootRoute = path.join(repoRoot, 'apps/manager/src/routes/root');
const defaultRoute = path.join(repoRoot, 'apps/manager/src/routes/+page.svelte');
const kitOutRoot = path.join(repoRoot, 'apps/manager/.svelte-kit-manager/output/client');
const kitImmutableRoot = path.join(kitOutRoot, '_app/immutable');
const kitManifestFile = path.join(kitOutRoot, '.vite/manifest.json');

const rootOnlyPatterns = [
  /project\/projectManager/,
  /stores\/root-authoring/,
  /\/manager\/root/,
  /RootWorkspace/,
  /RootConnectPanel/,
  /Fluffy Root/,
];

function listFiles(root, out = []) {
  if (!fs.existsSync(root)) return out;
  const stat = fs.statSync(root);
  if (stat.isFile()) {
    out.push(root);
    return out;
  }
  for (const name of fs.readdirSync(root)) {
    listFiles(path.join(root, name), out);
  }
  return out;
}

function rel(file) {
  return path.relative(repoRoot, file);
}

function checkSourceBoundary() {
  const files = [...listFiles(managerRouteRoot), defaultRoute].filter((file) => fs.existsSync(file));
  const failures = [];
  if (listFiles(retiredRootRoute).length > 0) {
    failures.push(`retired Root route still exists: ${rel(retiredRootRoute)}`);
  }
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of rootOnlyPatterns) {
      if (pattern.test(text)) failures.push(`${rel(file)} matches ${pattern}`);
    }
  }
  return failures;
}

function parseRouteManifest() {
  if (!fs.existsSync(kitManifestFile)) return null;
  return JSON.parse(fs.readFileSync(kitManifestFile, 'utf8'));
}

function collectImportedAssets(manifest, manifestKey, assets = new Set(), seen = new Set()) {
  if (!manifestKey || seen.has(manifestKey)) return assets;
  seen.add(manifestKey);
  const entry = manifest[manifestKey] ?? Object.values(manifest).find((item) => item.file === manifestKey);
  if (!entry) return assets;
  if (entry.file) assets.add(entry.file);
  for (const css of entry.css ?? []) assets.add(css);
  for (const imported of entry.imports ?? []) collectImportedAssets(manifest, imported, assets, seen);
  return assets;
}

function collectManagerRouteAssets(manifest) {
  const assets = new Set();
  const managerEntry = manifest['.svelte-kit-manager/generated/client-optimized/nodes/2.js'];
  if (!managerEntry) return assets;
  collectImportedAssets(manifest, '.svelte-kit-manager/generated/client-optimized/nodes/2.js', assets);
  return assets;
}

function checkBundleBoundary() {
  if (!fs.existsSync(kitImmutableRoot)) {
    return [`missing built manager client bundle at ${rel(kitImmutableRoot)}`];
  }

  const failures = [];
  const manifest = parseRouteManifest();
  if (manifest) {
    for (const key of Object.keys(manifest)) {
      if (/routes\/root|manager\/root|RootWorkspace|RootConnectPanel/.test(key)) {
        failures.push(`retired Root route appears in built manifest: ${key}`);
      }
    }
    const routeAssets = collectManagerRouteAssets(manifest);
    if (routeAssets.size === 0) failures.push('could not identify Manager route assets in built manifest');
  }

  return failures;
}

const sourceFailures = checkSourceBoundary();
const bundleFailures = process.argv.includes('--source-only') ? [] : checkBundleBoundary();
const failures = [...sourceFailures, ...bundleFailures];

if (failures.length > 0) {
  console.error('FF-08 Manager boundary guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('FF-08 Manager boundary guard passed');
