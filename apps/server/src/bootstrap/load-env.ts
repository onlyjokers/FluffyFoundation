/**
 * Purpose: Load optional local env files for dev/prod without adding external deps.
 *
 * Supported locations (first found wins):
 * - <repo>/.env                          (local root AI config)
 * - <repo>/secrets/server.env            (recommended; not committed)
 * - <repo>/apps/server/secrets/server.env
 * - <repo>/apps/server/.env
 *
 * Notes:
 * - Only sets keys that are currently undefined in process.env.
 * - Format: KEY=VALUE, supports simple single/double quotes, ignores blank lines and # comments.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

function unquote(value: string): string {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = unquote(line.slice(eq + 1));
    if (!key) continue;
    out[key] = value;
  }
  return out;
}

export function loadOptionalEnv(): { loadedFrom: string | null; keys: string[] } {
  const cwd = process.cwd();
  const candidates: string[] = [];

  // Common dev setups:
  // - pnpm -C apps/server dev   => cwd = <repo>/apps/server
  // - pnpm dev:all             => cwd may be <repo> or <repo>/apps/server depending on runner
  //
  // Walk up a few levels and look for:
  // - secrets/server.env (preferred)
  // - apps/server/secrets/server.env
  // - apps/server/.env
  const maxDepth = 4;
  let dir: string | null = cwd;
  for (let i = 0; i < maxDepth && dir; i += 1) {
    candidates.push(path.join(dir, '.env'));
    candidates.push(path.join(dir, 'secrets/server.env'));
    candidates.push(path.join(dir, 'apps/server/secrets/server.env'));
    candidates.push(path.join(dir, 'apps/server/.env'));

    const parent = path.dirname(dir);
    dir = parent && parent !== dir ? parent : null;
  }

  const filePath = candidates.find((p) => fs.existsSync(p)) ?? null;
  if (!filePath) return { loadedFrom: null, keys: [] };

  try {
    const parsed = parseEnvFile(fs.readFileSync(filePath, 'utf8'));
    const keys: string[] = [];
    for (const [k, v] of Object.entries(parsed)) {
      const existing = process.env[k];
      const shouldSet =
        existing === undefined || (typeof existing === 'string' && existing.trim() === '');
      if (shouldSet) {
        process.env[k] = v;
        keys.push(k);
      }
    }
    return { loadedFrom: filePath, keys };
  } catch {
    return { loadedFrom: filePath, keys: [] };
  }
}
