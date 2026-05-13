<!-- Purpose: Shared empty/loading state card for the asset library. -->
<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';

  export let title: string;
  export let hint = '';
</script>

<Card class="asset-empty">
  <div class="empty-text">{title}</div>
  {#if hint}
    <div class="empty-hint">{hint}</div>
  {/if}
</Card>

<style>
  :global(.asset-empty) {
    text-align: center;
    padding: 18px;
  }

  .empty-text {
    font-size: 14px;
    font-weight: 700;
  }

  .empty-hint {
    margin-top: 6px;
    font-size: 12px;
    color: var(--text-secondary);
  }
</style>
