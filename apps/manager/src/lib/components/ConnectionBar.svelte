<script lang="ts">
  import { connectionStatus, timeOffset } from '$lib/stores/domain/connection';
</script>

<div class="connection-bar">
  <span class="status-dot {$connectionStatus}"></span>
  {#if $connectionStatus !== 'connected'}
    <span class="status-text">
      {#if $connectionStatus === 'connecting'}
        Connecting...
      {:else if $connectionStatus === 'reconnecting'}
        Reconnecting...
      {:else if $connectionStatus === 'error'}
        Connection Error
      {:else}
        Disconnected
      {/if}
    </span>
  {/if}

  {#if $connectionStatus === 'connected'}
    <div class="time-display">
      <div class="time-pill">
        <span class="time-label">Offset</span>
        <span class="time-value">{$timeOffset > 0 ? '+' : ''}{$timeOffset.toFixed(0)}ms</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .connection-bar {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    min-height: 38px;
    padding: 8px 12px;
    max-width: 100%;
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 16px 44px rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(14px);
    white-space: nowrap;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-muted);
    opacity: 0.9;
  }

  .status-dot.connected {
    background: var(--color-success);
    box-shadow: 0 0 10px rgba(34, 197, 94, 0.6);
  }

  .status-dot.connecting,
  .status-dot.reconnecting {
    background: var(--color-warning);
    box-shadow: 0 0 10px rgba(245, 158, 11, 0.5);
  }

  .status-dot.error {
    background: var(--color-error);
    box-shadow: 0 0 10px rgba(239, 68, 68, 0.5);
  }

  .status-text {
    font-weight: 500;
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .time-display {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    white-space: nowrap;
  }

  .time-pill {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    padding: 0;
    border-radius: 0;
    border: none;
    background: transparent;
  }

  .time-label {
    font-size: var(--text-xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .time-value {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--text-primary);
  }

  @media (max-width: 900px) {
    .time-display {
      display: none;
    }
  }
</style>
