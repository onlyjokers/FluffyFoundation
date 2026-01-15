<!-- Purpose: Custom Rete connection renderer with loop/MIDI highlighting. -->
<script lang="ts">
  import { nodeGraphEdgeShadows } from '$lib/features/node-graph-flags';

  type Position = { x: number; y: number };

  // ConnectionWrapper spreads the connection payload into props.
  // Declare all common fields to avoid Svelte dev warnings about unknown props.
  // svelte-ignore unused-export-let
  export let id: string = '';
  // svelte-ignore unused-export-let
  export let source: string = '';
  // svelte-ignore unused-export-let
  export let target: string = '';
  // svelte-ignore unused-export-let
  export let sourceOutput: string = '';
  // svelte-ignore unused-export-let
  export let targetInput: string = '';
  // svelte-ignore unused-export-let
  export let isLoop: boolean | undefined = undefined;
  // svelte-ignore unused-export-let
  export let isPseudo: boolean | undefined = undefined;

  export let localLoop: boolean | undefined = undefined;
  export let deployedLoop: boolean | undefined = undefined;
  export let active: boolean | undefined = undefined;
  export let hidden: boolean | undefined = undefined;

  // svelte-ignore unused-export-let
  export let start: Position = { x: 0, y: 0 };
  // svelte-ignore unused-export-let
  export let end: Position = { x: 0, y: 0 };
  export let path: string = '';

  // Compute whether shadows should be applied
  $: shadowsEnabled = $nodeGraphEdgeShadows;

  // Step 1.2: Limit per-edge SVG viewport (avoid 9999px surfaces).
  // We keep the `d` path coordinates unchanged (absolute in the canvas coordinate space),
  // and instead set `viewBox` to cover the local bbox so the mapping stays 1:1.
  const PADDING = 50; // Matches plan_progress: bbox + 50px padding

  $: minX = Math.min(start.x, end.x);
  $: minY = Math.min(start.y, end.y);
  $: maxX = Math.max(start.x, end.x);
  $: maxY = Math.max(start.y, end.y);

  $: svgWidth = Math.max(1, maxX - minX + PADDING * 2);
  $: svgHeight = Math.max(1, maxY - minY + PADDING * 2);
  $: viewBox = `${minX - PADDING} ${minY - PADDING} ${svgWidth} ${svgHeight}`;
</script>

<svg
  class="connection {localLoop ? 'local-loop' : ''} {deployedLoop ? 'deployed-loop' : ''} {active
    ? 'active'
    : ''} {hidden ? 'hidden' : ''} {shadowsEnabled ? 'with-shadow' : 'no-shadow'}"
  data-connection-id={id}
  data-testid="connection"
  {viewBox}
  preserveAspectRatio="xMidYMid meet"
  style="left: {minX - PADDING}px; top: {minY -
    PADDING}px; width: {svgWidth}px; height: {svgHeight}px;"
>
  <path d={path} />
</svg>

<style>
  svg {
    overflow: visible !important;
    position: absolute;
    pointer-events: none;
    /* Width/height set via inline style based on connection bounds */
  }

  svg.hidden {
    display: none !important;
  }

  svg path {
    fill: none;
    stroke-width: 5px;
    stroke: rgba(99, 102, 241, 0.6);
    pointer-events: auto;
    transition:
      stroke 120ms ease,
      stroke-width 120ms ease,
      opacity 120ms ease;
    opacity: 0.85;
  }

  /* Apply shadows only when explicitly enabled */
  svg.with-shadow path {
    filter: drop-shadow(0 2px 12px rgba(0, 0, 0, 0.35));
  }

  svg.no-shadow path {
    filter: none;
  }

  svg.local-loop path {
    stroke: rgba(236, 72, 153, 0.9);
    stroke-width: 6px;
    opacity: 0.95;
  }

  svg.deployed-loop path {
    stroke: rgba(20, 184, 166, 0.95);
    stroke-width: 6px;
    opacity: 1;
  }

  svg.active path {
    stroke: rgba(250, 204, 21, 0.95);
    stroke-width: 7px;
    opacity: 1;
  }

  /* Active state gets shadow only when shadows are enabled */
  svg.active.with-shadow path {
    filter: drop-shadow(0 0 18px rgba(250, 204, 21, 0.35));
  }

  svg.active.no-shadow path {
    filter: none;
  }
</style>
