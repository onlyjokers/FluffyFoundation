/**
 * Purpose: Validate Manager node spec JSON files.
 *
 * - For node types that exist in `@shugu/node-core`, JSON files act as UI overlays only.
 * - For node types that do not exist in `@shugu/node-core`, JSON files are treated as manager-only definitions
 *   and must include `runtime.kind`, `label`, and `category`.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const specsRoot = path.join(repoRoot, 'apps/manager/src/lib/nodes/specs');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
};

function formatPath(filePath) {
  return path.relative(repoRoot, filePath);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

async function listJsonFiles(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listJsonFiles(abs)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.json')) out.push(abs);
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

async function loadNodeCore() {
  try {
    return await import('@shugu/node-core');
  } catch (err) {
    const local = path.join(repoRoot, 'packages/node-core/dist-node-core/index.js');
    try {
      return await import(pathToFileURL(local).href);
    } catch (err2) {
      const message = err?.message ?? String(err);
      const message2 = err2?.message ?? String(err2);
      throw new Error(`Failed to import @shugu/node-core (${message}); and local fallback (${message2})`);
    }
  }
}

function buildCoreRegistry(nodeCore) {
  const { NodeRegistry, registerDefaultNodeDefinitions } = nodeCore;
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    getLatestSensor: () => null,
    getSensorForClientId: () => null,
    executeCommand: () => {},
    executeCommandForClientId: () => {},
  });
  return registry;
}

function mergeMin(baseMin, overlayMin) {
  const ov = isFiniteNumber(overlayMin) ? overlayMin : undefined;
  if (ov === undefined) return baseMin;
  if (baseMin === undefined) return ov;
  return Math.max(baseMin, ov);
}

function mergeMax(baseMax, overlayMax) {
  const ov = isFiniteNumber(overlayMax) ? overlayMax : undefined;
  if (ov === undefined) return baseMax;
  if (baseMax === undefined) return ov;
  return Math.min(baseMax, ov);
}

function collectBasePortsById(ports) {
  const map = new Map();
  for (const port of ports ?? []) map.set(String(port.id), port);
  return map;
}

function collectBaseFieldsByKey(fields) {
  const map = new Map();
  for (const field of fields ?? []) map.set(String(field.key), field);
  return map;
}

async function main() {
  const nodeCore = await loadNodeCore();
  const coreRegistry = buildCoreRegistry(nodeCore);
  const specFiles = await listJsonFiles(specsRoot);

  let warnings = 0;
  let errors = 0;

  const warn = (message) => {
    warnings += 1;
    console.warn(`${colors.yellow}warn${colors.reset} ${message}`);
  };

  const error = (message) => {
    errors += 1;
    console.error(`${colors.red}error${colors.reset} ${message}`);
  };

  const allTypes = new Map();

  for (const filePath of specFiles) {
    let json;
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      json = JSON.parse(raw);
    } catch (err) {
      error(`${formatPath(filePath)}: failed to parse JSON (${err?.message ?? String(err)})`);
      continue;
    }

    if (!isPlainObject(json)) {
      error(`${formatPath(filePath)}: expected an object at top-level`);
      continue;
    }

    const type = typeof json.type === 'string' ? json.type.trim() : '';
    if (!type) {
      error(`${formatPath(filePath)}: missing required field "type" (string)`);
      continue;
    }

    const seen = allTypes.get(type);
    if (seen) {
      error(
        `duplicate node type "${type}" in ${formatPath(seen)} and ${formatPath(filePath)} (only one JSON per type)`
      );
    } else {
      allTypes.set(type, filePath);
    }

    const coreDef = coreRegistry.get(type);

    if (coreDef) {
      // UI overlay-only checks.
      if (json.runtime !== undefined) {
        warn(`${formatPath(filePath)}: runtime is ignored for node-core types ("${type}")`);
      }

      const allowedKeys = new Set([
        '__purpose',
        'type',
        'label',
        'category',
        'metadata',
        'inputs',
        'outputs',
        'configSchema',
        'runtime',
      ]);
      for (const key of Object.keys(json)) {
        if (!allowedKeys.has(key)) {
          warn(`${formatPath(filePath)}: unknown top-level key "${key}" (not applied in overlay)`);
        }
      }

      const baseInputs = collectBasePortsById(coreDef.inputs);
      const baseOutputs = collectBasePortsById(coreDef.outputs);

      const checkPortOverlays = (kind, overlayPorts, basePorts) => {
        if (overlayPorts === undefined) return;
        if (!Array.isArray(overlayPorts)) {
          error(`${formatPath(filePath)}: "${kind}" must be an array when provided`);
          return;
        }

        for (const raw of overlayPorts) {
          if (!isPlainObject(raw)) {
            warn(`${formatPath(filePath)}: "${kind}" overlay item is not an object (ignored)`);
            continue;
          }

          const id = typeof raw.id === 'string' ? raw.id.trim() : '';
          if (!id) {
            warn(`${formatPath(filePath)}: "${kind}" overlay item missing "id" (ignored)`);
            continue;
          }

          const base = basePorts.get(id);
          if (!base) {
            warn(`${formatPath(filePath)}: "${type}" ${kind}.${id} does not exist in node-core (ignored)`);
            continue;
          }

          if (raw.type !== undefined) {
            const overlayType = typeof raw.type === 'string' ? raw.type.trim() : '';
            if (overlayType && overlayType !== String(base.type)) {
              warn(
                `${formatPath(filePath)}: "${type}" ${kind}.${id} type mismatch (overlay: "${overlayType}", core: "${String(
                  base.type
                )}")`
              );
            }
          }

          if (raw.min !== undefined && !isFiniteNumber(raw.min)) {
            warn(`${formatPath(filePath)}: "${type}" ${kind}.${id} min is not a finite number`);
          }
          if (raw.max !== undefined && !isFiniteNumber(raw.max)) {
            warn(`${formatPath(filePath)}: "${type}" ${kind}.${id} max is not a finite number`);
          }
          if (raw.step !== undefined && (!isFiniteNumber(raw.step) || raw.step <= 0)) {
            warn(`${formatPath(filePath)}: "${type}" ${kind}.${id} step must be a finite number > 0`);
          }

          const mergedMin = mergeMin(isFiniteNumber(base.min) ? base.min : undefined, raw.min);
          const mergedMax = mergeMax(isFiniteNumber(base.max) ? base.max : undefined, raw.max);
          if (mergedMin !== undefined && mergedMax !== undefined && mergedMin > mergedMax) {
            warn(
              `${formatPath(filePath)}: "${type}" ${kind}.${id} min/max conflict after intersecting with core (overlay will be ignored)`
            );
          }
        }
      };

      checkPortOverlays('inputs', json.inputs, baseInputs);
      checkPortOverlays('outputs', json.outputs, baseOutputs);

      if (json.configSchema !== undefined) {
        if (!Array.isArray(json.configSchema)) {
          error(`${formatPath(filePath)}: "configSchema" must be an array when provided`);
        } else {
          const baseFields = collectBaseFieldsByKey(coreDef.configSchema);
          for (const raw of json.configSchema) {
            if (!isPlainObject(raw)) {
              warn(`${formatPath(filePath)}: "configSchema" overlay item is not an object (ignored)`);
              continue;
            }
            const key = typeof raw.key === 'string' ? raw.key.trim() : '';
            if (!key) {
              warn(`${formatPath(filePath)}: "configSchema" overlay item missing "key" (ignored)`);
              continue;
            }
            const base = baseFields.get(key);
            if (!base) {
              warn(`${formatPath(filePath)}: "${type}" configSchema.${key} does not exist in node-core (ignored)`);
              continue;
            }
            if (raw.type !== undefined) {
              const overlayType = typeof raw.type === 'string' ? raw.type.trim() : '';
              if (overlayType && overlayType !== String(base.type)) {
                warn(
                  `${formatPath(filePath)}: "${type}" configSchema.${key} type mismatch (overlay: "${overlayType}", core: "${String(
                    base.type
                  )}")`
                );
              }
            }

            if (raw.min !== undefined && !isFiniteNumber(raw.min)) {
              warn(`${formatPath(filePath)}: "${type}" configSchema.${key} min is not a finite number`);
            }
            if (raw.max !== undefined && !isFiniteNumber(raw.max)) {
              warn(`${formatPath(filePath)}: "${type}" configSchema.${key} max is not a finite number`);
            }
            if (raw.step !== undefined && (!isFiniteNumber(raw.step) || raw.step <= 0)) {
              warn(`${formatPath(filePath)}: "${type}" configSchema.${key} step must be a finite number > 0`);
            }

            const mergedMin = mergeMin(isFiniteNumber(base.min) ? base.min : undefined, raw.min);
            const mergedMax = mergeMax(isFiniteNumber(base.max) ? base.max : undefined, raw.max);
            if (mergedMin !== undefined && mergedMax !== undefined && mergedMin > mergedMax) {
              warn(
                `${formatPath(filePath)}: "${type}" configSchema.${key} min/max conflict after intersecting with core (overlay will be ignored)`
              );
            }
          }
        }
      }

      checkMetadata(filePath, type, json.metadata, warn, error);

      continue;
    }

    // Manager-only definition checks.
    const label = typeof json.label === 'string' ? json.label.trim() : '';
    const category = typeof json.category === 'string' ? json.category.trim() : '';
    const runtimeKind = typeof json?.runtime?.kind === 'string' ? String(json.runtime.kind).trim() : '';

    if (!label) error(`${formatPath(filePath)}: manager-only node "${type}" is missing "label" (string)`);
    if (!category) error(`${formatPath(filePath)}: manager-only node "${type}" is missing "category" (string)`);
    if (!runtimeKind) error(`${formatPath(filePath)}: manager-only node "${type}" is missing "runtime.kind" (string)`);
    checkMetadata(filePath, type, json.metadata, warn, error);

    const checkPorts = (kind, ports) => {
      if (!Array.isArray(ports)) {
        error(`${formatPath(filePath)}: manager-only node "${type}" "${kind}" must be an array`);
        return;
      }
      for (const raw of ports) {
        if (!isPlainObject(raw)) {
          error(`${formatPath(filePath)}: manager-only node "${type}" "${kind}" item must be an object`);
          continue;
        }
        const id = typeof raw.id === 'string' ? raw.id.trim() : '';
        const portType = typeof raw.type === 'string' ? raw.type.trim() : '';
        if (!id) error(`${formatPath(filePath)}: manager-only node "${type}" "${kind}" item missing "id"`);
        if (!portType) error(`${formatPath(filePath)}: manager-only node "${type}" "${kind}.${id || '?'}" missing "type"`);

        if (raw.min !== undefined && !isFiniteNumber(raw.min)) {
          warn(`${formatPath(filePath)}: "${type}" ${kind}.${id || '?'} min is not a finite number`);
        }
        if (raw.max !== undefined && !isFiniteNumber(raw.max)) {
          warn(`${formatPath(filePath)}: "${type}" ${kind}.${id || '?'} max is not a finite number`);
        }
        if (raw.step !== undefined && (!isFiniteNumber(raw.step) || raw.step <= 0)) {
          warn(`${formatPath(filePath)}: "${type}" ${kind}.${id || '?'} step must be a finite number > 0`);
        }
        if (isFiniteNumber(raw.min) && isFiniteNumber(raw.max) && raw.min > raw.max) {
          warn(`${formatPath(filePath)}: "${type}" ${kind}.${id || '?'} min > max (conflict)`);
        }
      }
    };

    checkPorts('inputs', json.inputs);
    checkPorts('outputs', json.outputs);

    if (!Array.isArray(json.configSchema)) {
      error(`${formatPath(filePath)}: manager-only node "${type}" "configSchema" must be an array`);
    } else {
      for (const raw of json.configSchema) {
        if (!isPlainObject(raw)) {
          error(`${formatPath(filePath)}: manager-only node "${type}" "configSchema" item must be an object`);
          continue;
        }
        const key = typeof raw.key === 'string' ? raw.key.trim() : '';
        const fieldType = typeof raw.type === 'string' ? raw.type.trim() : '';
        if (!key) error(`${formatPath(filePath)}: manager-only node "${type}" configSchema item missing "key"`);
        if (!fieldType) error(`${formatPath(filePath)}: manager-only node "${type}" configSchema.${key || '?'} missing "type"`);

        if (raw.min !== undefined && !isFiniteNumber(raw.min)) {
          warn(`${formatPath(filePath)}: "${type}" configSchema.${key || '?'} min is not a finite number`);
        }
        if (raw.max !== undefined && !isFiniteNumber(raw.max)) {
          warn(`${formatPath(filePath)}: "${type}" configSchema.${key || '?'} max is not a finite number`);
        }
        if (raw.step !== undefined && (!isFiniteNumber(raw.step) || raw.step <= 0)) {
          warn(`${formatPath(filePath)}: "${type}" configSchema.${key || '?'} step must be a finite number > 0`);
        }
        if (isFiniteNumber(raw.min) && isFiniteNumber(raw.max) && raw.min > raw.max) {
          warn(`${formatPath(filePath)}: "${type}" configSchema.${key || '?'} min > max (conflict)`);
        }
      }
    }
  }

  const ok = errors === 0;
  const summaryColor = ok ? colors.gray : colors.red;
  const summary = `${summaryColor}node-specs${colors.reset} ${specFiles.length} files, ${warnings} warnings, ${errors} errors`;
  console.log(summary);

  if (!ok) process.exitCode = 1;
}

function checkStringArray(filePath, type, metadata, key, warn) {
  if (metadata[key] === undefined) return;
  if (!Array.isArray(metadata[key]) || metadata[key].some((item) => typeof item !== 'string')) {
    warn(`${formatPath(filePath)}: "${type}" metadata.${key} should be an array of strings`);
  }
}

function checkMetadata(filePath, type, metadata, warn, error) {
  if (metadata === undefined) return;
  if (!isPlainObject(metadata)) {
    error(`${formatPath(filePath)}: "${type}" metadata must be an object when provided`);
    return;
  }

  if (metadata.version !== undefined && typeof metadata.version !== 'string') {
    warn(`${formatPath(filePath)}: "${type}" metadata.version should be a string`);
  }
  if (metadata.description !== undefined && typeof metadata.description !== 'string') {
    warn(`${formatPath(filePath)}: "${type}" metadata.description should be a string`);
  }
  if (metadata.sideEffectClass !== undefined && typeof metadata.sideEffectClass !== 'string') {
    warn(`${formatPath(filePath)}: "${type}" metadata.sideEffectClass should be a string`);
  }

  checkStringArray(filePath, type, metadata, 'platformTargets', warn);
  checkStringArray(filePath, type, metadata, 'permissions', warn);
  checkStringArray(filePath, type, metadata, 'risks', warn);
  checkStringArray(filePath, type, metadata, 'repairHints', warn);

  if (metadata.compatibility !== undefined && !Array.isArray(metadata.compatibility)) {
    warn(`${formatPath(filePath)}: "${type}" metadata.compatibility should be an array`);
  }
  if (metadata.examples !== undefined && !Array.isArray(metadata.examples)) {
    warn(`${formatPath(filePath)}: "${type}" metadata.examples should be an array`);
  }
}

main().catch((err) => {
  console.error(`${colors.red}error${colors.reset} validator crashed (${err?.message ?? String(err)})`);
  process.exitCode = 1;
});
