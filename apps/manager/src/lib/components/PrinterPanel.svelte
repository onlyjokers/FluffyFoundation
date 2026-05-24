<!--
Purpose: Manager-local printer discovery, connection, and print queue status panel.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Toggle from '$lib/components/ui/Toggle.svelte';
  import {
    configurePrinterBridge,
    connectCurrentPrinters,
    connectPrinter,
    disconnectAllPrinters,
    disconnectPrinter,
    printerBridgeState,
    refreshPrinters,
    setPrinterAutoConnect,
  } from '$lib/hardware/printer/printer-bridge';

  export let serverUrl = '';

  $: bridge = $printerBridgeState;
  $: connectedIds = new Set(bridge.connectedPrinterIds);
  $: busy = bridge.status === 'connecting';
  $: autoConnect = bridge.autoConnectCurrentPrinters;
  $: if (serverUrl) configurePrinterBridge(serverUrl);

  onMount(() => {
    if (serverUrl) configurePrinterBridge(serverUrl);
  });

  function connectAll(): void {
    void connectCurrentPrinters();
  }

  function refresh(): void {
    void refreshPrinters();
  }

  function toggleAutoConnect(next: boolean): void {
    setPrinterAutoConnect(next);
  }

  function handleAutoConnectChange(event: Event): void {
    const input = event.currentTarget;
    toggleAutoConnect(input instanceof HTMLInputElement ? input.checked : false);
  }
</script>

<Card title="Printer">
  <div class="panel">
    <div class="status-row">
      <span class="status-dot" class:ok={bridge.status === 'connected'} class:error={bridge.status === 'error'}></span>
      <span class="status-text">{bridge.status}</span>
    </div>

    <div class="actions">
      <Button variant="primary" size="sm" on:click={connectAll} disabled={busy}>
        {bridge.connectedPrinterIds.length > 0 ? 'Add Current' : 'Connect'}
      </Button>
      <Button variant="ghost" size="sm" on:click={refresh}>Refresh</Button>
      <Button variant="ghost" size="sm" on:click={() => disconnectAllPrinters()} disabled={bridge.connectedPrinterIds.length === 0}>
        Disconnect
      </Button>
    </div>

    <Toggle
      label="Auto connect current printers"
      description="Reconnect saved printer ids on next Manager login."
      checked={autoConnect}
      on:change={handleAutoConnectChange}
    />

    <div class="printer-list">
      {#if bridge.printers.length === 0}
        <p class="empty">No CUPS printers detected.</p>
      {:else}
        {#each bridge.printers as printer (printer.id)}
          <div class="printer-row">
            <div>
              <div class="printer-name">{printer.name}</div>
              <div class="printer-meta">
                {printer.status}{printer.isDefault ? ' · default' : ''}
              </div>
            </div>
            {#if connectedIds.has(printer.id)}
              <Button variant="ghost" size="sm" on:click={() => disconnectPrinter(printer.id)}>Disconnect</Button>
            {:else}
              <Button variant="secondary" size="sm" on:click={() => void connectPrinter(printer.id)}>Add</Button>
            {/if}
          </div>
        {/each}
      {/if}
      {#each bridge.unavailableAutoConnectPrinterIds as printerId (printerId)}
        <div class="printer-row unavailable">
          <div>
            <div class="printer-name">{printerId}</div>
            <div class="printer-meta">unavailable</div>
          </div>
        </div>
      {/each}
    </div>

    <dl class="metrics">
      <div>
        <dt>Connected</dt>
        <dd>{bridge.connectedPrinterIds.length}</dd>
      </div>
      <div>
        <dt>Active routes</dt>
        <dd>{bridge.activeRoutes}</dd>
      </div>
      <div>
        <dt>Pending</dt>
        <dd>{bridge.pendingJobs}</dd>
      </div>
      <div>
        <dt>Last job</dt>
        <dd>{bridge.lastJob ? `${bridge.lastJob.printerId} ${bridge.lastJob.jobId ?? '-'}` : '-'}</dd>
      </div>
    </dl>

    {#if bridge.lastError}
      <p class="error-text">{bridge.lastError}</p>
    {/if}
  </div>
</Card>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .status-row,
  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: var(--text-muted);
  }

  .status-dot.ok {
    background: var(--color-success);
  }

  .status-dot.error {
    background: var(--color-danger);
  }

  .status-text {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-primary);
  }

  .printer-list,
  .metrics {
    display: grid;
    gap: 8px;
  }

  .printer-row,
  .metrics div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
  }

  .printer-row {
    min-height: 34px;
    padding: 6px 0;
    border-top: 1px solid var(--border-color);
  }

  .printer-row.unavailable {
    color: var(--text-muted);
  }

  .printer-name {
    color: var(--text-primary);
    font-size: var(--text-sm);
    font-weight: 600;
    word-break: break-word;
  }

  .printer-meta,
  .empty,
  .metrics dt,
  .error-text {
    font-size: var(--text-xs);
  }

  .printer-meta,
  .empty,
  .metrics dt {
    color: var(--text-muted);
  }

  .empty,
  .metrics {
    margin: 0;
  }

  .metrics dd {
    margin: 0;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    text-align: right;
    word-break: break-word;
  }

  .error-text {
    margin: 0;
    color: var(--color-danger);
    line-height: 1.4;
  }
</style>
