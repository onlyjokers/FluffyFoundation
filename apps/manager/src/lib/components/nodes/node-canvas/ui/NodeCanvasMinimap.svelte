<!-- Purpose: Minimap overlay UI for the node canvas. -->
<script lang="ts">
  // @ts-nocheck
  export let minimapUi: { x: number; y: number } = { x: 0, y: 0 };
  export let minimap: unknown = null;
  export let zoomStep = 30;

  export let toMiniX: (value: number) => number = (value) => value;
  export let toMiniY: (value: number) => number = (value) => value;
  export let onZoom: (delta: number) => void = () => undefined;

  export let onMovePointerDown: (event: PointerEvent) => void = () => undefined;
  export let onMovePointerMove: (event: PointerEvent) => void = () => undefined;
  export let onMovePointerUp: (event: PointerEvent) => void = () => undefined;
  export let onPointerDown: (event: PointerEvent) => void = () => undefined;
  export let onPointerMove: (event: PointerEvent) => void = () => undefined;
  export let onPointerUp: (event: PointerEvent) => void = () => undefined;
</script>

<div class="minimap-shell minimap" style="left:{minimapUi.x}px; top:{minimapUi.y}px;">
  <div class="minimap-bar" on:pointerdown|stopPropagation>
    <button
      class="minimap-bar-btn"
      type="button"
      aria-label="Zoom minimap in"
      title="Zoom minimap in"
      on:click={() => onZoom(zoomStep)}
    >
      ▲
    </button>
    <button
      class="minimap-bar-btn minimap-bar-drag"
      type="button"
      aria-label="Move minimap"
      title="Drag to move"
      on:pointerdown={onMovePointerDown}
      on:pointermove={onMovePointerMove}
      on:pointerup={onMovePointerUp}
      on:pointercancel={onMovePointerUp}
    >
      ■
    </button>
    <button
      class="minimap-bar-btn"
      type="button"
      aria-label="Zoom minimap out"
      title="Zoom minimap out"
      on:click={() => onZoom(-zoomStep)}
    >
      ▼
    </button>
  </div>

  <div
    class="minimap-view"
    on:pointerdown={onPointerDown}
    on:pointermove={onPointerMove}
    on:pointerup={onPointerUp}
    on:pointercancel={onPointerUp}
  >
    <svg
      width={minimap.size}
      height={minimap.size}
      viewBox={`0 0 ${minimap.size} ${minimap.size}`}
      aria-label="Minimap canvas"
    >
      <rect
        x="0"
        y="0"
        width={minimap.size}
        height={minimap.size}
        rx="12"
        fill="rgba(2, 6, 23, 0.62)"
        stroke="rgba(255, 255, 255, 0.12)"
      />

      {#each minimap.connections as c (c.id)}
        <line
          x1={toMiniX(c.x1)}
          y1={toMiniY(c.y1)}
          x2={toMiniX(c.x2)}
          y2={toMiniY(c.y2)}
          stroke={c.deployedLoop
            ? 'rgba(20, 184, 166, 0.7)'
            : c.localLoop
              ? 'rgba(236, 72, 153, 0.6)'
              : 'rgba(148, 163, 184, 0.22)'}
          stroke-width="1.2"
          stroke-linecap="round"
        />
      {/each}

      {#each minimap.nodes as n (n.id)}
        <rect
          x={toMiniX(n.x)}
          y={toMiniY(n.y)}
          width={Math.max(2, n.width * minimap.scale)}
          height={Math.max(2, n.height * minimap.scale)}
          rx="3"
          fill={n.selected ? 'rgba(99, 102, 241, 0.65)' : 'rgba(148, 163, 184, 0.38)'}
          stroke={n.selected ? 'rgba(99, 102, 241, 0.95)' : 'rgba(255, 255, 255, 0.18)'}
        />
      {/each}

      <rect
        x={toMiniX(minimap.viewport.x)}
        y={toMiniY(minimap.viewport.y)}
        width={Math.max(4, minimap.viewport.width * minimap.scale)}
        height={Math.max(4, minimap.viewport.height * minimap.scale)}
        rx="4"
        fill="transparent"
        stroke="rgba(255, 255, 255, 0.82)"
        stroke-width="2"
        stroke-dasharray="6 4"
      />
    </svg>
  </div>
</div>

<style>
  .minimap-shell {
    position: absolute;
    z-index: 20;
    display: flex;
    align-items: stretch;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 16px 50px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(12px);
    user-select: none;
  }

  .minimap-bar {
    width: 22px;
    background: rgba(2, 6, 23, 0.72);
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 8px 0;
    gap: 8px;
  }

  .minimap-bar-btn {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 6, 23, 0.25);
    color: rgba(255, 255, 255, 0.8);
    width: 18px;
    height: 18px;
    border-radius: 6px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 10px;
    line-height: 1;
  }

  .minimap-bar-btn:hover {
    border-color: rgba(99, 102, 241, 0.55);
    background: rgba(2, 6, 23, 0.32);
  }

  .minimap-bar-drag {
    height: 28px;
    cursor: grab;
  }

  .minimap-bar-drag:active {
    cursor: grabbing;
  }

  .minimap-view {
    cursor: pointer;
  }

  .minimap-view svg {
    display: block;
  }
</style>
