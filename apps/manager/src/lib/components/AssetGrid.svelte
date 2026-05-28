<!-- Purpose: Grid presentation for asset library results. -->
<script lang="ts">
  import type { AssetRecord } from '$lib/stores/assets';
  import {
    formatAssetBytes,
    formatAssetSourceLabel,
    kindPillLabel,
    kindTone,
    shortAssetId,
  } from './assets-manager-helpers';

  export let assets: AssetRecord[] = [];
  export let selectedId: string | null = null;
  export let drawerOpen = false;
  export let buildAssetContentUrl: (assetId: string) => string | null = () => null;
  export let openDrawer: (assetId: string) => void = () => undefined;
</script>

<div class="grid">
  {#each assets as a (a.id)}
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
          <video class="thumb-media" src={contentUrl} muted playsinline preload="metadata"></video>
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
          <span class="pill source">{formatAssetSourceLabel(a.source)}</span>
          <span class="meta-text mono">{formatAssetBytes(a.sizeBytes)}</span>
          <span class="meta-text mono">{shortAssetId(a.id)}</span>
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

<style>
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

  .pill.source {
    text-transform: none;
    letter-spacing: 0;
    color: rgba(186, 230, 253, 0.92);
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
</style>
