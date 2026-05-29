// Purpose: Pure AssetsManager formatting, filtering, and sorting helpers for unit-tested reuse.
import type { AssetKind, AssetRecord } from '$lib/stores/assets';

export type ViewMode = 'grid' | 'list';
export type SortModeBase = 'newest' | 'oldest' | 'name-az' | 'name-za' | 'size-desc' | 'size-asc';
export type SortMode = SortModeBase | `kind-${SortModeBase}`;

export type FileLike = {
  name?: string;
  type?: string;
};

export type UploadItem = {
  id: string;
  file: File;
  status: 'queued' | 'uploading' | 'done' | 'error';
  progressPct: number;
  error?: string;
};

export type AssetFilterOptions = {
  query: string;
  filterKind: 'all' | AssetKind;
  filterFileType: string;
  filterTags: string;
  uploadedAfter: string;
  uploadedBefore: string;
  sizeMinMb: string;
  sizeMaxMb: string;
  sortMode: SortMode;
};

const bytesFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
  useGrouping: true,
});

export const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatAssetBytes(bytes: number): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'] as const;
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const formatted = bytesFormatter.format(Math.round(v * 10) / 10);
  return `${formatted} ${units[i]}`;
}

export function formatCapacityPercent(usedBytes: number, maxBytes: number): number {
  const used = Number(usedBytes);
  const max = Number(maxBytes);
  if (!Number.isFinite(used) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((used / max) * 100)));
}

export function formatAssetSourceLabel(source: unknown): string {
  if (source === 'manager-upload') return 'Manager Upload';
  if (source === 'ai-image') return 'AI Image';
  if (source === 'tts') return 'TTS';
  if (source === 'recording') return 'Recording';
  if (source === 'import') return 'Import';
  return 'Unknown';
}

export function formatAssetDateTime(epochMs: number): string {
  const n = Number(epochMs);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return dateTimeFormatter.format(new Date(n));
}

export function shortAssetId(id: string): string {
  const s = String(id ?? '');
  if (s.length <= 10) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

export function inferAssetKindFromFileLike(file: FileLike): AssetKind {
  const mime = (file.type ?? '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('model/')) return 'model';

  const name = (file.name ?? '').toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return 'image';
  if (/\.(mp4|webm|mov|m4v|mkv|avi)$/.test(name)) return 'video';
  if (/\.(onnx|tflite|bin|pt|pth|safetensors|mlmodel|gguf|ggml)$/.test(name)) return 'model';
  return 'audio';
}

export function getFileExt(originalName: string): string {
  const name = String(originalName ?? '').trim();
  if (!name) return '';
  const base = name.split(/[?#]/)[0] ?? '';
  const idx = base.lastIndexOf('.');
  if (idx <= 0 || idx >= base.length - 1) return '';
  return base
    .slice(idx + 1)
    .trim()
    .toLowerCase();
}

export function parseTagFilter(raw: string): string[] {
  const parts = raw
    .split(/[,\n]/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

export function parseDateInputToEpochMs(raw: string, mode: 'start' | 'end'): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [yRaw, mRaw, dRaw] = s.split('-');
  const y = Number(yRaw);
  const m = Number(mRaw);
  const d = Number(dRaw);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const date = new Date(y, m - 1, d, 0, 0, 0, 0);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return null;
  if (mode === 'end') return ms + 24 * 60 * 60 * 1000 - 1;
  return ms;
}

export function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return null;
  return num;
}

export function matchesQuery(asset: AssetRecord, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;

  const tags = Array.isArray(asset.tags) ? asset.tags.join(' ') : '';
  const description = typeof asset.description === 'string' ? asset.description : '';

  return (
    asset.id.toLowerCase().includes(needle) ||
    asset.originalName.toLowerCase().includes(needle) ||
    asset.sha256.toLowerCase().includes(needle) ||
    asset.mimeType.toLowerCase().includes(needle) ||
    tags.toLowerCase().includes(needle) ||
    description.toLowerCase().includes(needle)
  );
}

export function matchesTagFilter(asset: AssetRecord, tags: string[]): boolean {
  if (tags.length === 0) return true;
  const assetTags = Array.isArray(asset.tags) ? asset.tags : [];
  if (assetTags.length === 0) return false;
  const hay = assetTags.map((t) => t.toLowerCase());
  return tags.some((t) => hay.includes(t.toLowerCase()));
}

export function matchesAdvancedFilters(
  asset: AssetRecord,
  opts: {
    fileType: string;
    tagTokens: string[];
    uploadedAfterMs: number | null;
    uploadedBeforeMs: number | null;
    sizeMinBytes: number | null;
    sizeMaxBytes: number | null;
  }
): boolean {
  if (opts.fileType !== 'all') {
    const ext = getFileExt(asset.originalName);
    if (ext !== opts.fileType) return false;
  }

  if (!matchesTagFilter(asset, opts.tagTokens)) return false;

  const createdAt = typeof asset.createdAt === 'number' ? asset.createdAt : Number(asset.createdAt);
  if (
    opts.uploadedAfterMs !== null &&
    Number.isFinite(createdAt) &&
    createdAt < opts.uploadedAfterMs
  )
    return false;
  if (
    opts.uploadedBeforeMs !== null &&
    Number.isFinite(createdAt) &&
    createdAt > opts.uploadedBeforeMs
  )
    return false;

  const sizeBytes =
    typeof asset.sizeBytes === 'number' ? asset.sizeBytes : Number(asset.sizeBytes);
  if (opts.sizeMinBytes !== null && Number.isFinite(sizeBytes) && sizeBytes < opts.sizeMinBytes)
    return false;
  if (opts.sizeMaxBytes !== null && Number.isFinite(sizeBytes) && sizeBytes > opts.sizeMaxBytes)
    return false;

  return true;
}

export function sortAssets(list: AssetRecord[], mode: SortMode): AssetRecord[] {
  const next = [...list];
  const baseMode: SortModeBase = mode.startsWith('kind-')
    ? (mode.slice('kind-'.length) as SortModeBase)
    : (mode as SortModeBase);
  const groupByKind = mode.startsWith('kind-');
  const KIND_PRIORITY: Record<AssetKind, number> = { audio: 0, image: 1, video: 2, model: 3 };

  next.sort((a, b) => {
    if (groupByKind) {
      const ak = KIND_PRIORITY[a.kind] ?? 99;
      const bk = KIND_PRIORITY[b.kind] ?? 99;
      if (ak !== bk) return ak - bk;
    }

    if (baseMode === 'newest') return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    if (baseMode === 'oldest') return (a.createdAt ?? 0) - (b.createdAt ?? 0);
    if (baseMode === 'size-desc') return (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0);
    if (baseMode === 'size-asc') return (a.sizeBytes ?? 0) - (b.sizeBytes ?? 0);
    if (baseMode === 'name-az') return (a.originalName ?? '').localeCompare(b.originalName ?? '');
    if (baseMode === 'name-za') return (b.originalName ?? '').localeCompare(a.originalName ?? '');
    return 0;
  });
  return next;
}

export function buildFileTypeOptions(assets: AssetRecord[]): Array<{ value: string; label: string }> {
  const extCounts = new Map<string, number>();
  for (const asset of assets) {
    const ext = getFileExt(asset.originalName);
    if (!ext) continue;
    extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1);
  }
  const exts = Array.from(extCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([ext]) => ext);
  return [
    { value: 'all', label: 'Any' },
    ...exts.map((ext) => ({ value: ext, label: ext.toUpperCase() })),
  ];
}

export function pruneAssetSelection(selectedIds: Set<string>, assets: AssetRecord[]): Set<string> {
  if (selectedIds.size === 0) return selectedIds;
  const available = new Set(assets.map((asset) => asset.id));
  let changed = false;
  const next: string[] = [];
  for (const id of selectedIds) {
    if (available.has(id)) {
      next.push(id);
    } else {
      changed = true;
    }
  }
  return changed ? new Set(next) : selectedIds;
}

export function getActiveAdvancedFilterCount(opts: Omit<AssetFilterOptions, 'sortMode'>): number {
  const tagFilterTokens = parseTagFilter(opts.filterTags);
  return [
    opts.filterKind !== 'all',
    opts.filterFileType !== 'all',
    tagFilterTokens.length > 0,
    opts.uploadedAfter.trim().length > 0,
    opts.uploadedBefore.trim().length > 0,
    opts.sizeMinMb.trim().length > 0,
    opts.sizeMaxMb.trim().length > 0,
  ].filter(Boolean).length;
}

export function getFilteredSortedAssets(
  assets: AssetRecord[],
  opts: AssetFilterOptions
): AssetRecord[] {
  const tagFilterTokens = parseTagFilter(opts.filterTags);
  const uploadedAfterMs = parseDateInputToEpochMs(opts.uploadedAfter, 'start');
  const uploadedBeforeMs = parseDateInputToEpochMs(opts.uploadedBefore, 'end');
  const minMb = parseOptionalNumber(opts.sizeMinMb);
  const maxMb = parseOptionalNumber(opts.sizeMaxMb);
  const sizeMinBytes = minMb === null || minMb < 0 ? null : Math.floor(minMb * 1024 * 1024);
  const sizeMaxBytes = maxMb === null || maxMb < 0 ? null : Math.floor(maxMb * 1024 * 1024);

  return sortAssets(
    assets.filter((asset) => {
      if (opts.filterKind !== 'all' && asset.kind !== opts.filterKind) return false;
      if (
        !matchesAdvancedFilters(asset, {
          fileType: opts.filterFileType,
          tagTokens: tagFilterTokens,
          uploadedAfterMs,
          uploadedBeforeMs,
          sizeMinBytes,
          sizeMaxBytes,
        })
      ) {
        return false;
      }
      return matchesQuery(asset, opts.query);
    }),
    opts.sortMode
  );
}

export function kindPillLabel(kind: AssetKind): string {
  if (kind === 'audio') return 'Audio';
  if (kind === 'image') return 'Image';
  if (kind === 'video') return 'Video';
  if (kind === 'model') return 'Model';
  return kind;
}

export function kindTone(kind: AssetKind): string {
  if (kind === 'audio') return 'tone-audio';
  if (kind === 'image') return 'tone-image';
  if (kind === 'video') return 'tone-video';
  if (kind === 'model') return 'tone-model';
  return 'tone-audio';
}
