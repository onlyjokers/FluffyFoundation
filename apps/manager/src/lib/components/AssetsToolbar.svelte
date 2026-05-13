<!-- Purpose: Search, sort, filter, upload, refresh, and view controls for AssetsManager. -->
<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Select from '$lib/components/ui/Select.svelte';
  import type { AssetKind } from '$lib/stores/assets';
  import type { SortMode, ViewMode } from './assets-manager-helpers';

  export let filteredCount = 0;
  export let totalCount = 0;
  export let status: 'idle' | 'loading' | 'error' = 'idle';
  export let query = '';
  export let sortMode: SortMode = 'kind-newest';
  export let filtersOpen = false;
  export let activeAdvancedFilterCount = 0;
  export let viewMode: ViewMode = 'grid';
  export let filterKind: 'all' | AssetKind = 'all';
  export let filterFileType = 'all';
  export let filterTags = '';
  export let uploadedAfter = '';
  export let uploadedBefore = '';
  export let sizeMinMb = '';
  export let sizeMaxMb = '';
  export let fileTypeOptions: Array<{ value: string; label: string }> = [];
  export let uploadInput: HTMLInputElement | null = null;
  export let refreshAssets: () => Promise<void> = async () => undefined;
  export let openUploadPicker: () => void = () => undefined;
  export let onUploadChange: (event: Event) => void = () => undefined;

  function clearFilters(): void {
    filterFileType = 'all';
    filterTags = '';
    uploadedAfter = '';
    uploadedBefore = '';
    sizeMinMb = '';
    sizeMaxMb = '';
    filterKind = 'all';
    query = '';
  }
</script>

<div class="assets-toolbar-frame">
  <div class="assets-toolbar pill-toolbar" role="region" aria-label="Assets toolbar">
    <div class="toolbar-left">
      <div class="count-chip" title="Filtered count">
        {#if filteredCount === totalCount}
          {totalCount} items
        {:else}
          {filteredCount} / {totalCount} items
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
          <span class="filter-badge" aria-label="Active filter count">
            {activeAdvancedFilterCount}
          </span>
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
        <Button variant="ghost" size="sm" on:click={clearFilters}>Clear Filters</Button>
      </div>
    </div>
  {/if}
</div>

<style>
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

  .upload-input {
    display: none;
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
</style>
