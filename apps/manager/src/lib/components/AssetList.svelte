<!-- Purpose: Table-like list presentation for asset library results. -->
<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import type { AssetRecord } from '$lib/stores/assets';
  import {
    formatAssetBytes,
    formatAssetDateTime,
    kindPillLabel,
    shortAssetId,
  } from './assets-manager-helpers';

  export let assets: AssetRecord[] = [];
  export let openDrawer: (assetId: string) => void = () => undefined;
</script>

<Card class="list-card">
  <div class="list">
    <div class="list-head">
      <div>Name</div>
      <div>Kind</div>
      <div>Size</div>
      <div>Created</div>
      <div>ID</div>
    </div>
    {#each assets as a (a.id)}
      <button class="list-row" type="button" on:click={() => openDrawer(a.id)}>
        <div class="cell name" title={a.originalName}>{a.originalName}</div>
        <div class="cell"><span class="pill">{kindPillLabel(a.kind)}</span></div>
        <div class="cell mono">{formatAssetBytes(a.sizeBytes)}</div>
        <div class="cell mono">{formatAssetDateTime(a.createdAt)}</div>
        <div class="cell mono" title={a.id}>{shortAssetId(a.id)}</div>
      </button>
    {/each}
  </div>
</Card>

<style>
  :global(.list-card) {
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

  .mono {
    font-family: var(--font-mono);
  }
</style>
