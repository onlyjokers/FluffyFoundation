<!-- Purpose: Executor log panel for a loop/client. -->
<script lang="ts">
  // @ts-nocheck
  type ExecutorLogEntry = { at: number; event: string; error?: string };
  type ExecutorStatus = { log: ExecutorLogEntry[] };

  export let clientId = '';
  export let status: ExecutorStatus | null = null;
  export let onClose: () => void = () => undefined;
</script>

<div class="executor-logs" on:pointerdown|stopPropagation>
  <div class="executor-logs-header">
    <div class="executor-logs-title">node-executor logs · {clientId || 'unknown client'}</div>
    <button class="executor-logs-close" type="button" on:click={onClose}>✕</button>
  </div>

  <div class="executor-logs-body">
    {#if !status || status.log.length === 0}
      <div class="executor-logs-empty">No logs yet.</div>
    {:else}
      {#each [...status.log].reverse() as entry (entry.at + ':' + entry.event)}
        <div class="executor-logs-row">
          <span class="executor-logs-at">{new Date(entry.at).toLocaleTimeString()}</span>
          <span class="executor-logs-event">{entry.event}</span>
          {#if entry.error}
            <span class="executor-logs-error" title={entry.error}>{entry.error}</span>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .executor-logs {
    position: absolute;
    top: 54px;
    right: 14px;
    width: 420px;
    max-width: calc(100% - 28px);
    max-height: min(320px, calc(100% - 78px));
    z-index: 30;
    overflow: hidden;
    border-radius: 14px;
    background: rgba(15, 23, 42, 0.95);
    border: 1px solid rgba(99, 102, 241, 0.35);
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(14px);
    display: flex;
    flex-direction: column;
  }

  .executor-logs-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 10px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    gap: 10px;
  }

  .executor-logs-title {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.82);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .executor-logs-close {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 6, 23, 0.25);
    color: rgba(255, 255, 255, 0.8);
    border-radius: 10px;
    padding: 4px 8px;
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
  }

  .executor-logs-close:hover {
    border-color: rgba(99, 102, 241, 0.55);
    background: rgba(2, 6, 23, 0.32);
  }

  .executor-logs-body {
    padding: 10px 10px 12px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .executor-logs-row {
    display: grid;
    grid-template-columns: 76px 80px 1fr;
    gap: 10px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.78);
    align-items: baseline;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(2, 6, 23, 0.22);
    border-radius: 12px;
    padding: 8px 10px;
  }

  .executor-logs-at {
    color: rgba(148, 163, 184, 0.9);
    font-variant-numeric: tabular-nums;
  }

  .executor-logs-event {
    font-weight: 700;
    letter-spacing: 0.1px;
  }

  .executor-logs-error {
    color: rgba(248, 113, 113, 0.95);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .executor-logs-empty {
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
  }
</style>
