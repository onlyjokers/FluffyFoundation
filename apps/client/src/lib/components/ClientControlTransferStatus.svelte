<!--
Purpose: Show FF-13 target-client transfer confirmation and status controls.
-->
<script lang="ts">
  import type { ClientControlTransferOffer } from '@shugu/protocol';
  import { formatClientControlTransferStatus } from '$lib/stores/client';

  export let transfer: ClientControlTransferOffer;
  export let onRespond: (action: 'accept' | 'deny') => void = () => undefined;
</script>

<section class="transfer-status" data-testid="client-control-transfer-status">
  <div>
    <strong>{formatClientControlTransferStatus(transfer)}</strong>
    <span>{transfer.groupId}</span>
  </div>
  {#if transfer.status === 'pending'}
    <button type="button" on:click={() => onRespond('deny')}>Deny</button>
    <button type="button" class="primary" on:click={() => onRespond('accept')}>Accept</button>
  {/if}
</section>

<style>
  .transfer-status {
    position: fixed;
    left: 50%;
    bottom: 22px;
    z-index: 40;
    display: flex;
    align-items: center;
    gap: 10px;
    width: min(calc(100vw - 32px), 520px);
    min-height: 56px;
    transform: translateX(-50%);
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 8px;
    background: rgba(10, 10, 15, 0.88);
    color: white;
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.32);
    backdrop-filter: blur(14px);
  }

  .transfer-status div {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .transfer-status strong {
    font-size: 14px;
    line-height: 1.2;
  }

  .transfer-status span {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.68);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .transfer-status button {
    min-width: 72px;
    height: 34px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.08);
    color: white;
    font-weight: 700;
  }

  .transfer-status button.primary {
    border-color: rgba(34, 197, 94, 0.55);
    background: rgba(34, 197, 94, 0.22);
    color: rgb(187, 247, 208);
  }
</style>
