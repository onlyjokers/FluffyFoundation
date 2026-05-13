<!-- Purpose: Recent upload progress panel for AssetsManager. -->
<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import type { UploadItem } from './assets-manager-helpers';

  export let uploadQueue: UploadItem[] = [];
</script>

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

<style>
  :global(.upload-queue) {
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
</style>
