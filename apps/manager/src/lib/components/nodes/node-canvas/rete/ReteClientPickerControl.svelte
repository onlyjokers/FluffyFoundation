<!-- Purpose: Renders compact client selection dots for Rete client picker controls. -->
<script lang="ts">
  import type { ClientInfo } from '@shugu/protocol';

  type ClientPickerItem = {
    client: ClientInfo;
    selected: boolean;
    primary: boolean;
  };

  export let data: Record<string, any>;
  export let hasLabel = false;
  export let audienceClients: Record<string, any>[] = [];
  export let emptyLabel = 'No clients connected';
  export let clientPickerInputLocked = false;
  export let clientPickerView: ClientPickerItem[] = [];
  export let clientLabel: (client: ClientInfo) => string;
  export let readinessClass: (clientId: string, connected?: boolean) => string;
  export let pickClient: (clientId: string) => void;
</script>

<div class="client-picker">
  {#if hasLabel}
    <div class="control-label">{data.label}</div>
  {/if}
  {#if (audienceClients ?? []).length === 0}
    <div class="client-empty">{emptyLabel}</div>
  {:else}
    <div class="client-grid {clientPickerInputLocked ? 'locked' : ''}">
      {#each clientPickerView as item (item.client.clientId)}
        <button
          type="button"
          class="client-dot-btn {item.primary ? 'primary' : ''} {item.selected ? 'selected' : ''}"
          title={clientLabel(item.client)}
          aria-label={clientLabel(item.client)}
          aria-pressed={item.selected}
          disabled={data.readonly || clientPickerInputLocked}
          on:pointerdown|stopPropagation
          on:click|stopPropagation={() => pickClient(item.client.clientId)}
        >
          <span class="client-dot {readinessClass(item.client.clientId, item.client.connected)}"
          ></span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .control-label {
    font-size: 11px;
    letter-spacing: 0.2px;
    color: rgba(255, 255, 255, 0.72);
  }

  .client-picker {
    padding: 6px 8px 10px;
  }

  .client-empty {
    padding: 10px 8px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
  }

  .client-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    max-height: 160px;
    overflow: auto;
    padding-right: 2px;
  }

  .client-grid.locked {
    opacity: 0.75;
  }

  .client-dot-btn {
    width: 18px;
    height: 18px;
    padding: 0;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(2, 6, 23, 0.35);
    color: rgba(255, 255, 255, 0.88);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .client-dot-btn:hover {
    border-color: rgba(99, 102, 241, 0.35);
    background: rgba(2, 6, 23, 0.45);
  }

  .client-dot-btn:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .client-dot-btn.selected {
    border-color: rgba(99, 102, 241, 0.65);
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
  }

  .client-dot-btn.primary {
    border-color: rgba(99, 102, 241, 0.85);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.18);
  }

  .client-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: rgba(250, 204, 21, 0.92);
    box-shadow: 0 0 0 2px rgba(250, 204, 21, 0.18);
    flex: 0 0 auto;
  }

  .client-dot.disconnected {
    background: rgba(148, 163, 184, 0.9);
    box-shadow: none;
  }

  .client-dot.error {
    background: rgba(239, 68, 68, 0.92);
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.18);
  }

  .client-dot.connected,
  .client-dot.loading {
    background: rgba(250, 204, 21, 0.92);
    box-shadow: 0 0 0 2px rgba(250, 204, 21, 0.18);
  }

  .client-dot.ready {
    background: rgba(34, 197, 94, 0.9);
    box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.16);
  }
</style>
