<!-- Purpose: Marquee selection overlay with group creation affordance. -->
<script lang="ts">
  // @ts-nocheck
  import Button from '$lib/components/ui/Button.svelte';

  type RectLike = { left: number; top: number; width: number; height: number };

  export let marqueeRect: RectLike | null = null;
  export let selectionBounds: RectLike | null = null;
  export let selectionCount = 0;

  export let onCreateGroup: () => void = () => undefined;
</script>

{#if marqueeRect || selectionBounds}
  <div class="marquee-layer">
    {#if marqueeRect}
      <div
        class="marquee-rect dragging"
        style="left: {marqueeRect.left}px; top: {marqueeRect.top}px; width: {marqueeRect.width}px; height: {marqueeRect.height}px;"
      />
    {/if}

    {#if !marqueeRect && selectionBounds && selectionCount > 0}
      <div
        class="marquee-rect selected"
        style="left: {selectionBounds.left}px; top: {selectionBounds.top}px; width: {selectionBounds.width}px; height: {selectionBounds.height}px;"
      />
      <div
        class="marquee-actions"
        style="left: {selectionBounds.left + selectionBounds.width - 12}px; top: {selectionBounds.top +
          10}px; transform: translateX(-100%);"
        on:pointerdown|stopPropagation
      >
        <Button variant="primary" size="sm" on:click={onCreateGroup}>Create node group</Button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .marquee-layer {
    position: absolute;
    inset: 0;
    z-index: 12;
    pointer-events: none;
  }

  .marquee-rect {
    position: absolute;
    border-radius: 18px;
    border: 1px dashed rgba(59, 130, 246, 0.85);
    background: rgba(59, 130, 246, 0.06);
    box-shadow: 0 18px 64px rgba(0, 0, 0, 0.22);
  }

  .marquee-rect.dragging {
    background: rgba(59, 130, 246, 0.05);
  }

  .marquee-rect.selected {
    background: rgba(59, 130, 246, 0.04);
    border-style: solid;
  }

  .marquee-actions {
    position: absolute;
    pointer-events: auto;
  }
</style>
