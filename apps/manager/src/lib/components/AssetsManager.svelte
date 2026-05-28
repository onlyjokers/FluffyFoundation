<!-- Purpose: Asset library UI for browsing/uploading/tagging media assets stored in the Asset Service. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import AssetDrawer from './AssetDrawer.svelte';
  import AssetEmptyState from './AssetEmptyState.svelte';
  import AssetGrid from './AssetGrid.svelte';
  import AssetList from './AssetList.svelte';
  import AssetUploadQueue from './AssetUploadQueue.svelte';
  import AssetsToolbar from './AssetsToolbar.svelte';
  import { assetsStore, type AssetKind, type AssetRecord } from '$lib/stores/assets';
  import {
    buildFileTypeOptions,
    formatAssetBytes,
    formatCapacityPercent,
    getActiveAdvancedFilterCount,
    getFilteredSortedAssets,
    inferAssetKindFromFileLike as inferKindFromFile,
    type SortMode,
    type UploadItem,
    type ViewMode,
  } from './assets-manager-helpers';

  export let serverUrl: string;

  const storageKeyReadToken = 'shugu-asset-read-token';
  const storageKeyAssetsView = 'shugu-assets-view';

  let assets: AssetRecord[] = [];
  let usage = {
    totalBytes: 0,
    discardableBytes: 0,
    protectedBytes: 0,
    maxTotalBytes: 20 * 1024 * 1024 * 1024,
  };
  let settings = { maxTotalBytes: 20 * 1024 * 1024 * 1024 };
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

  let readToken = '';

  let selectedId: string | null = null;
  let drawerOpen = false;

  let uploadInput: HTMLInputElement | null = null;
  let uploadQueue: UploadItem[] = [];
  let uploaderRunning = false;
  let isDragActive = false;
  let uploadError = '';
  let capacityDraftGb = '20';
  let capacitySaving = false;
  let capacityError = '';
  let capacityEditing = false;
  let lastSettingsMaxTotalBytes = 0;

  let editName = '';
  let editKind: AssetKind = 'audio';
  let editTags: string[] = [];
  let editDescription = '';
  let tagDraft = '';
  let isSaving = false;
  let saveError = '';
  let editorAssetId: string | null = null;

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
      return await fetch(url, { ...init, credentials: 'include', signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function refreshAssets(): Promise<void> {
    uploadError = '';
    await assetsStore.refresh({ serverUrl });
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
    const url = buildUrl('api/assets');
    const kind = inferKindFromFile(file);

    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.set('file', file);
      formData.set('originalName', file.name);
      formData.set('kind', kind);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.withCredentials = true;
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
      const res = await fetchWithTimeout(
        buildUrl(`api/assets/${asset.id}`),
        { method: 'DELETE', credentials: 'include' },
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
          credentials: 'include',
          headers: {
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

  async function saveCapacitySetting(): Promise<void> {
    capacityError = '';
    const gb = Number(capacityDraftGb);
    if (!Number.isFinite(gb) || gb <= 0) {
      capacityError = 'Capacity must be greater than 0 GB.';
      return;
    }
    capacitySaving = true;
    try {
      await assetsStore.updateSettings(
        { maxTotalBytes: Math.floor(gb * 1024 * 1024 * 1024) },
        { serverUrl }
      );
      await refreshAssets();
    } catch (err) {
      capacityError = err instanceof Error ? err.message : String(err);
    } finally {
      capacitySaving = false;
    }
  }

  $: fileTypeOptions = buildFileTypeOptions(assets);
  $: activeAdvancedFilterCount = getActiveAdvancedFilterCount({
    query,
    filterKind,
    filterFileType,
    filterTags,
    uploadedAfter,
    uploadedBefore,
    sizeMinMb,
    sizeMaxMb,
  });
  $: filtered = getFilteredSortedAssets(assets, {
    query,
    filterKind,
    filterFileType,
    filterTags,
    uploadedAfter,
    uploadedBefore,
    sizeMinMb,
    sizeMaxMb,
    sortMode,
  });

  $: selected = selectedId ? (assets.find((a) => a.id === selectedId) ?? null) : null;
  $: if (drawerOpen && selected && selected.id !== editorAssetId) {
    editorAssetId = selected.id;
    ensureDrawerEditState(selected);
  }
  $: if (drawerOpen && !selected && editorAssetId !== null) {
    editorAssetId = null;
    ensureDrawerEditState(null);
  }

  $: ({ status, error: errorMessage, assets, usage, settings } = $assetsStore);
  $: capacityPercent = formatCapacityPercent(usage.totalBytes, usage.maxTotalBytes);
  $: if (!capacitySaving && !capacityEditing && settings.maxTotalBytes !== lastSettingsMaxTotalBytes) {
    lastSettingsMaxTotalBytes = settings.maxTotalBytes;
    const nextGb = Math.round((settings.maxTotalBytes / (1024 * 1024 * 1024)) * 10) / 10;
    capacityDraftGb = String(nextGb);
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
  <AssetsToolbar
    filteredCount={filtered.length}
    totalCount={assets.length}
    {status}
    bind:query
    bind:sortMode
    bind:filtersOpen
    {activeAdvancedFilterCount}
    bind:viewMode
    bind:filterKind
    bind:filterFileType
    bind:filterTags
    bind:uploadedAfter
    bind:uploadedBefore
    bind:sizeMinMb
    bind:sizeMaxMb
    {fileTypeOptions}
    bind:uploadInput
    {refreshAssets}
    {openUploadPicker}
    {onUploadChange}
  />

  <div class="assets-scroll">
    {#if uploadError}
      <div class="banner error">{uploadError}</div>
    {/if}

    {#if status === 'error'}
      <div class="banner error">{errorMessage ?? 'Unknown error'}</div>
    {/if}

    <section class="capacity-panel" aria-label="Asset capacity">
      <div class="capacity-main">
        <div>
          <div class="capacity-title">Asset Capacity</div>
          <div class="capacity-meta">
            {formatAssetBytes(usage.totalBytes)} used / {formatAssetBytes(usage.maxTotalBytes)}
            <span>AI reclaimable {formatAssetBytes(usage.discardableBytes)}</span>
          </div>
        </div>
        <div class="capacity-control">
          <label for="asset-capacity-gb">Max GB</label>
          <input
            id="asset-capacity-gb"
            type="number"
            min="0.1"
            step="0.1"
            bind:value={capacityDraftGb}
            on:focus={() => (capacityEditing = true)}
            on:blur={() => (capacityEditing = false)}
          />
          <button type="button" on:click={saveCapacitySetting} disabled={capacitySaving}>
            {capacitySaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      <div class="capacity-bar" aria-hidden="true">
        <div class="capacity-fill" style={`width: ${capacityPercent}%`}></div>
      </div>
      {#if capacityError}
        <div class="capacity-error">{capacityError}</div>
      {/if}
    </section>

    {#if status === 'loading' && assets.length === 0}
      <AssetEmptyState title="Loading assets…" />
    {:else if filtered.length === 0}
      <AssetEmptyState title="No matching assets" hint="Try clearing filters, or upload files by dragging them here." />
    {:else if viewMode === 'grid'}
      <AssetGrid
        assets={filtered}
        {selectedId}
        {drawerOpen}
        {buildAssetContentUrl}
        {openDrawer}
      />
    {:else}
      <AssetList assets={filtered} {openDrawer} />
    {/if}

    <AssetUploadQueue {uploadQueue} />
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
    <AssetDrawer
      {selected}
      {contentUrl}
      bind:editName
      bind:editKind
      bind:editTags
      bind:editDescription
      bind:tagDraft
      {saveError}
      {isSaving}
      {closeDrawer}
      {copy}
      {addTag}
      {removeTag}
      {deleteSelectedAsset}
      {saveSelectedAsset}
    />
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

  .capacity-panel {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    background: rgba(2, 6, 23, 0.36);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .capacity-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  .capacity-title {
    font-size: 13px;
    font-weight: 800;
  }

  .capacity-meta {
    margin-top: 4px;
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    color: var(--text-secondary);
    font-size: 12px;
  }

  .capacity-control {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }

  .capacity-control input {
    width: 86px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(15, 23, 42, 0.7);
    color: var(--text-primary);
    padding: 6px 8px;
  }

  .capacity-control button {
    border: 1px solid rgba(6, 182, 212, 0.36);
    border-radius: 8px;
    background: rgba(6, 182, 212, 0.16);
    color: var(--text-primary);
    padding: 6px 10px;
    cursor: pointer;
  }

  .capacity-control button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .capacity-bar {
    height: 7px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .capacity-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #22c55e, #06b6d4);
  }

  .capacity-error {
    color: #fecaca;
    font-size: 12px;
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

</style>
