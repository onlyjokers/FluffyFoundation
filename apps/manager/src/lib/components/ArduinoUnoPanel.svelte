<!--
Purpose: Manager-local Arduino UNO serial bridge controls and status.
-->
<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import {
    arduinoUnoSerialBridgeState,
    connectArduinoUno,
    disconnectArduinoUno,
  } from '$lib/hardware/arduino-uno/serial-bridge';

  $: bridge = $arduinoUnoSerialBridgeState;
  $: connected = bridge.status === 'connected';
  $: busy = bridge.status === 'connecting';
  $: unsupported = bridge.status === 'unsupported';

  function connect(): void {
    void connectArduinoUno();
  }

  function disconnect(): void {
    void disconnectArduinoUno();
  }
</script>

<Card title="Arduino UNO">
  <div class="panel">
    <div class="status-row">
      <span class="status-dot" class:ok={connected} class:error={bridge.status === 'error'}></span>
      <span class="status-text">{bridge.status}</span>
    </div>

    <div class="actions">
      <Button variant="primary" size="sm" on:click={connect} disabled={connected || busy || unsupported}>
        Connect
      </Button>
      <Button variant="ghost" size="sm" on:click={disconnect} disabled={!connected && bridge.status !== 'error'}>
        Disconnect
      </Button>
    </div>

    <dl class="metrics">
      <div>
        <dt>Active nodes</dt>
        <dd>{bridge.activeNodes}</dd>
      </div>
      <div>
        <dt>Pending</dt>
        <dd>{bridge.pendingCommands}</dd>
      </div>
      <div>
        <dt>Last command</dt>
        <dd>{bridge.lastCommand ?? '-'}</dd>
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

  .metrics {
    display: grid;
    gap: 8px;
    margin: 0;
  }

  .metrics div {
    display: flex;
    justify-content: space-between;
    gap: var(--space-md);
  }

  .metrics dt {
    color: var(--text-muted);
    font-size: var(--text-xs);
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
    font-size: var(--text-xs);
    line-height: 1.4;
  }
</style>
