<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let offer: {
    offerId: string;
    fromActorId: string;
    groupIds: string[];
  } | null = null;

  export let safeMode = true;

  const dispatch = createEventDispatcher<{
    accept: { offerId: string };
    deny: { offerId: string };
  }>();

  const onAccept = () => {
    if (!offer?.offerId) return;
    dispatch('accept', { offerId: offer.offerId });
  };

  const onDeny = () => {
    if (!offer?.offerId) return;
    dispatch('deny', { offerId: offer.offerId });
  };

  let groupCount = 0;
  $: groupCount = offer?.groupIds?.length ?? 0;
</script>

{#if offer}
  <div class="overlay" role="dialog" aria-modal="true" aria-label="Transfer offer">
    <div class="panel">
      <div class="header">
        <div class="title">接管请求</div>
        <div class="meta">来自 {offer.fromActorId}</div>
      </div>

      <div class="body">
        <div class="line">请求你接管 {groupCount} 个 group</div>
        <div class="offer-id">{offer.offerId}</div>

        {#if safeMode}
          <div class="hint">当前为安全模式，接管会被拒绝。</div>
        {/if}
      </div>

      <div class="actions">
        <button type="button" class="btn secondary" on:click={onDeny}>拒绝</button>
        <button type="button" class="btn primary" disabled={safeMode} on:click={onAccept}>
          接管
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 2200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(5, 4, 10, 0.92);
    backdrop-filter: blur(8px);
  }

  .panel {
    width: min(720px, 100%);
    border-radius: 16px;
    padding: 22px;
    border: 1px solid rgba(255, 228, 210, 0.18);
    background: rgba(16, 14, 24, 0.86);
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
  }

  .header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  .title {
    font-size: 22px;
    font-weight: 750;
    letter-spacing: 0.02em;
    color: rgba(255, 228, 210, 0.92);
  }

  .meta {
    font-size: 13px;
    color: rgba(214, 201, 192, 0.75);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .line {
    font-size: 15px;
    color: rgba(214, 201, 192, 0.88);
  }

  .offer-id {
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
      monospace;
    font-size: 12px;
    color: rgba(214, 201, 192, 0.65);
    word-break: break-all;
  }

  .hint {
    font-size: 13px;
    color: rgba(254, 202, 202, 0.92);
    border: 1px solid rgba(239, 68, 68, 0.28);
    background: rgba(239, 68, 68, 0.12);
    padding: 10px 12px;
    border-radius: 12px;
  }

  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 18px;
  }

  .btn {
    width: 100%;
    padding: 14px 16px;
    border-radius: 12px;
    border: 1px solid rgba(255, 228, 210, 0.25);
    background: rgba(255, 228, 210, 0.12);
    color: rgba(255, 228, 210, 0.92);
    font-size: 16px;
    font-weight: 650;
    cursor: pointer;
  }

  .btn.secondary {
    background: rgba(2, 6, 23, 0.25);
    border-color: rgba(255, 255, 255, 0.12);
    color: rgba(226, 232, 240, 0.9);
  }

  .btn:hover:not(:disabled) {
    background: rgba(255, 228, 210, 0.16);
    border-color: rgba(255, 228, 210, 0.4);
  }

  .btn.secondary:hover:not(:disabled) {
    background: rgba(2, 6, 23, 0.35);
    border-color: rgba(255, 255, 255, 0.18);
  }

  .btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
</style>
