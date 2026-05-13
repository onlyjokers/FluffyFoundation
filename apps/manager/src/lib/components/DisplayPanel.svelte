<!--
Purpose: Display panel (Phase 5) - show Local/Remote Display status and controls.
-->

<script lang="ts">
  import { displayClients, clientReadiness, sendToDisplayEnabled } from '$lib/stores/domain/display-status';
  import {
    closeDisplay,
    displayBridgeState,
    openDisplay,
    pairDisplay,
  } from '$lib/display/display-bridge';
  import type { ClientInfo } from '@shugu/protocol';
  import { formatClientId } from '@shugu/ui-kit';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Toggle from '$lib/components/ui/Toggle.svelte';

  export let serverUrl = '';

  $: bridge = $displayBridgeState;
  $: hasLocal = bridge.status !== 'idle' && bridge.status !== 'closed';
  $: hasRemote = $displayClients.length > 0;
  $: hasAnyDisplay = hasLocal || hasRemote;

  function readinessFor(
    client: ClientInfo
  ): { label: string; color: 'muted' | 'ready'; readyAt: number | null; manifestId: string | null } {
    if (client.connected === false) {
      return { label: 'offline', color: 'muted', readyAt: null, manifestId: null };
    }
    const info = $clientReadiness.get(client.clientId);
    if (!info) return { label: 'connected', color: 'muted', readyAt: null, manifestId: null };
    if (info.status === 'assets-ready') {
      return {
        label: 'ready',
        color: 'ready',
        readyAt: typeof info.updatedAt === 'number' ? info.updatedAt : null,
        manifestId: typeof info.manifestId === 'string' ? info.manifestId : null,
      };
    }
    if (info.status === 'assets-loading') return { label: 'loading', color: 'muted', readyAt: null, manifestId: null };
    if (info.status === 'assets-error') return { label: 'error', color: 'muted', readyAt: null, manifestId: null };
    return { label: 'connected', color: 'muted', readyAt: null, manifestId: null };
  }

  function formatTime(ts: number | null): string {
    if (!ts) return '-';
    try {
      return new Date(ts).toLocaleTimeString();
    } catch {
      return '-';
    }
  }
</script>

<Card title="🖥️ Display">
  <div class="panel">
    <div class="section">
      <div class="section-title">Local Display (MessagePort)</div>
      <div class="row muted">
        <span>status={bridge.status}</span>
        <span>ready={bridge.ready ? 'yes' : 'no'}</span>
        <span>readyAt={formatTime(bridge.readyAt)}</span>
        <span>manifest={bridge.readyManifestId ?? '-'}</span>
      </div>

      <div class="row">
        <Button variant="primary" size="sm" on:click={() => openDisplay({ serverUrl })}>Open</Button>
        <Button variant="ghost" size="sm" on:click={() => pairDisplay()} disabled={!hasLocal}
          >Reconnect</Button
        >
        <Button variant="danger" size="sm" on:click={() => closeDisplay()} disabled={!hasLocal}
          >Close</Button
        >
      </div>
    </div>

    <div class="divider"></div>

    <div class="section">
      <div class="section-title">Remote Display (Server group=display)</div>
      {#if !hasRemote}
        <div class="row muted">No remote display connected</div>
      {:else}
        <div class="remote-list">
          {#each $displayClients as client (client.clientId)}
            {@const r = readinessFor(client)}
            <div class="remote-item">
              <div class="remote-main">
                <div class="remote-id">{formatClientId(client.clientId)}</div>
                <div class="remote-meta muted">
                  <span>connectedAt={new Date(client.connectedAt).toLocaleTimeString()}</span>
                  <span class={r.color === 'ready' ? 'ready' : ''}>status={r.label}</span>
                  {#if r.readyAt}
                    <span class={r.color === 'ready' ? 'ready' : ''}>readyAt={formatTime(r.readyAt)}</span>
                  {/if}
                  {#if r.manifestId}
                    <span class={r.color === 'ready' ? 'ready' : ''}>manifest={r.manifestId}</span>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    {#if hasAnyDisplay}
      <div class="divider"></div>
      <div class="section">
        <Toggle
          bind:checked={$sendToDisplayEnabled}
          label="Send To Display"
          description="Mirror showImage/playMedia/screenColor to Display (Local priority, Server fallback)"
        />
      </div>
    {/if}
  </div>
</Card>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .section-title {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-primary);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-sm);
  }

  .muted {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .divider {
    height: 1px;
    background: var(--border-color);
    opacity: 0.6;
  }

  .remote-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .remote-item {
    padding: 8px 10px;
    border-radius: var(--radius-md);
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.03);
  }

  .remote-main {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .remote-id {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    color: var(--text-primary);
  }

  .remote-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
  }

  .ready {
    color: var(--color-success);
    font-weight: 600;
  }
</style>
