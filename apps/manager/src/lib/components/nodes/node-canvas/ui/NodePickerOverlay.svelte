<!-- Purpose: Node picker overlay for adding and connecting nodes. -->
<script lang="ts">
  // @ts-nocheck
  type PickerMode = 'add' | 'connect';

  export let isOpen = false;
  export let mode: PickerMode = 'add';
  export let anchor = { x: 0, y: 0 };
  export let query = '';
  export let categories: string[] = [];
  export let selectedCategory = '';
  type PickerItem = {
    type?: string;
    label?: string;
    matchPort?: { side?: string; label?: string };
  };

  export let items: PickerItem[] = [];
  export let initialSocket: unknown = null;
  export let connectTypeLabel = 'any';

  let overlayElement: HTMLDivElement | null = null;
  export let pickerElement: HTMLDivElement | null = null;

  export let onClose: () => void = () => undefined;
  export let onPick: (item: PickerItem) => void = () => undefined;

  let position = { x: 0, y: 0 };
  let hasUserMoved = false;
  let dragOffset = { x: 0, y: 0 };
  let isDragging = false;
  let lastIsOpen = false;

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  $: {
    if (isOpen && !lastIsOpen) {
      hasUserMoved = false;
    }
    lastIsOpen = isOpen;
  }

  $: if (isOpen && !hasUserMoved) {
    position = { x: anchor.x, y: anchor.y };
  }

  function startDrag(e: PointerEvent) {
    if (!pickerElement || !overlayElement) return;
    hasUserMoved = true;
    isDragging = true;
    e.preventDefault();

    const pickerRect = pickerElement.getBoundingClientRect();
    dragOffset = { x: e.clientX - pickerRect.left, y: e.clientY - pickerRect.top };

    const handleMove = (ev: PointerEvent) => {
      if (!pickerElement || !overlayElement) return;
      const overlayRect = overlayElement.getBoundingClientRect();
      const rect = pickerElement.getBoundingClientRect();
      const maxX = Math.max(0, overlayRect.width - rect.width);
      const maxY = Math.max(0, overlayRect.height - rect.height);

      const nextX = ev.clientX - overlayRect.left - dragOffset.x;
      const nextY = ev.clientY - overlayRect.top - dragOffset.y;

      position = {
        x: clamp(nextX, 10, Math.max(10, maxX - 10)),
        y: clamp(nextY, 10, Math.max(10, maxY - 10)),
      };
    };

    const handleUp = () => {
      isDragging = false;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  }
</script>

{#if isOpen}
  <div class="picker-overlay" bind:this={overlayElement} on:pointerdown={onClose}>
    <div
      class="node-picker"
      bind:this={pickerElement}
      style="left: {position.x}px; top: {position.y}px;"
      on:pointerdown|stopPropagation
      on:wheel|stopPropagation
    >
      <div class="picker-header">
        <div class="picker-title {isDragging ? 'dragging' : ''}" on:pointerdown={startDrag}>
          {#if mode === 'connect' && initialSocket}
            Connect: {connectTypeLabel}
          {:else}
            Add node
          {/if}
        </div>
        <input
          class="picker-search"
          placeholder="Search…"
          bind:value={query}
          on:pointerdown|stopPropagation
        />
      </div>

      <div class="picker-body">
        <div class="picker-categories">
          {#each categories as cat (cat)}
            <button
              type="button"
              class="picker-category {cat === selectedCategory ? 'active' : ''}"
              on:click={() => (selectedCategory = cat)}
            >
              {cat}
            </button>
          {/each}
        </div>
        <div class="picker-items">
          {#if items.length === 0}
            <div class="picker-empty">No matches</div>
          {:else}
            {#each items as item (item.type)}
              <button type="button" class="picker-item" on:click={() => onPick(item)}>
                <div class="picker-item-title">{item.label}</div>
                <div class="picker-item-subtitle">
                  {#if mode === 'connect' && item.matchPort}
                    {item.matchPort.side}: {item.matchPort.label}
                  {:else}
                    {item.type}
                  {/if}
                </div>
              </button>
            {/each}
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .picker-overlay {
    position: absolute;
    inset: 0;
    z-index: 50;
  }

  .node-picker {
    position: absolute;
    width: 420px;
    max-height: min(520px, calc(100% - 20px));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 14px;
    background: rgba(15, 23, 42, 0.96);
    border: 1px solid rgba(99, 102, 241, 0.35);
    box-shadow: 0 22px 70px rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(16px);
  }

  .picker-header {
    padding: 12px 12px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .picker-title {
    font-size: 12px;
    letter-spacing: 0.2px;
    color: rgba(255, 255, 255, 0.78);
    cursor: grab;
    user-select: none;
  }

  .picker-title.dragging {
    cursor: grabbing;
  }

  .picker-search {
    width: 100%;
    box-sizing: border-box;
    border-radius: 12px;
    padding: 8px 10px;
    background: rgba(2, 6, 23, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.92);
    outline: none;
    font-size: 12px;
  }

  .picker-search:focus {
    border-color: rgba(99, 102, 241, 0.7);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.18);
  }

  .picker-body {
    display: flex;
    min-height: 0;
    flex: 1;
  }

  .picker-categories {
    width: 132px;
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    padding: 6px;
    overflow: auto;
  }

  .picker-category {
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid transparent;
    background: transparent;
    color: rgba(255, 255, 255, 0.74);
    font-size: 12px;
    cursor: pointer;
  }

  .picker-category:hover {
    background: rgba(99, 102, 241, 0.12);
  }

  .picker-category.active {
    background: rgba(99, 102, 241, 0.18);
    border-color: rgba(99, 102, 241, 0.35);
    color: rgba(255, 255, 255, 0.92);
  }

  .picker-items {
    flex: 1;
    min-width: 0;
    padding: 8px;
    overflow: auto;
  }

  .picker-item {
    width: 100%;
    text-align: left;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 10px 12px;
    background: rgba(2, 6, 23, 0.22);
    color: rgba(255, 255, 255, 0.92);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
  }

  .picker-item:hover {
    border-color: rgba(99, 102, 241, 0.45);
    background: rgba(2, 6, 23, 0.3);
  }

  .picker-item-title {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.2px;
  }

  .picker-item-subtitle {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.66);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .picker-empty {
    padding: 10px 12px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
  }
</style>
