<!--
Purpose: FF-20 operator console showing live health, failures, readiness, and command reports.
-->
<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import { operatorConsoleSnapshot } from '$lib/stores/domain/operator-console-store';
  import { diagnoseFailedDisplayUpdate } from '$lib/stores/domain/operator-console';
</script>

<Card title="Operator Console">
  {@const snapshot = $operatorConsoleSnapshot}
  {@const diagnosis = diagnoseFailedDisplayUpdate(snapshot)}
  <section class="operator-console" data-ff20-operator-console>
    <div class="status-strip">
      <div class="health {snapshot.health.status}" data-ff20-health>
        <span>{snapshot.health.status}</span>
        <small>{snapshot.health.connectionStatus}</small>
      </div>
      <div>
        <span class="metric">{snapshot.connectedDevices.online}/{snapshot.connectedDevices.total}</span>
        <small>devices online</small>
      </div>
      <div>
        <span class="metric">{snapshot.connectedDevices.displayOnline}</span>
        <small>displays</small>
      </div>
      <div>
        <span class="metric">{snapshot.metrics.commandOutcomes.failed}</span>
        <small>failed commands</small>
      </div>
    </div>

    <div class="section-grid">
      <div class="console-section" data-ff20-partitions>
        <h4>Active Partitions</h4>
        {#if snapshot.activePartitions.length > 0}
          <ul>
            {#each snapshot.activePartitions as partition}
              <li>{partition}</li>
            {/each}
          </ul>
        {:else}
          <p class="muted">none</p>
        {/if}
      </div>

      <div class="console-section" data-ff20-transfers>
        <h4>Pending Transfers</h4>
        {#if snapshot.pendingTransfers.length > 0}
          <ul>
            {#each snapshot.pendingTransfers as transfer}
              <li>{transfer.groupId} -> {transfer.targetClientId || transfer.transferId}</li>
            {/each}
          </ul>
        {:else}
          <p class="muted">none</p>
        {/if}
      </div>

      <div class="console-section" data-ff20-kill-switch>
        <h4>Kill Switch</h4>
        <p class:active={snapshot.killSwitch.active}>{snapshot.killSwitch.active ? 'active' : 'clear'}</p>
      </div>

      <div class="console-section" data-ff20-failed-commands>
        <h4>Failed Commands</h4>
        {#if snapshot.failedCommands.length > 0}
          <ul>
            {#each snapshot.failedCommands.slice(0, 4) as failure}
              <li>
                <span>{failure.category}</span>
                <small>{failure.targetId ?? 'system'}: {failure.message}</small>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="muted">none</p>
        {/if}
      </div>
    </div>

    <div class="diagnosis" data-ff20-display-diagnosis>
      <span>{diagnosis.status}</span>
      <small>{diagnosis.summary}</small>
    </div>
  </section>
</Card>

<style>
  .operator-console {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .status-strip,
  .section-grid {
    display: grid;
    gap: var(--space-sm);
  }

  .status-strip {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .status-strip > div,
  .console-section,
  .diagnosis {
    min-width: 0;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: rgba(255, 255, 255, 0.03);
    padding: var(--space-sm);
  }

  .health,
  .status-strip > div {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .health span,
  .metric {
    color: var(--text-primary);
    font-size: var(--text-lg);
    font-weight: 700;
    text-transform: capitalize;
  }

  .health.degraded span,
  .active {
    color: var(--color-error);
  }

  small,
  .muted {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .section-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  h4 {
    margin: 0 0 var(--space-xs) 0;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    text-transform: uppercase;
  }

  ul {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    color: var(--text-primary);
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
  }

  .console-section p,
  .diagnosis {
    margin: 0;
  }

  .diagnosis {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .diagnosis span {
    color: var(--text-primary);
    font-weight: 700;
  }

  @media (max-width: 820px) {
    .status-strip,
    .section-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
