<!-- Purpose: Bulk selection actions for the Asset library page. -->
<script lang="ts">
  export let selectedCount = 0;
  export let filteredCount = 0;
  export let bulkDeleteRunning = false;
  export let selectVisibleAssets: () => void = () => undefined;
  export let clearAssetSelection: () => void = () => undefined;
  export let deleteSelectedAssets: () => Promise<void> = async () => undefined;
</script>

<section class="bulk-panel" aria-label="Asset bulk actions">
  <div class="bulk-summary">
    <strong>{selectedCount}</strong>
    <span>selected</span>
  </div>
  <div class="bulk-actions">
    <button type="button" on:click={selectVisibleAssets} disabled={filteredCount === 0}>
      Select visible
    </button>
    <button type="button" on:click={clearAssetSelection} disabled={selectedCount === 0}>
      Clear
    </button>
    <button
      type="button"
      class="danger"
      on:click={deleteSelectedAssets}
      disabled={selectedCount === 0 || bulkDeleteRunning}
    >
      {bulkDeleteRunning ? 'Deleting…' : 'Delete selected'}
    </button>
  </div>
</section>

<style>
  .bulk-panel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    background: rgba(2, 6, 23, 0.34);
  }

  .bulk-summary,
  .bulk-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .bulk-summary strong {
    color: rgba(255, 255, 255, 0.95);
  }

  .bulk-summary span {
    color: rgba(226, 232, 240, 0.78);
    font-size: 12px;
  }

  .bulk-actions button {
    height: 30px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.88);
    font-size: 12px;
    padding: 0 12px;
    cursor: pointer;
  }

  .bulk-actions button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
  }

  .bulk-actions button.danger {
    border-color: rgba(248, 113, 113, 0.42);
    background: rgba(127, 29, 29, 0.32);
    color: rgba(254, 226, 226, 0.96);
  }

  .bulk-actions button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
