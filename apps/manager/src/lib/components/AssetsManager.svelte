<!-- Purpose: Asset library UI for browsing/uploading/tagging media assets stored in the Asset Service. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Select from '$lib/components/ui/Select.svelte';
  import { assetsStore, type AssetKind, type AssetRecord } from '$lib/stores/assets';

  export let serverUrl: string;

  type ViewMode = 'grid' | 'list';
  type SortModeBase = 'newest' | 'oldest' | 'name-az' | 'name-za' | 'size-desc' | 'size-asc';
  type SortMode = SortModeBase | `kind-${SortModeBase}`;

  type UploadItem = {
    id: string;
    file: File;
    status: 'queued' | 'uploading' | 'done' | 'error';
    progressPct: number;
    error?: string;
  };

  const storageKeyWriteToken = 'shugu-asset-write-token';
  const storageKeyReadToken = 'shugu-asset-read-token';
  const storageKeyAssetsView = 'shugu-assets-view';

  let assets: AssetRecord[] = [];
  let status: 'idle' | 'loading' | 'error' = 'idle';
  let errorMessage: string | null = null;

  let viewMode: ViewMode = 'grid';
  let sortMode: SortMode = 'kind-newest';
  let filterKind: 'all' | AssetKind = 'all';
  let query = '';
  let filtersOpen = false;

  // Advanced filters: keep them explicit and metadata-based (not just free-text search).
  let filterFileType = 'all'; // file extension, derived from originalName
  let filterTags = ''; // comma-separated tags (exact match, case-insensitive)
  let uploadedAfter = ''; // YYYY-MM-DD
  let uploadedBefore = ''; // YYYY-MM-DD
  let sizeMinMb = ''; // number input as string
  let sizeMaxMb = ''; // number input as string

  let writeToken = '';
  let readToken = '';

  let selectedId: string | null = null;
  let drawerOpen = false;

  let uploadInput: HTMLInputElement | null = null;
  let uploadQueue: UploadItem[] = [];
  let uploaderRunning = false;
  let isDragActive = false;
  let uploadError = '';

  let editName = '';
  let editKind: AssetKind = 'audio';
  let editTags: string[] = [];
  let editDescription = '';
  let tagDraft = '';
  let isSaving = false;
  let saveError = '';
  let editorAssetId: string | null = null;

  const bytesFormatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
    useGrouping: true,
  });

  const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  function readLocalStorage(key: string): string {
    try {
      return localStorage.getItem(key) ?? '';
    } catch {
      return '';
    }
  }

  function writeLocalStorage(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  }

  function buildUrl(path: string): string {
    const base = serverUrl.endsWith('/') ? serverUrl : `${serverUrl}/`;
    return new URL(path, base).toString();
  }

  function buildAssetContentUrl(assetId: string): string | null {
    const id = assetId.trim();
    if (!id) return null;
    try {
      const base = serverUrl.endsWith('/') ? serverUrl : `${serverUrl}/`;
      const url = new URL(`api/assets/${encodeURIComponent(id)}/content`, base);
      if (readToken.trim()) url.searchParams.set('token', readToken.trim());
      return url.toString();
    } catch {
      return null;
    }
  }

  function formatBytes(bytes: number): string {
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

  function formatDateTime(epochMs: number): string {
    const n = Number(epochMs);
    if (!Number.isFinite(n) || n <= 0) return '—';
    return dateTimeFormatter.format(new Date(n));
  }

  function shortId(id: string): string {
    const s = String(id ?? '');
    if (s.length <= 10) return s;
    return `${s.slice(0, 6)}…${s.slice(-4)}`;
  }

  async function copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }

  async function fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1, Math.floor(timeoutMs)));
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function refreshAssets(): Promise<void> {
    uploadError = '';
    await assetsStore.refresh({ serverUrl, writeToken });
  }

  function openDrawer(assetId: string): void {
    selectedId = assetId;
    drawerOpen = true;
  }

  function closeDrawer(): void {
    drawerOpen = false;
    editorAssetId = null;
  }

  function ensureDrawerEditState(asset: AssetRecord | null): void {
    if (!asset) {
      editName = '';
      editKind = 'audio';
      editTags = [];
      editDescription = '';
      tagDraft = '';
      saveError = '';
      return;
    }
    editName = asset.originalName ?? '';
    editKind = asset.kind;
    editTags = Array.isArray(asset.tags) ? [...asset.tags] : [];
    editDescription = typeof asset.description === 'string' ? asset.description : '';
    tagDraft = '';
    saveError = '';
  }

  function normalizeTagInput(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return trimmed.length > 48 ? trimmed.slice(0, 48) : trimmed;
  }

  function addTag(raw: string): void {
    const tag = normalizeTagInput(raw);
    if (!tag) return;
    const key = tag.toLowerCase();
    const next = editTags.filter((t) => t.trim());
    if (next.some((t) => t.toLowerCase() === key)) return;
    editTags = [...next, tag].slice(0, 32);
    tagDraft = '';
  }

  function removeTag(tag: string): void {
    const key = tag.toLowerCase();
    editTags = editTags.filter((t) => t.toLowerCase() !== key);
  }

  function onTagDraftInput(event: Event): void {
    const target = event.currentTarget as HTMLInputElement | null;
    tagDraft = target?.value ?? '';
  }

  function onDescriptionInput(event: Event): void {
    const target = event.currentTarget as HTMLTextAreaElement | null;
    editDescription = target?.value ?? '';
  }

  function inferKindFromFile(file: File): AssetKind {
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

  function enqueueFiles(files: File[]): void {
    uploadError = '';
    const idBase =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? () => crypto.randomUUID()
        : () => `u-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const nextItems: UploadItem[] = files.map((file) => ({
      id: idBase(),
      file,
      status: 'queued',
      progressPct: 0,
    }));
    uploadQueue = [...uploadQueue, ...nextItems];
    void runUploadQueue();
  }

  function openUploadPicker(): void {
    uploadError = '';
    uploadInput?.click?.();
  }

  function onUploadChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;
    enqueueFiles(files);
  }

  function uploadOne(itemId: string, file: File): Promise<void> {
    const token = writeToken.trim();
    if (!token)
      return Promise.reject(new Error('Missing Asset Write Token (set it on the connect screen).'));

    const url = buildUrl('api/assets');
    const kind = inferKindFromFile(file);

    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.set('file', file);
      formData.set('originalName', file.name);
      formData.set('kind', kind);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.timeout = 90_000;

      xhr.upload.onprogress = (evt) => {
        if (!evt.lengthComputable) return;
        const pct = Math.max(0, Math.min(100, Math.round((evt.loaded / evt.total) * 100)));
        uploadQueue = uploadQueue.map((it) =>
          it.id === itemId ? { ...it, progressPct: pct } : it
        );
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
          return;
        }
        const text = xhr.responseText?.trim?.() ?? '';
        reject(new Error(text ? `HTTP ${xhr.status}: ${text}` : `HTTP ${xhr.status}`));
      };
      xhr.onerror = () => reject(new Error('Upload failed (network error).'));
      xhr.ontimeout = () => reject(new Error('Upload timed out.'));

      xhr.send(formData);
    });
  }

  async function runUploadQueue(): Promise<void> {
    if (uploaderRunning) return;
    uploaderRunning = true;
    try {
      let next = uploadQueue.find((it) => it.status === 'queued');
      while (next) {
        const active = next;

        uploadQueue = uploadQueue.map((it) =>
          it.id === active.id
            ? { ...it, status: 'uploading', progressPct: 0, error: undefined }
            : it
        );

        try {
          await uploadOne(active.id, active.file);
          uploadQueue = uploadQueue.map((it) =>
            it.id === active.id ? { ...it, status: 'done', progressPct: 100 } : it
          );
          await refreshAssets();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          uploadQueue = uploadQueue.map((it) =>
            it.id === active.id ? { ...it, status: 'error', error: message } : it
          );
        }

        next = uploadQueue.find((it) => it.status === 'queued');
      }
    } finally {
      uploaderRunning = false;
    }
  }

  async function deleteSelectedAsset(asset: AssetRecord): Promise<void> {
    if (!confirm(`Delete asset ${asset.id}?\n\nThis cannot be undone.`)) return;
    try {
      const token = writeToken.trim();
      if (!token) throw new Error('Missing Asset Write Token (set it on the connect screen).');
      const res = await fetchWithTimeout(
        buildUrl(`api/assets/${asset.id}`),
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
        20_000
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text ? `HTTP ${res.status}: ${text}` : `HTTP ${res.status}`);
      }
      closeDrawer();
      selectedId = null;
      await refreshAssets();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveSelectedAsset(asset: AssetRecord): Promise<void> {
    saveError = '';
    isSaving = true;
    try {
      const token = writeToken.trim();
      if (!token) throw new Error('Missing Asset Write Token (set it on the connect screen).');

      const payload = {
        originalName: editName,
        kind: editKind,
        tags: editTags,
        description: editDescription,
      };

      const res = await fetchWithTimeout(
        buildUrl(`api/assets/${asset.id}`),
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
        20_000
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text ? `HTTP ${res.status}: ${text}` : `HTTP ${res.status}`);
      }

      await refreshAssets();
    } catch (err) {
      saveError = err instanceof Error ? err.message : String(err);
    } finally {
      isSaving = false;
    }
  }

  function matchesQuery(asset: AssetRecord, q: string): boolean {
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

  function parseTagFilter(raw: string): string[] {
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

  function matchesTagFilter(asset: AssetRecord, tags: string[]): boolean {
    if (tags.length === 0) return true;
    const assetTags = Array.isArray(asset.tags) ? asset.tags : [];
    if (assetTags.length === 0) return false;
    const hay = assetTags.map((t) => t.toLowerCase());
    return tags.some((t) => hay.includes(t.toLowerCase()));
  }

  function getFileExt(originalName: string): string {
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

  function parseDateInputToEpochMs(raw: string, mode: 'start' | 'end'): number | null {
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

  function parseOptionalNumber(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    if (!Number.isFinite(num)) return null;
    return num;
  }

  function matchesAdvancedFilters(
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

    const createdAt =
      typeof asset.createdAt === 'number' ? asset.createdAt : Number(asset.createdAt);
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

  function sortAssets(list: AssetRecord[], mode: SortMode): AssetRecord[] {
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

  $: tagFilterTokens = parseTagFilter(filterTags);
  $: fileTypeOptions = (() => {
    const extCounts = new Map<string, number>();
    for (const a of assets) {
      const ext = getFileExt(a.originalName);
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
  })();
  $: uploadedAfterMs = parseDateInputToEpochMs(uploadedAfter, 'start');
  $: uploadedBeforeMs = parseDateInputToEpochMs(uploadedBefore, 'end');
  $: sizeMinBytes = (() => {
    const mb = parseOptionalNumber(sizeMinMb);
    if (mb === null || mb < 0) return null;
    return Math.floor(mb * 1024 * 1024);
  })();
  $: sizeMaxBytes = (() => {
    const mb = parseOptionalNumber(sizeMaxMb);
    if (mb === null || mb < 0) return null;
    return Math.floor(mb * 1024 * 1024);
  })();

  $: activeAdvancedFilterCount = [
    filterKind !== 'all',
    filterFileType !== 'all',
    tagFilterTokens.length > 0,
    uploadedAfter.trim().length > 0,
    uploadedBefore.trim().length > 0,
    sizeMinMb.trim().length > 0,
    sizeMaxMb.trim().length > 0,
  ].filter(Boolean).length;

  $: filtered = sortAssets(
    assets.filter((a) => {
      if (filterKind !== 'all' && a.kind !== filterKind) return false;
      if (
        !matchesAdvancedFilters(a, {
          fileType: filterFileType,
          tagTokens: tagFilterTokens,
          uploadedAfterMs,
          uploadedBeforeMs,
          sizeMinBytes,
          sizeMaxBytes,
        })
      ) {
        return false;
      }
      return matchesQuery(a, query);
    }),
    sortMode
  );

  $: selected = selectedId ? (assets.find((a) => a.id === selectedId) ?? null) : null;
  $: if (drawerOpen && selected && selected.id !== editorAssetId) {
    editorAssetId = selected.id;
    ensureDrawerEditState(selected);
  }
  $: if (drawerOpen && !selected && editorAssetId !== null) {
    editorAssetId = null;
    ensureDrawerEditState(null);
  }

  $: ({ status, error: errorMessage, assets } = $assetsStore);

  function kindPillLabel(kind: AssetKind): string {
    if (kind === 'audio') return 'Audio';
    if (kind === 'image') return 'Image';
    if (kind === 'video') return 'Video';
    if (kind === 'model') return 'Model';
    return kind;
  }

  function kindTone(kind: AssetKind): string {
    if (kind === 'audio') return 'tone-audio';
    if (kind === 'image') return 'tone-image';
    if (kind === 'video') return 'tone-video';
    if (kind === 'model') return 'tone-model';
    return 'tone-audio';
  }

  function onDragEnter(event: DragEvent): void {
    event.preventDefault();
    isDragActive = true;
  }

  function onDragOver(event: DragEvent): void {
    event.preventDefault();
    isDragActive = true;
  }

  function onDragLeave(event: DragEvent): void {
    event.preventDefault();
    if (event.currentTarget === event.target) isDragActive = false;
  }

  function onDrop(event: DragEvent): void {
    event.preventDefault();
    isDragActive = false;
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    enqueueFiles(files);
  }

  onMount(() => {
    writeToken = readLocalStorage(storageKeyWriteToken);
    readToken = readLocalStorage(storageKeyReadToken);

    const savedView = readLocalStorage(storageKeyAssetsView) as ViewMode;
    if (savedView === 'grid' || savedView === 'list') viewMode = savedView;

    void refreshAssets();
  });

  $: writeLocalStorage(storageKeyAssetsView, viewMode);
</script>

<div
  class="assets-shell"
  role="region"
  aria-label="Assets Library"
  on:dragenter={onDragEnter}
  on:dragover={onDragOver}
  on:dragleave={onDragLeave}
  on:drop={onDrop}
>
  <div class="assets-toolbar-frame">
    <div class="assets-toolbar pill-toolbar" role="region" aria-label="Assets toolbar">
      <div class="toolbar-left">
        <div class="count-chip" title="Filtered count">
          {#if filtered.length === assets.length}
            {assets.length} items
          {:else}
            {filtered.length} / {assets.length} items
          {/if}
        </div>
      </div>

      <div class="toolbar-center" aria-label="Search & sort">
        <input
          class="toolbar-ctl toolbar-search"
          type="search"
          bind:value={query}
          placeholder="Search id / name / sha / mime / tags / notes…"
          aria-label="Search assets"
        />
        <select class="toolbar-ctl toolbar-select" bind:value={sortMode} aria-label="Sort">
          <option value="kind-newest">Type → Newest</option>
          <option value="kind-oldest">Type → Oldest</option>
          <option value="kind-name-az">Type → Name (A→Z)</option>
          <option value="kind-name-za">Type → Name (Z→A)</option>
          <option value="kind-size-desc">Type → Size (big→small)</option>
          <option value="kind-size-asc">Type → Size (small→big)</option>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name-az">Name (A→Z)</option>
          <option value="name-za">Name (Z→A)</option>
          <option value="size-desc">Size (big→small)</option>
          <option value="size-asc">Size (small→big)</option>
        </select>
      </div>

      <div class="toolbar-right">
        <Button
          variant="secondary"
          size="sm"
          on:click={refreshAssets}
          disabled={status === 'loading'}
          title="Refresh list"
        >
          {status === 'loading' ? 'Refreshing…' : 'Refresh'}
        </Button>
        <Button variant="primary" size="sm" on:click={openUploadPicker} title="Upload files">
          Upload
        </Button>
        <input
          class="upload-input"
          type="file"
          multiple
          bind:this={uploadInput}
          on:change={onUploadChange}
        />
        <Button
          variant={filtersOpen || activeAdvancedFilterCount > 0 ? 'primary' : 'secondary'}
          size="sm"
          on:click={() => (filtersOpen = !filtersOpen)}
          title="Toggle filters"
        >
          Filters
          {#if activeAdvancedFilterCount > 0}
            <span class="filter-badge" aria-label="Active filter count"
              >{activeAdvancedFilterCount}</span
            >
          {/if}
        </Button>
        <div class="view-toggle" role="group" aria-label="View mode">
          <button
            class="toggle-btn"
            class:active={viewMode === 'grid'}
            on:click={() => (viewMode = 'grid')}
            type="button"
          >
            Grid
          </button>
          <button
            class="toggle-btn"
            class:active={viewMode === 'list'}
            on:click={() => (viewMode = 'list')}
            type="button"
          >
            List
          </button>
        </div>
      </div>
    </div>

    {#if filtersOpen}
      <div class="filters-panel" role="region" aria-label="Filters">
        <div class="filters-grid">
          <Select
            label="Kind"
            bind:value={filterKind}
            options={[
              { value: 'all', label: 'All' },
              { value: 'audio', label: 'Audio' },
              { value: 'image', label: 'Image' },
              { value: 'video', label: 'Video' },
              { value: 'model', label: 'Model' },
            ]}
          />
          <Select label="File Type" bind:value={filterFileType} options={fileTypeOptions} />
          <Input label="Tags" bind:value={filterTags} placeholder="intro, loop, bg…" />
          <div class="field">
            <label class="control-label" for="assets-uploaded-after">Uploaded After</label>
            <input
              id="assets-uploaded-after"
              class="input"
              type="date"
              bind:value={uploadedAfter}
            />
          </div>
          <div class="field">
            <label class="control-label" for="assets-uploaded-before">Uploaded Before</label>
            <input
              id="assets-uploaded-before"
              class="input"
              type="date"
              bind:value={uploadedBefore}
            />
          </div>
          <div class="field">
            <label class="control-label" for="assets-size-min">Min Size (MB)</label>
            <input
              id="assets-size-min"
              class="input"
              type="number"
              min="0"
              step="0.1"
              bind:value={sizeMinMb}
              placeholder="0"
            />
          </div>
          <div class="field">
            <label class="control-label" for="assets-size-max">Max Size (MB)</label>
            <input
              id="assets-size-max"
              class="input"
              type="number"
              min="0"
              step="0.1"
              bind:value={sizeMaxMb}
              placeholder="10"
            />
          </div>
        </div>

        <div class="filters-actions">
          <Button
            variant="ghost"
            size="sm"
            on:click={() => {
              filterFileType = 'all';
              filterTags = '';
              uploadedAfter = '';
              uploadedBefore = '';
              sizeMinMb = '';
              sizeMaxMb = '';
              filterKind = 'all';
              query = '';
            }}
          >
            Clear Filters
          </Button>
        </div>
      </div>
    {/if}
  </div>

  <div class="assets-scroll">
    {#if uploadError}
      <div class="banner error">{uploadError}</div>
    {/if}

    {#if status === 'error'}
      <div class="banner error">{errorMessage ?? 'Unknown error'}</div>
    {/if}

    {#if status === 'loading' && assets.length === 0}
      <Card class="empty">
        <div class="empty-text">Loading assets…</div>
      </Card>
    {:else if filtered.length === 0}
      <Card class="empty">
        <div class="empty-text">No matching assets</div>
        <div class="empty-hint">Try clearing filters, or upload files by dragging them here.</div>
      </Card>
    {:else if viewMode === 'grid'}
      <div class="grid">
        {#each filtered as a (a.id)}
          {@const contentUrl = buildAssetContentUrl(a.id)}
          <button
            class="asset-card {kindTone(a.kind)}"
            class:selected={a.id === selectedId && drawerOpen}
            type="button"
            on:click={() => openDrawer(a.id)}
          >
            <div class="thumb">
              {#if a.kind === 'image' && contentUrl}
                <img
                  class="thumb-media"
                  src={contentUrl}
                  alt={a.originalName}
                  loading="lazy"
                  decoding="async"
                />
              {:else if a.kind === 'video' && contentUrl}
                <video class="thumb-media" src={contentUrl} muted playsinline preload="metadata"
                ></video>
                <div class="thumb-overlay">VIDEO</div>
              {:else}
                <div class="thumb-audio">
                  <div class="glyph">♪</div>
                  <div class="file-ext">
                    {(a.originalName.split('.').pop() ?? 'audio').toUpperCase()}
                  </div>
                </div>
                <div class="thumb-overlay">AUDIO</div>
              {/if}
            </div>

            <div class="card-body">
              <div class="name" title={a.originalName}>{a.originalName}</div>
              <div class="meta-row">
                <span class="pill">{kindPillLabel(a.kind)}</span>
                <span class="meta-text mono">{formatBytes(a.sizeBytes)}</span>
                <span class="meta-text mono">{shortId(a.id)}</span>
              </div>
              {#if (a.tags?.length ?? 0) > 0}
                <div class="tags">
                  {#each (a.tags ?? []).slice(0, 3) as t (t)}
                    <span class="tag">{t}</span>
                  {/each}
                  {#if (a.tags?.length ?? 0) > 3}
                    <span class="tag more">+{(a.tags?.length ?? 0) - 3}</span>
                  {/if}
                </div>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    {:else}
      <Card class="list-card">
        <div class="list">
          <div class="list-head">
            <div>Name</div>
            <div>Kind</div>
            <div>Size</div>
            <div>Created</div>
            <div>ID</div>
          </div>
          {#each filtered as a (a.id)}
            <button class="list-row" type="button" on:click={() => openDrawer(a.id)}>
              <div class="cell name" title={a.originalName}>{a.originalName}</div>
              <div class="cell"><span class="pill">{kindPillLabel(a.kind)}</span></div>
              <div class="cell mono">{formatBytes(a.sizeBytes)}</div>
              <div class="cell mono">{formatDateTime(a.createdAt)}</div>
              <div class="cell mono" title={a.id}>{shortId(a.id)}</div>
            </button>
          {/each}
        </div>
      </Card>
    {/if}

    {#if uploadQueue.length > 0}
      <Card class="upload-queue" title="Uploads">
        <div class="queue">
          {#each uploadQueue.slice(-6) as item (item.id)}
            <div class="queue-row">
              <div class="queue-name" title={item.file.name}>{item.file.name}</div>
              <div class="queue-status">
                {#if item.status === 'uploading'}
                  <div class="bar">
                    <div class="bar-fill" style="width: {item.progressPct}%" />
                  </div>
                  <div class="pct mono">{item.progressPct}%</div>
                {:else if item.status === 'done'}
                  <div class="done">Done</div>
                {:else if item.status === 'error'}
                  <div class="err" title={item.error ?? ''}>Error</div>
                {:else}
                  <div class="queued">Queued</div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </Card>
    {/if}
  </div>

  {#if isDragActive}
    <div class="drop-overlay" aria-hidden="true">
      <div class="drop-card">
        <div class="drop-title">Drop files to upload</div>
        <div class="drop-sub">Audio / Image / Video / Model — 1–10MB works great</div>
      </div>
    </div>
  {/if}

  {#if drawerOpen && selected}
    {@const contentUrl = buildAssetContentUrl(selected.id)}
    <div class="drawer-backdrop" on:click={closeDrawer} aria-hidden="true" />
    <aside class="drawer" role="dialog" aria-label="Asset details">
      <div class="drawer-header">
        <div class="drawer-title">Asset Details</div>
        <button class="drawer-close" type="button" on:click={closeDrawer} aria-label="Close">
          ×
        </button>
      </div>

      <div class="preview">
        {#if selected.kind === 'image' && contentUrl}
          <img class="preview-media" src={contentUrl} alt={selected.originalName} />
        {:else if selected.kind === 'video' && contentUrl}
          <video class="preview-media" src={contentUrl} controls playsinline preload="metadata"
          ></video>
        {:else if contentUrl}
          <audio class="audio" src={contentUrl} controls preload="metadata"></audio>
        {:else}
          <div class="preview-missing">Preview unavailable</div>
        {/if}
      </div>

      <div class="drawer-body">
        <div class="form-grid">
          <Input label="Name" bind:value={editName} placeholder="Asset name" />
          <Select
            label="Kind"
            bind:value={editKind}
            options={[
              { value: 'audio', label: 'Audio' },
              { value: 'image', label: 'Image' },
              { value: 'video', label: 'Video' },
              { value: 'model', label: 'Model' },
            ]}
          />
        </div>

        <div class="tags-editor">
          <div class="tags-head">
            <div class="label">Tags</div>
            <div class="hint-sm">Press Enter to add</div>
          </div>
          <input
            class="input"
            value={tagDraft}
            placeholder="e.g. intro, percussion, bg, loop…"
            on:input={onTagDraftInput}
            on:keydown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              addTag(tagDraft);
            }}
          />
          {#if editTags.length > 0}
            <div class="tag-chips">
              {#each editTags as t (t)}
                <button class="chip" type="button" on:click={() => removeTag(t)} title="Remove tag">
                  <span>{t}</span>
                  <span class="x">×</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <div class="desc">
          <div class="label">Notes</div>
          <textarea
            class="textarea"
            value={editDescription}
            placeholder="Optional notes…"
            on:input={onDescriptionInput}
          />
        </div>

        {#if saveError}
          <div class="banner error">{saveError}</div>
        {/if}

        <div class="drawer-actions">
          <Button variant="secondary" size="sm" on:click={() => copy(`asset:${selected.id}`)}>
            Copy ref
          </Button>
          <Button variant="secondary" size="sm" on:click={() => copy(selected.sha256)}>
            Copy sha
          </Button>
          {#if contentUrl}
            <Button variant="secondary" size="sm" on:click={() => copy(contentUrl)}>Copy URL</Button
            >
          {/if}
        </div>

        <div class="drawer-actions split">
          <Button variant="danger" size="sm" on:click={() => deleteSelectedAsset(selected)}>
            Delete
          </Button>
          <Button
            variant="primary"
            size="sm"
            on:click={() => saveSelectedAsset(selected)}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </div>

        <div class="drawer-meta">
          <div class="meta-row">
            <div class="k">ID</div>
            <div class="v mono" title={selected.id}>{selected.id}</div>
          </div>
          <div class="meta-row">
            <div class="k">MIME</div>
            <div class="v mono">{selected.mimeType}</div>
          </div>
          <div class="meta-row">
            <div class="k">Size</div>
            <div class="v mono">{formatBytes(selected.sizeBytes)}</div>
          </div>
          <div class="meta-row">
            <div class="k">Created</div>
            <div class="v mono">{formatDateTime(selected.createdAt)}</div>
          </div>
          <div class="meta-row">
            <div class="k">Updated</div>
            <div class="v mono">{formatDateTime(selected.updatedAt)}</div>
          </div>
        </div>
      </div>
    </aside>
  {/if}
</div>

<style>
  .assets-shell {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    width: 100%;
    height: 100%;
    position: relative;
    background:
      radial-gradient(circle at 20% 0%, rgba(99, 102, 241, 0.18), transparent 45%),
      radial-gradient(circle at 80% 10%, rgba(168, 85, 247, 0.16), transparent 50%),
      linear-gradient(180deg, #0b0c14 0%, #070811 100%);
    overflow: hidden;
  }

  .assets-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    padding: calc(var(--ui-pill-toolbar-top) + var(--ui-pill-toolbar-height) + var(--space-xl))
      var(--space-2xl, 32px) var(--space-2xl, 32px);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .upload-input {
    display: none;
  }

  .banner {
    padding: 10px 12px;
    border-radius: var(--radius-lg);
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 6, 23, 0.28);
    font-size: 12px;
  }

  .banner.error {
    border-color: rgba(239, 68, 68, 0.35);
    background: rgba(239, 68, 68, 0.12);
    color: rgba(255, 255, 255, 0.92);
  }

  .assets-toolbar-frame {
    position: absolute;
    top: var(--ui-pill-toolbar-top);
    left: 0;
    right: 0;
    margin-left: var(--space-2xl, 32px);
    margin-right: var(--space-2xl, 32px);
    z-index: 25;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    pointer-events: none;
  }

  .assets-toolbar {
    width: 100%;
    pointer-events: auto;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  .assets-toolbar::-webkit-scrollbar {
    height: 0px;
  }

  .toolbar-left {
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
  }

  .toolbar-center {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .toolbar-right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex-wrap: nowrap;
    justify-content: flex-end;
  }

  .toolbar-ctl {
    height: 30px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 6, 23, 0.35);
    color: rgba(255, 255, 255, 0.9);
    font-family: var(--font-sans);
    font-size: 12px;
    transition:
      border-color var(--transition-fast),
      background var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .toolbar-ctl:focus {
    outline: none;
    border-color: rgba(6, 182, 212, 0.55);
    box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.16);
  }

  .toolbar-ctl::placeholder {
    color: rgba(148, 163, 184, 0.75);
  }

  .toolbar-select {
    width: 150px;
  }

  .toolbar-search {
    flex: 1 1 260px;
    min-width: 180px;
  }

  .filters-panel {
    width: 100%;
    padding: 12px;
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(15, 23, 42, 0.62);
    backdrop-filter: blur(10px);
    box-shadow: 0 18px 56px rgba(0, 0, 0, 0.35);
    pointer-events: auto;
  }

  .filters-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
    align-items: end;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    width: 100%;
  }

  .filters-actions {
    margin-top: 10px;
    display: flex;
    justify-content: flex-end;
  }

  .view-toggle {
    display: inline-flex;
    align-items: center;
    height: 30px;
    padding: 2px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 6, 23, 0.35);
  }

  .toggle-btn {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    height: 26px;
    padding: 0 10px;
    border-radius: 999px;
    font-size: 12px;
    cursor: pointer;
    transition:
      background var(--transition-fast),
      color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .toggle-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.16);
  }

  .toggle-btn:hover {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.06);
  }

  .toggle-btn.active {
    color: var(--text-primary);
    background: rgba(6, 182, 212, 0.16);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06) inset;
  }

  .count-chip {
    padding: 6px 10px;
    border-radius: var(--radius-full);
    border: 1px solid var(--border-color);
    background: rgba(15, 23, 42, 0.6);
    font-size: var(--text-xs);
    color: var(--text-secondary);
  }

  .filter-badge {
    margin-left: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 6px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.3px;
    background: rgba(255, 255, 255, 0.16);
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: rgba(255, 255, 255, 0.92);
  }

  .drop-overlay {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: grid;
    place-items: center;
    background: rgba(2, 6, 23, 0.72);
    backdrop-filter: blur(8px);
  }

  .drop-card {
    width: min(560px, calc(100vw - 28px));
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background:
      radial-gradient(900px 400px at 20% 0%, rgba(34, 197, 94, 0.18), transparent 55%),
      radial-gradient(900px 420px at 70% 20%, rgba(6, 182, 212, 0.2), transparent 60%),
      rgba(15, 23, 42, 0.72);
    padding: 18px 18px 16px;
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
  }

  .drop-title {
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 0.2px;
  }

  .drop-sub {
    margin-top: 6px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .empty {
    text-align: center;
    padding: 18px;
  }

  .empty-text {
    font-size: 14px;
    font-weight: 700;
  }

  .empty-hint {
    margin-top: 6px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
    align-items: stretch;
  }

  .asset-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    color: var(--text-primary);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.03);
    cursor: pointer;
    text-align: left;
    padding: 0;
    transition:
      transform var(--transition-fast),
      border-color var(--transition-fast),
      background var(--transition-fast);
  }

  .asset-card:hover {
    transform: translateY(-1px);
    border-color: rgba(6, 182, 212, 0.38);
    background: rgba(255, 255, 255, 0.05);
  }

  .asset-card.selected {
    border-color: rgba(6, 182, 212, 0.6);
    box-shadow:
      0 0 0 1px rgba(6, 182, 212, 0.2),
      0 14px 38px rgba(0, 0, 0, 0.4);
  }

  .thumb {
    position: relative;
    aspect-ratio: 16 / 10;
    background:
      radial-gradient(800px 300px at 30% 20%, rgba(236, 72, 153, 0.18), transparent 60%),
      radial-gradient(800px 320px at 70% 50%, rgba(6, 182, 212, 0.18), transparent 60%),
      rgba(15, 23, 42, 0.6);
    overflow: hidden;
  }

  .thumb-media {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    filter: saturate(1.05) contrast(1.02);
  }

  .thumb-overlay {
    position: absolute;
    left: 10px;
    bottom: 10px;
    font-size: 10px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.86);
    background: rgba(2, 6, 23, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 4px 8px;
    border-radius: 999px;
  }

  .thumb-audio {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    gap: 6px;
    color: rgba(255, 255, 255, 0.9);
  }

  .glyph {
    font-size: 34px;
    font-weight: 800;
    line-height: 1;
    text-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }

  .file-ext {
    font-size: 11px;
    font-family: var(--font-mono);
    color: rgba(255, 255, 255, 0.78);
  }

  .card-body {
    padding: 10px 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    background: linear-gradient(180deg, rgba(2, 6, 23, 0.64), rgba(2, 6, 23, 0.92));
  }

  .name {
    font-size: 13px;
    font-weight: 700;
    color: rgba(248, 250, 252, 0.95);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta-row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(2, 6, 23, 0.35);
    font-size: 10px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.84);
  }

  .meta-text {
    color: rgba(226, 232, 240, 0.82);
    font-size: 11px;
  }

  .mono {
    font-family: var(--font-mono);
  }

  .tags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .tag {
    font-size: 10px;
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(6, 182, 212, 0.1);
    color: rgba(255, 255, 255, 0.82);
  }

  .tag.more {
    background: rgba(236, 72, 153, 0.1);
  }

  .tone-audio .tag {
    background: rgba(34, 197, 94, 0.1);
  }
  .tone-image .tag {
    background: rgba(59, 130, 246, 0.1);
  }
  .tone-video .tag {
    background: rgba(168, 85, 247, 0.1);
  }
  .tone-model .tag {
    background: rgba(245, 158, 11, 0.12);
  }

  .list-card {
    padding: 0;
  }

  .list {
    display: flex;
    flex-direction: column;
    overflow-x: auto;
  }

  .list-head,
  .list-row {
    display: grid;
    grid-template-columns: minmax(240px, 1.4fr) 110px 120px 170px 160px;
    gap: 10px;
    align-items: center;
    padding: 10px 12px;
  }

  .list-head {
    color: var(--text-secondary);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .list-row {
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: transparent;
    border-left: 0;
    border-right: 0;
    border-top: 0;
    text-align: left;
    cursor: pointer;
    color: var(--text-primary);
    transition: background var(--transition-fast);
  }

  .list-row:hover {
    background: rgba(6, 182, 212, 0.06);
  }

  .cell {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cell.name {
    font-weight: 700;
  }

  .upload-queue {
    position: sticky;
    bottom: 10px;
  }

  .queue {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .queue-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 220px;
    gap: 12px;
    align-items: center;
    padding: 8px 10px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(2, 6, 23, 0.22);
  }

  .queue-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
  }

  .queue-status {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: flex-end;
    min-width: 0;
  }

  .bar {
    height: 8px;
    width: 140px;
    border-radius: 999px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .bar-fill {
    height: 100%;
    background: linear-gradient(90deg, rgba(34, 197, 94, 0.9), rgba(6, 182, 212, 0.9));
  }

  .pct {
    font-size: 11px;
    color: var(--text-secondary);
  }

  .done {
    font-size: 11px;
    color: rgba(34, 197, 94, 0.9);
    font-weight: 700;
  }

  .queued {
    font-size: 11px;
    color: var(--text-secondary);
  }

  .err {
    font-size: 11px;
    color: rgba(239, 68, 68, 0.92);
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 220px;
  }

  .drawer-backdrop {
    position: fixed;
    inset: 0;
    z-index: 140;
    background: rgba(2, 6, 23, 0.64);
    backdrop-filter: blur(10px);
  }

  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    height: 100vh;
    width: min(520px, 92vw);
    z-index: 150;
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(10, 10, 15, 0.85);
    backdrop-filter: blur(16px);
    display: flex;
    flex-direction: column;
  }

  .drawer-header {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 14px 14px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .drawer-title {
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 0.2px;
  }

  .drawer-close {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.9);
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
  }

  .drawer-close:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .preview {
    padding: 12px 14px 0;
  }

  .preview-media {
    width: 100%;
    max-height: 260px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.02);
    object-fit: contain;
  }

  .audio {
    width: 100%;
  }

  .preview-missing {
    height: 200px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    border: 1px dashed rgba(255, 255, 255, 0.16);
    color: var(--text-secondary);
    font-size: 12px;
  }

  .drawer-body {
    padding: 14px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 180px;
    gap: 12px;
    align-items: end;
  }

  .tags-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tags-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
  }

  .label {
    font-size: 12px;
    color: var(--text-secondary);
    font-weight: 700;
    letter-spacing: 0.2px;
  }

  .hint-sm {
    font-size: 11px;
    color: var(--text-muted);
  }

  .tag-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(6, 182, 212, 0.1);
    color: rgba(255, 255, 255, 0.86);
    cursor: pointer;
    font-size: 12px;
  }

  .chip:hover {
    background: rgba(6, 182, 212, 0.16);
  }

  .chip .x {
    font-size: 14px;
    opacity: 0.85;
  }

  .desc {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .textarea {
    width: 100%;
    min-height: 96px;
    resize: vertical;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    background: var(--bg-tertiary);
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: var(--text-base);
    line-height: 1.4;
  }

  .textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--border-glow);
  }

  .drawer-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .drawer-actions.split {
    justify-content: space-between;
  }

  .drawer-meta {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .drawer-meta .meta-row {
    display: grid;
    grid-template-columns: 90px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
  }

  .drawer-meta .k {
    font-size: 11px;
    color: var(--text-muted);
    letter-spacing: 0.6px;
    text-transform: uppercase;
  }

  .drawer-meta .v {
    font-size: 12px;
    color: var(--text-secondary);
    overflow-wrap: anywhere;
  }

  @media (max-width: 980px) {
    .form-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 560px) {
    .drawer {
      width: 100vw;
    }
  }
</style>
