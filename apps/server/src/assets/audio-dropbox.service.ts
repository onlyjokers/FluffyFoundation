/**
 * Purpose: Persistent FIFO queue of audio asset references for reusable generated speech.
 */
import { Injectable } from '@nestjs/common';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { getErrorCode } from '../utils/error-utils.js';

export type AudioDropBoxEntry = {
  assetId: string;
  name?: string;
  createdAt: number;
};

type AudioDropBoxIndexFile = {
  version: 1;
  capacity: number;
  entries: AudioDropBoxEntry[];
};

type AudioDropBoxOptions = {
  filePath?: string;
  capacity?: number;
};

function parsePositiveInt(value: unknown, fallback: number): number {
  const raw = typeof value === 'string' ? Number(value) : Number(value);
  if (!Number.isFinite(raw)) return fallback;
  const asInt = Math.floor(raw);
  return asInt > 0 ? asInt : fallback;
}

function readDropBoxFilePath(): string {
  const configured = process.env.AUDIO_DROP_BOX_PATH?.trim();
  if (configured) return path.resolve(configured);
  const assetDataDir = process.env.ASSET_DATA_DIR?.trim();
  const dataDir = assetDataDir ? path.resolve(assetDataDir) : path.resolve(process.cwd(), 'data', 'assets');
  return path.join(dataDir, 'audio-dropbox.json');
}

function normalizeAssetId(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('asset:')) return trimmed.slice('asset:'.length).trim().split(/[?#]/)[0]?.trim() ?? '';
  const shuguPrefix = 'shugu://asset/';
  if (trimmed.startsWith(shuguPrefix)) return trimmed.slice(shuguPrefix.length).trim().split(/[?#]/)[0]?.trim() ?? '';
  return trimmed.split(/[?#]/)[0]?.trim() ?? '';
}

function normalizeName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > 120 ? trimmed.slice(0, 120) : trimmed;
}

async function writeJsonAtomic(filePath: string, json: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await fsp.writeFile(tmp, JSON.stringify(json, null, 2), 'utf8');
  await fsp.rename(tmp, filePath);
}

@Injectable()
export class AudioDropBoxService {
  private readonly filePath: string;
  private capacity: number;
  private entries: AudioDropBoxEntry[] = [];
  private persistChain: Promise<void> = Promise.resolve();
  private mutationChain: Promise<void> = Promise.resolve();

  constructor(options: AudioDropBoxOptions = {}) {
    this.filePath = options.filePath ?? readDropBoxFilePath();
    this.capacity = parsePositiveInt(
      options.capacity ?? process.env.AUDIO_DROP_BOX_CAPACITY,
      10
    );
  }

  async init(): Promise<void> {
    await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
    await this.loadFromDisk();
  }

  list(): AudioDropBoxEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  getLatest(): AudioDropBoxEntry | null {
    const entry = this.entries[this.entries.length - 1];
    return entry ? { ...entry } : null;
  }

  resolve(input: { assetId?: unknown; name?: unknown; index?: unknown; latest?: unknown }): AudioDropBoxEntry | null {
    const assetId = normalizeAssetId(input.assetId);
    if (assetId) {
      const found = this.entries.find((entry) => entry.assetId === assetId);
      return found ? { ...found } : null;
    }

    const name = normalizeName(input.name);
    if (name) {
      for (let i = this.entries.length - 1; i >= 0; i -= 1) {
        const entry = this.entries[i];
        if (entry?.name === name) return { ...entry };
      }
      return null;
    }

    const indexRaw = typeof input.index === 'number' ? input.index : Number(input.index);
    const index = Number.isFinite(indexRaw) ? Math.floor(indexRaw) : -1;
    if (index >= 0) {
      const entry = this.entries[index];
      return entry ? { ...entry } : null;
    }

    return this.getLatest();
  }

  async push(input: { assetId: unknown; name?: unknown; createdAt?: unknown }): Promise<AudioDropBoxEntry> {
    const assetId = normalizeAssetId(input.assetId);
    if (!assetId) throw new Error('audio drop box assetId is required');
    const name = normalizeName(input.name);
    const createdAtRaw = typeof input.createdAt === 'number' ? input.createdAt : Number(input.createdAt);
    const createdAt = Number.isFinite(createdAtRaw) && createdAtRaw > 0 ? createdAtRaw : Date.now();

    return await this.runMutation(async () => {
      this.entries = this.entries.filter((entry) => entry.assetId !== assetId);
      const entry: AudioDropBoxEntry = { assetId, createdAt, ...(name ? { name } : {}) };
      this.entries.push(entry);
      this.trimToCapacity();
      await this.enqueuePersist();
      return { ...entry };
    });
  }

  private trimToCapacity(): void {
    if (this.entries.length <= this.capacity) return;
    this.entries = this.entries.slice(this.entries.length - this.capacity);
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const raw = await fsp.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<AudioDropBoxIndexFile>;
      if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return;
      const capacity = parsePositiveInt(parsed.capacity, this.capacity);
      this.capacity = parsePositiveInt(process.env.AUDIO_DROP_BOX_CAPACITY, capacity);
      const entries: AudioDropBoxEntry[] = [];
      for (const rawEntry of parsed.entries) {
        const assetId = normalizeAssetId(rawEntry?.assetId);
        if (!assetId) continue;
        const createdAtRaw = Number(rawEntry?.createdAt);
        const createdAt = Number.isFinite(createdAtRaw) && createdAtRaw > 0 ? createdAtRaw : Date.now();
        const name = normalizeName(rawEntry?.name);
        entries.push({ assetId, createdAt, ...(name ? { name } : {}) });
      }
      this.entries = entries;
      this.trimToCapacity();
    } catch (err: unknown) {
      const code = getErrorCode(err);
      if (code === 'ENOENT') return;
      console.warn('[audio-dropbox] failed to load index', err);
    }
  }

  private async enqueuePersist(): Promise<void> {
    const snapshot: AudioDropBoxIndexFile = {
      version: 1,
      capacity: this.capacity,
      entries: this.entries.map((entry) => ({ ...entry })),
    };
    this.persistChain = this.persistChain
      .catch(() => undefined)
      .then(() => writeJsonAtomic(this.filePath, snapshot))
      .catch((err) => console.warn('[audio-dropbox] persist failed', err));
    await this.persistChain;
  }

  private async runMutation<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.mutationChain.catch(() => undefined).then(fn);
    this.mutationChain = next.then(
      () => undefined,
      () => undefined
    );
    return await next;
  }
}
