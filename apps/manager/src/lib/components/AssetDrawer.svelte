<!-- Purpose: Asset details drawer for previewing, editing, copying, saving, and deleting one asset. -->
<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Select from '$lib/components/ui/Select.svelte';
  import type { AssetKind, AssetRecord } from '$lib/stores/assets';
  import { formatAssetBytes, formatAssetDateTime } from './assets-manager-helpers';

  export let selected: AssetRecord;
  export let contentUrl: string | null = null;
  export let editName = '';
  export let editKind: AssetKind = 'audio';
  export let editTags: string[] = [];
  export let editDescription = '';
  export let tagDraft = '';
  export let saveError = '';
  export let isSaving = false;
  export let closeDrawer: () => void = () => undefined;
  export let copy: (text: string) => Promise<void> = async () => undefined;
  export let addTag: (raw: string) => void = () => undefined;
  export let removeTag: (tag: string) => void = () => undefined;
  export let deleteSelectedAsset: (asset: AssetRecord) => Promise<void> = async () => undefined;
  export let saveSelectedAsset: (asset: AssetRecord) => Promise<void> = async () => undefined;
</script>

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
      <video class="preview-media" src={contentUrl} controls playsinline preload="metadata"></video>
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
        bind:value={tagDraft}
        placeholder="e.g. intro, percussion, bg, loop…"
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
      <textarea class="textarea" bind:value={editDescription} placeholder="Optional notes…" />
    </div>

    {#if saveError}
      <div class="banner error">{saveError}</div>
    {/if}

    <div class="drawer-actions">
      <Button variant="secondary" size="sm" on:click={() => copy(`asset:${selected.id}`)}>
        Copy ref
      </Button>
      <Button variant="secondary" size="sm" on:click={() => copy(selected.sha256)}>Copy sha</Button>
      {#if contentUrl}
        <Button variant="secondary" size="sm" on:click={() => copy(contentUrl)}>Copy URL</Button>
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
        <div class="v mono">{formatAssetBytes(selected.sizeBytes)}</div>
      </div>
      <div class="meta-row">
        <div class="k">Created</div>
        <div class="v mono">{formatAssetDateTime(selected.createdAt)}</div>
      </div>
      <div class="meta-row">
        <div class="k">Updated</div>
        <div class="v mono">{formatAssetDateTime(selected.updatedAt)}</div>
      </div>
    </div>
  </div>
</aside>

<style>
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

  .tags-editor,
  .desc {
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

  .meta-row {
    display: grid;
    grid-template-columns: 90px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
  }

  .k {
    font-size: 11px;
    color: var(--text-muted);
    letter-spacing: 0.6px;
    text-transform: uppercase;
  }

  .v {
    font-size: 12px;
    color: var(--text-secondary);
    overflow-wrap: anywhere;
  }

  .mono {
    font-family: var(--font-mono);
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
