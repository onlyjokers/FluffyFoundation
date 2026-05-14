<!--
Purpose: Manager Plugins tab for plugin lifecycle, capabilities, and compatibility visibility.
-->
<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import { managerPluginStore } from '$lib/plugins/manager-plugin-store';

  const formatBudget = (budget?: { memoryMb?: number; cpuMsPerTick?: number; networkKbps?: number }) => {
    if (!budget) return 'unbounded';
    const parts = [];
    if (budget.memoryMb !== undefined) parts.push(`${budget.memoryMb} MB`);
    if (budget.cpuMsPerTick !== undefined) parts.push(`${budget.cpuMsPerTick} ms/tick`);
    if (budget.networkKbps !== undefined) parts.push(`${budget.networkKbps} kbps`);
    return parts.length > 0 ? parts.join(' / ') : 'unbounded';
  };
</script>

<Card title="Plugins">
  <section class="plugins-panel" data-manager-plugins-panel>
    <div class="plugin-summary">
      <div>
        <span class="metric">{$managerPluginStore.plugins.length}</span>
        <small>installed</small>
      </div>
      <div>
        <span class="metric">{$managerPluginStore.plugins.filter((plugin) => plugin.state === 'active').length}</span>
        <small>active</small>
      </div>
      <div>
        <span class="metric">{$managerPluginStore.plugins.filter((plugin) => !plugin.compatible).length}</span>
        <small>incompatible</small>
      </div>
    </div>

    <div class="plugin-list">
      {#each $managerPluginStore.plugins as plugin}
        <article class:error={plugin.state === 'error'} class:inactive={plugin.state !== 'active'} class="plugin-row">
          <div class="plugin-main">
            <div class="plugin-title">
              <h4>{plugin.id}</h4>
              <span class="state {plugin.state}">{plugin.state}</span>
            </div>
            <p>{plugin.description ?? 'No description.'}</p>
            <dl>
              <div>
                <dt>Version</dt>
                <dd>{plugin.version}</dd>
              </div>
              <div>
                <dt>Capabilities</dt>
                <dd>{plugin.capabilities.join(', ') || 'none'}</dd>
              </div>
              <div>
                <dt>Side effects</dt>
                <dd>{plugin.sideEffects.join(', ') || 'none'}</dd>
              </div>
              <div>
                <dt>Budget</dt>
                <dd>{formatBudget(plugin.resourceBudget)}</dd>
              </div>
              {#if plugin.lastError}
                <div>
                  <dt>Last error</dt>
                  <dd class="error-text">{plugin.lastError}</dd>
                </div>
              {/if}
            </dl>
          </div>
          <div class="plugin-actions">
            <Button
              size="sm"
              variant="secondary"
              disabled={!plugin.compatible || plugin.state === 'active'}
              on:click={() => managerPluginStore.activate(plugin.id)}
            >
              Activate
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!plugin.compatible || plugin.state !== 'active'}
              on:click={() => managerPluginStore.configure(plugin.id)}
            >
              Configure
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!plugin.compatible || plugin.state !== 'active'}
              on:click={() => managerPluginStore.stop(plugin.id)}
            >
              Stop
            </Button>
          </div>
        </article>
      {/each}
    </div>
  </section>
</Card>

<style>
  .plugins-panel {
    display: grid;
    gap: var(--space-md);
  }

  .plugin-summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-sm);
  }

  .plugin-summary > div,
  .plugin-row {
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: rgba(255, 255, 255, 0.03);
  }

  .plugin-summary > div {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-sm);
  }

  .metric {
    color: var(--text-primary);
    font-size: var(--text-lg);
    font-weight: 700;
  }

  small {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .plugin-list {
    display: grid;
    gap: var(--space-sm);
  }

  .plugin-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-md);
    padding: var(--space-md);
  }

  .plugin-row.error {
    border-color: rgba(239, 68, 68, 0.5);
  }

  .plugin-row.inactive {
    background: rgba(255, 255, 255, 0.02);
  }

  .plugin-main,
  dl {
    display: grid;
    gap: var(--space-xs);
    min-width: 0;
  }

  .plugin-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
  }

  h4,
  p,
  dl {
    margin: 0;
  }

  h4 {
    color: var(--text-primary);
    font-size: var(--text-md);
  }

  p,
  dt {
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  dl div {
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    gap: var(--space-sm);
  }

  dt {
    color: var(--text-muted);
  }

  dd {
    margin: 0;
    color: var(--text-primary);
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
  }

  .state {
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 2px 8px;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    text-transform: uppercase;
  }

  .state.active {
    border-color: rgba(34, 197, 94, 0.45);
    color: #86efac;
  }

  .state.error,
  .error-text {
    color: var(--color-error);
  }

  .plugin-actions {
    display: flex;
    align-items: flex-start;
    gap: var(--space-xs);
  }

  @media (max-width: 760px) {
    .plugin-summary,
    .plugin-row {
      grid-template-columns: 1fr;
    }

    dl div {
      grid-template-columns: 1fr;
      gap: 2px;
    }
  }
</style>
