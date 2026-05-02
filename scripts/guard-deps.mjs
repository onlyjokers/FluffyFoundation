/**
 * Purpose: Guard against disallowed cross-layer imports and deep-imports in the monorepo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const ROOT_DIRS = ['apps', 'packages', 'tests'];
const SOURCE_EXTS = new Set(['.ts', '.js', '.mjs', '.cjs', '.svelte']);

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.svelte-kit',
  '.turbo',
  'dist',
  'dist-out',
  'dist-node-core',
  'build',
  'coverage',
  'out',
]);

const WORKSPACE_ROOTS = ['apps', 'packages'];

const PACKAGE_LANES = {
  protocol: 'Protocol',
  'node-core': 'Runtime',
  'sdk-client': 'SDK',
  'sdk-manager': 'SDK',
  'ai-core': 'AI',
  'plugin-core': 'Plugin',
  'audio-plugins': 'Plugin',
  'visual-plugins': 'Plugin',
  'visual-effects': 'Plugin',
  'multimedia-core': 'Runtime',
  'ui-kit': 'UI',
};

const APP_LANES = {
  client: 'Client',
  display: 'Display',
  manager: 'Manager',
  server: 'Server',
};

const PATH_LANES = [
  {
    name: 'Root',
    match: (relative) =>
      relative.startsWith('apps/manager/src/lib/components/nodes/') ||
      relative.startsWith('apps/manager/src/lib/nodes/') ||
      relative.startsWith('apps/manager/src/lib/project/'),
    allowPackages: new Set(['node-core', 'protocol', 'sdk-manager', 'ui-kit']),
    note: 'Root authoring may consume contracts, manager SDK, and UI only.',
  },
  {
    name: 'Manager',
    match: (relative) =>
      relative.startsWith('apps/manager/src/lib/stores/') ||
      relative.startsWith('apps/manager/src/lib/display/') ||
      relative.startsWith('apps/manager/src/routes/'),
    allowPackages: new Set(['node-core', 'protocol', 'sdk-manager', 'ui-kit']),
    note: 'Manager controls published state through SDK/contracts.',
  },
  {
    name: 'Display',
    match: (relative) => relative.startsWith('apps/display/src/'),
    allowPackages: new Set(['multimedia-core', 'node-core', 'protocol', 'sdk-client', 'ui-kit']),
    note: 'Display consumes runtime media, client SDK, and contracts.',
  },
  {
    name: 'Client',
    match: (relative) => relative.startsWith('apps/client/src/'),
    allowPackages: new Set([
      'audio-plugins',
      'multimedia-core',
      'node-core',
      'protocol',
      'sdk-client',
      'ui-kit',
      'visual-effects',
      'visual-plugins',
    ]),
    note: 'Client consumes SDK, runtime, plugin, and UI lanes.',
  },
  {
    name: 'Server',
    match: (relative) => relative.startsWith('apps/server/src/'),
    allowPackages: new Set(['protocol']),
    note: 'Server authority may depend on protocol only among @shugu packages.',
  },
  {
    name: 'SDK',
    match: (relative) =>
      relative.startsWith('packages/sdk-client/src/') || relative.startsWith('packages/sdk-manager/src/'),
    allowPackages: new Set(['ai-core', 'multimedia-core', 'node-core', 'protocol']),
    note: 'SDKs bridge app runtimes to stable contracts and runtime helpers.',
  },
  {
    name: 'AI',
    match: (relative) => relative.startsWith('packages/ai-core/src/'),
    allowPackages: new Set(),
    note: 'AI core is an isolated interface package; adapters depend on it, not the reverse.',
  },
  {
    name: 'Plugin',
    match: (relative) =>
      relative.startsWith('packages/audio-plugins/src/') ||
      relative.startsWith('packages/visual-plugins/src/') ||
      relative.startsWith('packages/visual-effects/src/'),
    allowPackages: new Set(['protocol']),
    note: 'Plugin packages may consume protocol contracts but not app or SDK lanes.',
  },
  {
    name: 'Persistence',
    match: (relative) =>
      relative.includes('/asset') ||
      relative.includes('/local-media') ||
      relative.includes('/indexeddb') ||
      relative.includes('/projectManager') ||
      relative.includes('/nodeGraphUiState') ||
      relative.includes('/uiState'),
    allowPackages: new Set(['multimedia-core', 'node-core', 'protocol', 'sdk-manager', 'ui-kit']),
    note: 'Persistence code must stay below app orchestration and above protocol/runtime contracts.',
  },
  {
    name: 'Topology',
    match: (relative) =>
      relative.includes('/graph-state/') ||
      relative.includes('/node-canvas/') ||
      relative.includes('/nodes/') ||
      relative.includes('/message-router/') ||
      relative.includes('/client-registry/'),
    allowPackages: new Set(['node-core', 'protocol', 'sdk-client', 'sdk-manager', 'ui-kit']),
    note: 'Topology code may use contracts and SDK edges, never app implementation imports.',
  },
];

const DISALLOWED_RELATIVE_LANES = [
  {
    from: 'packages/',
    to: 'apps/',
    message: 'Packages must not import app implementation files.',
  },
  {
    from: 'apps/server/src/',
    to: 'apps/manager/src/',
    message: 'Server authority must not import Manager UI implementation.',
  },
  {
    from: 'apps/server/src/',
    to: 'apps/client/src/',
    message: 'Server authority must not import Client UI/runtime implementation.',
  },
  {
    from: 'apps/server/src/',
    to: 'apps/display/src/',
    message: 'Server authority must not import Display UI/runtime implementation.',
  },
  {
    from: 'packages/ai-core/src/',
    to: 'packages/sdk-client/src/',
    message: 'AI core must not depend on SDK/client runtime implementation.',
  },
  {
    from: 'packages/ai-core/src/',
    to: 'packages/sdk-manager/src/',
    message: 'AI core must not depend on SDK/manager runtime implementation.',
  },
  {
    from: 'packages/protocol/src/',
    to: 'packages/',
    message: 'Protocol must not import higher-level packages.',
  },
];

const IMPORT_RE = /\b(?:import|export)\s+(?:type\s+)?(?:[\w*\s{},]+\s+from\s+)?["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const REQUIRE_RE = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

function shouldSkipDir(name) {
  if (IGNORED_DIRS.has(name)) return true;
  if (name.startsWith('dist')) return true;
  if (name.startsWith('.')) return true;
  return false;
}

function collectFiles(rootDir) {
  const files = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipDir(entry.name)) continue;
      files.push(...collectFiles(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (SOURCE_EXTS.has(ext)) files.push(fullPath);
    }
  }
  return files;
}

function parseExportSubpaths(exportsField) {
  const subpaths = new Set();
  if (!exportsField) return subpaths;
  if (typeof exportsField === 'string') {
    subpaths.add('');
    return subpaths;
  }
  if (typeof exportsField === 'object') {
    for (const key of Object.keys(exportsField)) {
      if (key === '.') {
        subpaths.add('');
      } else if (key.startsWith('./')) {
        subpaths.add(key.slice(2));
      }
    }
  }
  return subpaths;
}

function loadPackageExports() {
  const packagesDir = path.join(repoRoot, 'packages');
  const packageDirs = fs.readdirSync(packagesDir, { withFileTypes: true });
  const allowedSubpathsByPackage = new Map();

  for (const entry of packageDirs) {
    if (!entry.isDirectory()) continue;
    const pkgDir = path.join(packagesDir, entry.name);
    const pkgJsonPath = path.join(pkgDir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) continue;
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    const pkgName = pkgJson?.name;
    if (!pkgName || !pkgName.startsWith('@shugu/')) continue;
    const shortName = pkgName.replace('@shugu/', '');
    const allowed = parseExportSubpaths(pkgJson.exports);
    allowedSubpathsByPackage.set(shortName, allowed);
  }

  return allowedSubpathsByPackage;
}

function findWorkspacePackageJsons() {
  const packageJsons = [];
  for (const rootName of WORKSPACE_ROOTS) {
    const rootPath = path.join(repoRoot, rootName);
    if (!fs.existsSync(rootPath)) continue;
    const entries = fs.readdirSync(rootPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pkgJsonPath = path.join(rootPath, entry.name, 'package.json');
      if (fs.existsSync(pkgJsonPath)) packageJsons.push(pkgJsonPath);
    }
  }
  return packageJsons;
}

function loadDeclaredWorkspaceDeps() {
  const depsByOwner = new Map();
  for (const pkgJsonPath of findWorkspacePackageJsons()) {
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    const owner = getOwnerInfo(path.join(path.dirname(pkgJsonPath), 'src', 'index.ts'));
    const declared = new Set();
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const deps = pkgJson[section] ?? {};
      for (const depName of Object.keys(deps)) {
        if (depName.startsWith('@shugu/')) declared.add(depName.replace('@shugu/', ''));
      }
    }
    depsByOwner.set(`${owner.kind}:${owner.name}`, declared);
  }
  return depsByOwner;
}

function getOwnerInfo(filePath) {
  const relative = path.relative(repoRoot, filePath);
  const parts = relative.split(path.sep);
  if (parts[0] === 'apps' && parts.length > 1) {
    return { kind: 'app', name: parts[1] };
  }
  if (parts[0] === 'packages' && parts.length > 1) {
    return { kind: 'package', name: parts[1] };
  }
  if (parts[0] === 'tests') {
    return { kind: 'test', name: 'tests' };
  }
  return { kind: 'other', name: '' };
}

function parseShuguSpecifier(specifier) {
  if (!specifier.startsWith('@shugu/')) return null;
  const withoutScope = specifier.slice('@shugu/'.length);
  const [pkg, ...rest] = withoutScope.split('/');
  const subpath = rest.join('/');
  return { pkg, subpath };
}

function resolveRelativeSpecifier(filePath, specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('/')) return null;
  const base = specifier.startsWith('/') ? repoRoot : path.dirname(filePath);
  const rawTarget = path.resolve(base, specifier);
  const candidates = [
    rawTarget,
    ...[...SOURCE_EXTS].map((ext) => `${rawTarget}${ext}`),
    ...[...SOURCE_EXTS].map((ext) => path.join(rawTarget, `index${ext}`)),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  return found ? path.relative(repoRoot, found).split(path.sep).join('/') : path.relative(repoRoot, rawTarget).split(path.sep).join('/');
}

function getLineAndColumn(content, index) {
  let line = 1;
  let column = 1;
  for (let i = 0; i < index; i += 1) {
    if (content[i] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function collectSpecifiers(content) {
  const specifiers = [];
  const regexes = [IMPORT_RE, DYNAMIC_IMPORT_RE, REQUIRE_RE];
  for (const regex of regexes) {
    let match;
    while ((match = regex.exec(content))) {
      specifiers.push({ specifier: match[1], index: match.index });
    }
  }
  return specifiers;
}

function isExternalSpecifier(specifier) {
  return (
    specifier.startsWith('http://') ||
    specifier.startsWith('https://') ||
    specifier.startsWith('data:')
  );
}

function relativePath(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function getPathLanes(relative) {
  return PATH_LANES.filter((lane) => lane.match(relative));
}

function pushError(errors, filePath, content, index, message) {
  const { line, column } = getLineAndColumn(content, index);
  errors.push({ filePath, line, column, message });
}

function run() {
  const allowedSubpathsByPackage = loadPackageExports();
  const declaredDepsByOwner = loadDeclaredWorkspaceDeps();
  const targets = ROOT_DIRS.map((dir) => path.join(repoRoot, dir)).filter((dir) => fs.existsSync(dir));
  const files = targets.flatMap((dir) => collectFiles(dir));

  const errors = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    const owner = getOwnerInfo(filePath);
    const relative = relativePath(filePath);
    const ownerKey = `${owner.kind}:${owner.name}`;
    const declaredDeps = declaredDepsByOwner.get(ownerKey) ?? new Set();
    const pathLanes = getPathLanes(relative);
    const specifiers = collectSpecifiers(content);

    for (const { specifier, index } of specifiers) {
      if (!specifier) continue;
      if (isExternalSpecifier(specifier)) continue;

      const relativeTarget = resolveRelativeSpecifier(filePath, specifier);
      if (relativeTarget) {
        for (const rule of DISALLOWED_RELATIVE_LANES) {
          if (relativeTarget.startsWith(rule.from)) continue;
          if (relative.startsWith(rule.from) && relativeTarget.startsWith(rule.to)) {
            pushError(errors, filePath, content, index, `${rule.message} (${relative} -> ${relativeTarget})`);
          }
        }
        continue;
      }

      const shugu = parseShuguSpecifier(specifier);
      if (!shugu) continue;

      const { pkg, subpath } = shugu;
      const allowedSubpaths = allowedSubpathsByPackage.get(pkg);
      const normalizedSubpath = subpath ?? '';

      if (normalizedSubpath && allowedSubpaths && !allowedSubpaths.has(normalizedSubpath)) {
        pushError(
          errors,
          filePath,
          content,
          index,
          `Deep import not allowed: ${specifier} (allowed: ${[...allowedSubpaths].join(', ') || '[root only]'})`,
        );
        continue;
      }

      if (owner.kind === 'package' && pkg !== owner.name && !declaredDeps.has(pkg)) {
        pushError(errors, filePath, content, index, `Undeclared workspace dependency: ${owner.name} -> ${pkg}`);
        continue;
      }

      for (const lane of pathLanes) {
        if (owner.kind === 'package' && pkg === owner.name) continue;
        if (!lane.allowPackages.has(pkg)) {
          pushError(errors, filePath, content, index, `Disallowed ${lane.name} lane dependency: ${pkg}. ${lane.note}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error('\n[deps-guard] violations found:');
    for (const error of errors) {
      const relativePath = path.relative(repoRoot, error.filePath);
      console.error(`- ${relativePath}:${error.line}:${error.column} ${error.message}`);
    }
    console.error(`\n[deps-guard] total: ${errors.length} issue(s)`);
    process.exitCode = 1;
    return;
  }

  console.log(`[deps-guard] ok (${files.length} files scanned)`);
}

run();
