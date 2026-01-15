/**
 * Purpose: Asset Service core logic (upload, dedupe, persistence, and content location).
 */

import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { readAssetServiceConfig, type AssetServiceConfig } from './assets.config.js';
import type { AssetIndexFile, AssetKind, AssetRecord, StoredAssetRecord } from './assets.types.js';
import { getErrorCode } from '../utils/error-utils.js';

type UploadResult = { asset: AssetRecord; deduped: boolean };

type StoredIndex = {
  byId: Map<string, StoredAssetRecord>;
  bySha256: Map<string, string>;
};

function guessKind(mimeType: string, originalName: string): AssetKind {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';

  const ext = path.extname(originalName).toLowerCase();
  if (['.wav', '.mp3', '.aac', '.m4a', '.ogg', '.flac'].includes(ext)) return 'audio';
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'].includes(ext)) return 'image';
  if (['.mp4', '.webm', '.mov', '.mkv', '.m4v', '.avi'].includes(ext)) return 'video';
  return 'audio';
}

async function sha256FileHex(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = fs.createReadStream(filePath);
  return await new Promise((resolve, reject) => {
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function moveFile(from: string, to: string): Promise<void> {
  try {
    await fsp.rename(from, to);
    return;
  } catch (err: unknown) {
    const code = getErrorCode(err);
    if (code !== 'EXDEV') throw err;
  }

  await new Promise<void>((resolve, reject) => {
    const read = fs.createReadStream(from);
    const write = fs.createWriteStream(to, { flags: 'wx' });
    read.on('error', reject);
    write.on('error', reject);
    write.on('close', () => resolve());
    read.pipe(write);
  });
  await fsp.unlink(from);
}

async function writeJsonAtomic(filePath: string, json: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await fsp.writeFile(tmp, JSON.stringify(json, null, 2), 'utf8');
  await fsp.rename(tmp, filePath);
}

function toSafeOriginalName(name: string): string {
  const base = path.basename(name || '').replace(/[\r\n"]/g, '_');
  return base || 'asset';
}

function normalizeOptionalString(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const clamped = trimmed.length > 48 ? trimmed.slice(0, 48) : trimmed;
    const key = clamped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clamped);
    if (out.length >= 32) break;
  }
  return out;
}

function normalizeKind(raw: unknown): AssetKind | null {
  if (typeof raw !== 'string') return null;
  const k = raw.trim().toLowerCase();
  if (k === 'audio' || k === 'image' || k === 'video') return k;
  return null;
}

@Injectable()
export class AssetsService {
  readonly config: AssetServiceConfig = readAssetServiceConfig();

  private index: StoredIndex = { byId: new Map(), bySha256: new Map() };
  private persistChain: Promise<void> = Promise.resolve();
  private mutationChain: Promise<void> = Promise.resolve();

  async init(): Promise<void> {
    await fsp.mkdir(this.config.dataDir, { recursive: true });
    await this.loadIndexFromDisk();
  }

  async healthCheck(): Promise<{
    ok: boolean;
    dataDir: { path: string; ok: boolean; error?: string };
    dbPath: { path: string; ok: boolean; error?: string };
    disk?: { path: string; ok: boolean; totalBytes?: number; freeBytes?: number; availBytes?: number; error?: string };
    auth: { writeConfigured: boolean; readConfigured: boolean };
    warnings: string[];
    assetCount: number;
  }> {
    const dataDir = this.config.dataDir;
    const dbPath = this.config.dbPath;

    const result = {
      ok: true,
      dataDir: { path: dataDir, ok: true as boolean, error: undefined as string | undefined },
      dbPath: { path: dbPath, ok: true as boolean, error: undefined as string | undefined },
      disk: { path: dataDir, ok: true as boolean, totalBytes: undefined as number | undefined, freeBytes: undefined as number | undefined, availBytes: undefined as number | undefined, error: undefined as string | undefined },
      auth: { writeConfigured: Boolean(this.config.writeToken), readConfigured: Boolean(this.config.readToken) },
      warnings: [] as string[],
      assetCount: this.index.byId.size,
    };

    try {
      await fsp.access(dataDir, fs.constants.R_OK | fs.constants.W_OK);
    } catch (err) {
      result.ok = false;
      result.dataDir.ok = false;
      result.dataDir.error = err instanceof Error ? err.message : String(err);
    }

    try {
      const dir = path.dirname(dbPath);
      await fsp.access(dir, fs.constants.R_OK | fs.constants.W_OK);
      try {
        await fsp.access(dbPath, fs.constants.R_OK | fs.constants.W_OK);
      } catch (err: unknown) {
        const code = getErrorCode(err);
        // If the index doesn't exist yet, that's fine as long as the dir is writable.
        if (code !== 'ENOENT') throw err;
      }
    } catch (err) {
      result.ok = false;
      result.dbPath.ok = false;
      result.dbPath.error = err instanceof Error ? err.message : String(err);
    }

    try {
      const stat = await fsp.statfs(dataDir);
      const bsize = Number(stat.bsize) || 0;
      const blocks = Number(stat.blocks) || 0;
      const bfree = Number(stat.bfree) || 0;
      const bavail = Number(stat.bavail) || 0;
      result.disk.totalBytes = bsize > 0 ? bsize * blocks : undefined;
      result.disk.freeBytes = bsize > 0 ? bsize * bfree : undefined;
      result.disk.availBytes = bsize > 0 ? bsize * bavail : undefined;
      if (result.disk.availBytes !== undefined && result.disk.availBytes < 1 * 1024 * 1024 * 1024) {
        result.warnings.push('low-disk');
      }
    } catch (err) {
      result.ok = false;
      result.disk.ok = false;
      result.disk.error = err instanceof Error ? err.message : String(err);
    }

    if (!result.auth.writeConfigured) result.warnings.push('asset-write-auth-not-configured');

    return result;
  }

  private storagePathForSha256(sha256: string): string {
    const prefix = sha256.slice(0, 2);
    return path.join(this.config.dataDir, prefix, sha256);
  }

  private async loadIndexFromDisk(): Promise<void> {
    try {
      const raw = await fsp.readFile(this.config.dbPath, 'utf8');
      const parsed = JSON.parse(raw) as AssetIndexFile;
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.assets)) return;
      const byId = new Map<string, StoredAssetRecord>();
      const bySha256 = new Map<string, string>();
      for (const asset of parsed.assets) {
        if (!asset?.id || typeof asset.id !== 'string') continue;
        if (!asset?.sha256 || typeof asset.sha256 !== 'string') continue;
        byId.set(asset.id, asset);
        bySha256.set(asset.sha256, asset.id);
      }
      this.index = { byId, bySha256 };
    } catch (err: unknown) {
      const code = getErrorCode(err);
      if (code === 'ENOENT') return;
      console.warn('[asset-service] failed to load index', err);
    }
  }

  private enqueuePersist(): void {
    const snapshot: AssetIndexFile = {
      version: 1,
      assets: Array.from(this.index.byId.values()),
    };
    this.persistChain = this.persistChain
      .catch(() => undefined)
      .then(() => writeJsonAtomic(this.config.dbPath, snapshot))
      .catch((err) => console.warn('[asset-service] persist failed', err));
  }

  getAssetRecord(id: string): AssetRecord | null {
    const stored = this.index.byId.get(id);
    if (!stored) return null;
    const { storageBackend, storageKey, ...record } = stored;
    void storageBackend;
    void storageKey;
    return record;
  }

  listAssets(): AssetRecord[] {
    return Array.from(this.index.byId.values()).map((stored) => {
      const { storageBackend, storageKey, ...record } = stored;
      void storageBackend;
      void storageKey;
      return record;
    });
  }

  async deleteAsset(id: string): Promise<{ deleted: boolean }> {
    const safeId = String(id ?? '').trim();
    if (!safeId) return { deleted: false };

    return await this.runMutation(async () => {
      const stored = this.index.byId.get(safeId);
      if (!stored) return { deleted: false };

      this.index.byId.delete(safeId);
      this.index.bySha256.delete(stored.sha256);
      this.enqueuePersist();

      // Best-effort: remove content file. Since we dedupe by sha256 and keep one assetId per sha256,
      // this is safe for MVP.
      const filePath = this.storagePathForSha256(stored.storageKey);
      try {
        await fsp.unlink(filePath);
      } catch {
        // ignore
      }
      try {
        const dir = path.dirname(filePath);
        await fsp.rmdir(dir);
      } catch {
        // ignore (non-empty or unsupported)
      }

      return { deleted: true };
    });
  }

  async updateAsset(
    id: string,
    patch: {
      originalName?: unknown;
      kind?: unknown;
      tags?: unknown;
      description?: unknown;
    }
  ): Promise<AssetRecord | null> {
    const safeId = String(id ?? '').trim();
    if (!safeId) return null;

    return await this.runMutation(async () => {
      const stored = this.index.byId.get(safeId);
      if (!stored) return null;

      let changed = false;
      const next: StoredAssetRecord = { ...stored };

      if (patch.originalName !== undefined) {
        const raw = String(patch.originalName ?? '');
        if (raw.trim()) {
          const name = toSafeOriginalName(raw);
          if (name !== next.originalName) {
            next.originalName = name;
            changed = true;
          }
        }
      }

      if (patch.kind !== undefined) {
        const kind = normalizeKind(patch.kind);
        if (kind && kind !== next.kind) {
          next.kind = kind;
          changed = true;
        }
      }

      if (patch.tags !== undefined) {
        const tags = normalizeTags(patch.tags);
        const prev = Array.isArray(next.tags) ? next.tags : [];
        const prevSerialized = prev.join('\n');
        const nextSerialized = tags.join('\n');
        if (nextSerialized !== prevSerialized) {
          if (tags.length > 0) next.tags = tags;
          else delete next.tags;
          changed = true;
        }
      }

      if (patch.description !== undefined) {
        const description = normalizeOptionalString(patch.description, 2000);
        const prev = typeof next.description === 'string' ? next.description : null;
        if (description !== prev) {
          if (description) next.description = description;
          else delete next.description;
          changed = true;
        }
      }

      if (!changed) {
        const { storageBackend, storageKey, ...record } = next;
        void storageBackend;
        void storageKey;
        return record;
      }

      next.updatedAt = Date.now();
      this.index.byId.set(safeId, next);
      this.enqueuePersist();

      const { storageBackend, storageKey, ...record } = next;
      void storageBackend;
      void storageKey;
      return record;
    });
  }

  getStoredAsset(id: string): StoredAssetRecord | null {
    return this.index.byId.get(id) ?? null;
  }

  getContentHeaders(id: string): { filePath: string; stored: StoredAssetRecord } | null {
    const stored = this.getStoredAsset(id);
    if (!stored) return null;
    const filePath = this.storagePathForSha256(stored.storageKey);
    return { filePath, stored };
  }

  async uploadFromTempFile(opts: {
    tempPath: string;
    mimeType: string;
    originalName: string;
    kind?: AssetKind | null;
  }): Promise<UploadResult> {
    const safeName = toSafeOriginalName(opts.originalName);
    const sha256 = await sha256FileHex(opts.tempPath);
    const stat = await fsp.stat(opts.tempPath);

    if (stat.size > this.config.maxBytes) {
      try {
        await fsp.unlink(opts.tempPath);
      } catch {
        // ignore
      }
      throw new Error(`asset too large (${stat.size} bytes > ${this.config.maxBytes})`);
    }

    const kind = opts.kind ?? guessKind(opts.mimeType, safeName);

    return await this.runMutation(async () => {
      const existingId = this.index.bySha256.get(sha256);
      if (existingId) {
        // Dedupe: remove temp file and return existing record.
        try {
          await fsp.unlink(opts.tempPath);
        } catch {
          // ignore
        }
        const existing = this.getAssetRecord(existingId);
        if (!existing) throw new Error('asset index corrupted (missing existing record)');
        return { asset: existing, deduped: true };
      }

      const id = randomUUID();
      const now = Date.now();

      const stored: StoredAssetRecord = {
        id,
        kind,
        mimeType: opts.mimeType,
        sizeBytes: stat.size,
        sha256,
        originalName: safeName,
        createdAt: now,
        updatedAt: now,
        storageBackend: 'localfs',
        storageKey: sha256,
      };

      const finalPath = this.storagePathForSha256(sha256);
      await fsp.mkdir(path.dirname(finalPath), { recursive: true });
      try {
        await moveFile(opts.tempPath, finalPath);
      } catch (err: unknown) {
        const code = getErrorCode(err);
        if (code === 'EEXIST') {
          // Another concurrent upload won the race; treat as deduped.
          try {
            await fsp.unlink(opts.tempPath);
          } catch {
            // ignore
          }
          const concurrentId = this.index.bySha256.get(sha256);
          if (concurrentId) {
            const existing = this.getAssetRecord(concurrentId);
            if (existing) return { asset: existing, deduped: true };
          }
        }
        throw err;
      }

      this.index.byId.set(id, stored);
      this.index.bySha256.set(sha256, id);
      this.enqueuePersist();

      const { storageBackend, storageKey, ...record } = stored;
      void storageBackend;
      void storageKey;
      return { asset: record, deduped: false };
    });
  }

  private async runMutation<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.mutationChain.catch(() => undefined).then(fn);
    // Keep the chain alive regardless of this mutation outcome.
    this.mutationChain = next.then(
      () => undefined,
      () => undefined
    );
    return await next;
  }
}
