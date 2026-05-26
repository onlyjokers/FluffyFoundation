<!-- Purpose: Layout shell for the node canvas, providing slots for toolbar, overlays, and minimap. -->
<script lang="ts">
  export let container: HTMLDivElement | null = null;
  export let isRunning = false;
  export let edgeShadowsEnabled = true;
  // Scale grid background with canvas zoom.
  export let gridScale = 1;
  // Keep grid background aligned with canvas translation.
  export let gridOffset = { x: 0, y: 0 };
</script>

<div class="node-canvas-container" class:edge-shadows-off={!edgeShadowsEnabled}>
  <slot name="toolbar" />
  <slot name="logs" />

  <div
    class="canvas-wrapper"
    bind:this={container}
    role="application"
    aria-label="Node graph editor"
    style="--grid-scale: {gridScale}; --grid-x: {gridOffset.x}px; --grid-y: {gridOffset.y}px;"
  >
    <div class="canvas-dimmer" class:active={isRunning} aria-hidden="true" />
    <slot name="canvas" />
    <slot name="overlays" />
    <slot name="minimap" />
  </div>
</div>

<style>
  .node-canvas-container {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    height: 100%;
    width: 100%;
    position: relative;
    min-width: 0;
    min-height: 0;
    background:
      radial-gradient(circle at 20% 0%, rgba(99, 102, 241, 0.18), transparent 45%),
      radial-gradient(circle at 80% 10%, rgba(168, 85, 247, 0.16), transparent 50%),
      linear-gradient(180deg, #0b0c14 0%, #070811 100%);
    border-radius: var(--radius-md, 8px);
    overflow: hidden;
    border: 1px solid var(--border-color, #444);
  }

  .canvas-wrapper {
    flex: 1;
    width: 100%;
    min-width: 0;
    min-height: 0;
    position: relative;
    z-index: 0;
    isolation: isolate;
    overflow: hidden;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px),
      radial-gradient(circle at 30% 0%, rgba(99, 102, 241, 0.12), transparent 50%),
      radial-gradient(circle at 70% 10%, rgba(168, 85, 247, 0.1), transparent 55%),
      linear-gradient(180deg, rgba(10, 11, 20, 0.85) 0%, rgba(7, 8, 17, 0.95) 100%);
    background-size:
      calc(32px * var(--grid-scale, 1)) calc(32px * var(--grid-scale, 1)),
      calc(32px * var(--grid-scale, 1)) calc(32px * var(--grid-scale, 1)),
      auto,
      auto,
      auto;
    background-position:
      var(--grid-x, 0px) var(--grid-y, 0px),
      var(--grid-x, 0px) var(--grid-y, 0px),
      center,
      center,
      center;
  }

  .canvas-dimmer {
    position: absolute;
    inset: 0;
    z-index: -1;
    background: rgba(0, 0, 0, 0.38);
    opacity: 0;
    pointer-events: none;
    transition: opacity 520ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .canvas-dimmer.active {
    opacity: 1;
  }

  /* --- Shared node/socket styles (Rete + XYFlow) --- */
  :global(.node-canvas-container .node) {
    background: rgba(17, 24, 39, 0.92) !important;
    border: 1px solid rgba(99, 102, 241, 0.35) !important;
    border-radius: 12px !important;
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.38) !important;
    width: 230px !important;
  }

  :global(.node-canvas-container .node.group-port) {
    width: 14px !important;
    min-width: 0 !important;
    height: 14px !important;
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
    overflow: visible !important;
    /* Ensure gate/proxy sockets stay interactive above the Group frame header overlay (z-index: 5). */
    z-index: 6 !important;
  }

  :global(.node-canvas-container .node.group-port.group-proxy-input),
  :global(.node-canvas-container .node.group-port.group-proxy-output) {
    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    min-height: 0 !important;
    box-sizing: border-box !important;
    background: transparent !important;
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    padding: 0 !important;
    display: inline-flex !important;
    align-items: center !important;
    cursor: pointer !important;
    z-index: 6 !important;
  }

  :global(.node-canvas-container .node.group-port.group-proxy-input.group-minimized),
  :global(.node-canvas-container .node.group-port.group-proxy-output.group-minimized) {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    cursor: pointer !important;
  }

  :global(.node-canvas-container .node.group-port .title),
  :global(.node-canvas-container .node.group-port .controls),
  :global(.node-canvas-container .node.group-port .ports),
  :global(.node-canvas-container .node.group-port .cmd-aggregator-controls) {
    display: none !important;
  }

  :global(.node-canvas-container .node:hover) {
    border-color: rgba(99, 102, 241, 0.6) !important;
  }

  :global(.node-canvas-container .node.selected) {
    border-color: rgba(99, 102, 241, 0.95) !important;
    box-shadow: 0 18px 52px rgba(99, 102, 241, 0.18) !important;
  }

  :global(.node-canvas-container .node.group-port.selected) {
    outline: 2px solid rgba(99, 102, 241, 0.95) !important;
    outline-offset: 4px !important;
    border-radius: 999px !important;
  }

  :global(.node-canvas-container .node.local-loop) {
    border-color: rgba(236, 72, 153, 0.85) !important;
    box-shadow: 0 18px 56px rgba(236, 72, 153, 0.16) !important;
  }

  :global(.node-canvas-container .node.deployed-loop) {
    border-color: rgba(20, 184, 166, 0.95) !important;
    box-shadow: 0 18px 56px rgba(20, 184, 166, 0.16) !important;
  }

  :global(.node-canvas-container .node.deployed-patch) {
    border-color: rgba(14, 165, 233, 0.95) !important;
    box-shadow: 0 18px 56px rgba(14, 165, 233, 0.16) !important;
  }

  :global(.node-canvas-container .node.stopped:not(.group-disabled)) {
    opacity: 0.62;
    filter: grayscale(0.6) saturate(0.6);
  }

  /* Ensure edge shadow toggles actually remove filters (SVG filters are expensive). */
  :global(.node-canvas-container.edge-shadows-off svg.connection),
  :global(.node-canvas-container.edge-shadows-off svg.connection path) {
    filter: none !important;
  }

  :global(.node-canvas-container .node .title) {
    color: rgba(255, 255, 255, 0.92) !important;
    font-size: 14px !important;
    padding: 10px 12px !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
    letter-spacing: 0.2px;
  }

  :global(.node-canvas-container .node .input-title),
  :global(.node-canvas-container .node .output-title) {
    color: rgba(255, 255, 255, 0.78) !important;
    font-size: 12px !important;
    margin: 4px 8px !important;
    line-height: 18px !important;
  }

  :global(.node-canvas-container .socket) {
    width: 14px !important;
    height: 14px !important;
    border-radius: 999px !important;
    margin: 6px !important;
    border: 2px solid rgba(255, 255, 255, 0.35) !important;
    background: rgba(99, 102, 241, 0.95) !important;
  }

  :global(.node-canvas-container .socket[title='number']),
  :global(.node-canvas-container .socket.port-number) {
    background: rgba(34, 197, 94, 0.92) !important;
  }

  :global(.node-canvas-container .socket[title='boolean']),
  :global(.node-canvas-container .socket.port-boolean) {
    background: rgba(245, 158, 11, 0.95) !important;
  }

  :global(.node-canvas-container .socket[title='string']),
  :global(.node-canvas-container .socket.port-string) {
    background: rgba(59, 130, 246, 0.95) !important;
  }

  :global(.node-canvas-container .socket[title='asset']),
  :global(.node-canvas-container .socket.port-asset) {
    background: rgba(148, 163, 184, 0.95) !important;
  }

  :global(.node-canvas-container .socket[title='color']),
  :global(.node-canvas-container .socket.port-color) {
    background: rgba(236, 72, 153, 0.95) !important;
  }

  :global(.node-canvas-container .socket[title='audio']),
  :global(.node-canvas-container .socket.port-audio) {
    background: rgba(14, 165, 233, 0.95) !important;
  }

  :global(.node-canvas-container .socket[title='print']),
  :global(.node-canvas-container .socket.port-print) {
    background: rgba(245, 158, 11, 0.95) !important;
  }

  :global(.node-canvas-container .socket[title='client']),
  :global(.node-canvas-container .socket.port-client) {
    background: rgba(168, 85, 247, 0.95) !important;
  }

  :global(.node-canvas-container .socket[title='command']),
  :global(.node-canvas-container .socket.port-command) {
    background: rgba(239, 68, 68, 0.92) !important;
  }

  :global(.node-canvas-container .socket[title='fuzzy']),
  :global(.node-canvas-container .socket.port-fuzzy) {
    background: rgba(20, 184, 166, 0.95) !important;
  }

  :global(.node-canvas-container .socket[title='any']),
  :global(.node-canvas-container .socket.port-any) {
    background: rgba(99, 102, 241, 0.95) !important;
  }

  :global(.node-canvas-container .socket[title='array']),
  :global(.node-canvas-container .socket.port-array) {
    background: rgba(234, 179, 8, 0.95) !important;
  }

  :global(.node-canvas-container .socket:hover) {
    border-width: 3px !important;
  }

  :global(.node-canvas-container .output-socket) {
    margin-right: -10px !important;
  }

  :global(.node-canvas-container .input-socket) {
    margin-left: -10px !important;
  }

  :global(.node-canvas-container .node.group-port .socket) {
    margin: 0 !important;
  }

</style>
