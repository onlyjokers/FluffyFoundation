<!-- CurveEditor: Cubic bezier curve editor using bezier-easing library. -->
<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import BezierEasing from 'bezier-easing';

  // Cubic bezier control points: [x1, y1, x2, y2] in 0-1 range
  export let value: [number, number, number, number] = [0.25, 0.1, 0.25, 1.0];
  export let readonly: boolean = false;
  export let width: number = 200;
  export let height: number = 140;
  export let progress: number = 0;

  const dispatch = createEventDispatcher<{ change: [number, number, number, number] }>();

  let svgEl: SVGSVGElement | null = null;
  let dragPoint: 'p1' | 'p2' | null = null;

  const padding = 16;
  const graphWidth = width - 2 * padding;
  const graphHeight = height - 2 * padding;

  // Parse and validate bezier value
  function parseBezier(v: unknown): [number, number, number, number] {
    if (!Array.isArray(v) || v.length !== 4) return [0.25, 0.1, 0.25, 1.0];
    return v.map((n, i) => {
      const val = typeof n === 'number' && Number.isFinite(n) ? n : i % 2 === 0 ? 0.25 : 0.1;
      if (i % 2 === 0) return Math.max(0, Math.min(1, val)); // x: 0-1
      return Math.max(-0.5, Math.min(1.5, val)); // y: -0.5 to 1.5
    }) as [number, number, number, number];
  }

  // Current bezier (from prop)
  $: currentBezier = parseBezier(value);

  // Create bezier easing function (safe)
  $: easingFn = (() => {
    try {
      const [x1, y1, x2, y2] = currentBezier;
      return BezierEasing(Math.max(0, Math.min(1, x1)), y1, Math.max(0, Math.min(1, x2)), y2);
    } catch {
      return BezierEasing(0.25, 0.1, 0.25, 1.0);
    }
  })();

  // Convert normalized to SVG coordinates
  const toX = (x: number) => padding + x * graphWidth;
  const toY = (y: number) => padding + (1 - y) * graphHeight;

  // Convert client coordinates to SVG coordinates
  function clientToSvg(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!svgEl) return null;
    try {
      const pt = svgEl.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svgEl.getScreenCTM();
      if (!ctm) return null;
      const svgPt = pt.matrixTransform(ctm.inverse());
      return { x: svgPt.x, y: svgPt.y };
    } catch {
      return null;
    }
  }

  // Convert SVG coordinates to normalized bezier values
  function svgToNormalized(svgX: number, svgY: number): { x: number; y: number } {
    const x = (svgX - padding) / graphWidth;
    const y = 1 - (svgY - padding) / graphHeight;
    return {
      x: Math.max(0, Math.min(1, Math.round(x * 100) / 100)),
      y: Math.max(-0.5, Math.min(1.5, Math.round(y * 100) / 100)),
    };
  }

  // Generate curve path
  $: curvePath = (() => {
    const points: string[] = [];
    const steps = 50;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = easingFn(t);
      points.push(i === 0 ? `M ${toX(t)} ${toY(y)}` : `L ${toX(t)} ${toY(y)}`);
    }
    return points.join(' ');
  })();

  // Control point positions
  $: p1x = toX(currentBezier[0]);
  $: p1y = toY(currentBezier[1]);
  $: p2x = toX(currentBezier[2]);
  $: p2y = toY(currentBezier[3]);

  // Progress indicator
  $: progressY = progress > 0 && progress < 1 ? toY(easingFn(progress)) : null;
  $: progressX = progress > 0 && progress < 1 ? toX(progress) : null;

  // Start dragging
  function handleMouseDown(point: 'p1' | 'p2', e: MouseEvent) {
    if (readonly) return;
    e.preventDefault();
    e.stopPropagation();
    dragPoint = point;
    window.addEventListener('mousemove', handleMouseMove, true);
    window.addEventListener('mouseup', handleMouseUp, true);
  }

  // Handle drag
  function handleMouseMove(e: MouseEvent) {
    if (!dragPoint) return;
    e.preventDefault();
    e.stopPropagation();

    const svgPos = clientToSvg(e.clientX, e.clientY);
    if (!svgPos) return;

    const norm = svgToNormalized(svgPos.x, svgPos.y);

    let newBezier: [number, number, number, number];
    if (dragPoint === 'p1') {
      newBezier = [norm.x, norm.y, currentBezier[2], currentBezier[3]];
    } else {
      newBezier = [currentBezier[0], currentBezier[1], norm.x, norm.y];
    }

    dispatch('change', newBezier);
  }

  // End drag
  function handleMouseUp(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    window.removeEventListener('mousemove', handleMouseMove, true);
    window.removeEventListener('mouseup', handleMouseUp, true);
    dragPoint = null;
  }

  // Preset curves
  const presets: { name: string; value: [number, number, number, number] | null }[] = [
    { name: 'Custom', value: null },
    { name: 'Linear', value: [0, 0, 1, 1] },
    { name: 'Ease', value: [0.25, 0.1, 0.25, 1] },
    { name: 'Ease In', value: [0.42, 0, 1, 1] },
    { name: 'Ease Out', value: [0, 0, 0.58, 1] },
    { name: 'Ease In-Out', value: [0.42, 0, 0.58, 1] },
  ];

  // Check if current bezier matches a preset
  function matchesPreset(presetValue: [number, number, number, number] | null): boolean {
    if (presetValue === null) {
      return !presets.slice(1).some((p) => p.value && matchesPreset(p.value));
    }
    return (
      currentBezier[0] === presetValue[0] &&
      currentBezier[1] === presetValue[1] &&
      currentBezier[2] === presetValue[2] &&
      currentBezier[3] === presetValue[3]
    );
  }

  function applyPreset(presetValue: [number, number, number, number] | null) {
    if (readonly || presetValue === null) return;
    dispatch('change', [...presetValue] as [number, number, number, number]);
  }

  onDestroy(() => {
    window.removeEventListener('mousemove', handleMouseMove, true);
    window.removeEventListener('mouseup', handleMouseUp, true);
  });
</script>

<div
  class="curve-editor"
  class:readonly
  style="width: {width}px;"
  on:mousedown|stopPropagation={() => {}}
  on:pointerdown|stopPropagation={() => {}}
>
  <svg bind:this={svgEl} {width} {height}>
    <rect x={padding} y={padding} width={graphWidth} height={graphHeight} class="graph-bg" />
    <line x1={toX(0.5)} y1={padding} x2={toX(0.5)} y2={height - padding} class="grid" />
    <line x1={padding} y1={toY(0.5)} x2={width - padding} y2={toY(0.5)} class="grid" />
    <line x1={toX(0)} y1={toY(0)} x2={toX(1)} y2={toY(1)} class="diagonal" />
    <line x1={toX(0)} y1={toY(0)} x2={p1x} y2={p1y} class="handle-line" />
    <line x1={toX(1)} y1={toY(1)} x2={p2x} y2={p2y} class="handle-line" />
    <path d={curvePath} class="curve" />
    {#if progressX !== null && progressY !== null}
      <circle cx={progressX} cy={progressY} r={4} class="progress-dot" />
      <line
        x1={progressX}
        y1={padding}
        x2={progressX}
        y2={height - padding}
        class="progress-line"
      />
    {/if}
    <circle cx={toX(0)} cy={toY(0)} r={4} class="endpoint" />
    <circle cx={toX(1)} cy={toY(1)} r={4} class="endpoint" />
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <circle
      cx={p1x}
      cy={p1y}
      r={8}
      class="control-point"
      class:active={dragPoint === 'p1'}
      on:mousedown={(e) => handleMouseDown('p1', e)}
    />
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <circle
      cx={p2x}
      cy={p2y}
      r={8}
      class="control-point p2"
      class:active={dragPoint === 'p2'}
      on:mousedown={(e) => handleMouseDown('p2', e)}
    />
  </svg>

  {#if !readonly}
    <div class="presets">
      {#each presets as preset}
        <button
          type="button"
          class="preset-btn"
          class:active={matchesPreset(preset.value)}
          class:custom={preset.value === null}
          disabled={preset.value === null}
          on:mousedown|stopPropagation={() => {}}
          on:click|stopPropagation={() => applyPreset(preset.value)}
        >
          {preset.name}
        </button>
      {/each}
    </div>
  {/if}

  <div class="value-display">
    cubic-bezier({currentBezier[0].toFixed(2)}, {currentBezier[1].toFixed(2)}, {currentBezier[2].toFixed(
      2
    )}, {currentBezier[3].toFixed(2)})
  </div>
</div>

<style>
  .curve-editor {
    display: flex;
    flex-direction: column;
    gap: 6px;
    user-select: none;
  }
  .curve-editor.readonly {
    opacity: 0.6;
    pointer-events: none;
  }
  svg {
    background: #1a1a1a;
    border: 1px solid #444;
    border-radius: 6px;
  }
  .graph-bg {
    fill: #222;
  }
  .grid {
    stroke: #333;
    stroke-width: 1;
    stroke-dasharray: 3, 3;
  }
  .diagonal {
    stroke: #444;
    stroke-width: 1;
    stroke-dasharray: 4, 4;
  }
  .handle-line {
    stroke: #818cf8;
    stroke-width: 1.5;
    opacity: 0.6;
  }
  .curve {
    fill: none;
    stroke: #6366f1;
    stroke-width: 2.5;
    stroke-linecap: round;
  }
  .endpoint {
    fill: #4f46e5;
    stroke: #fff;
    stroke-width: 1;
  }
  .control-point {
    fill: #6366f1;
    stroke: #fff;
    stroke-width: 2;
    cursor: grab;
  }
  .control-point:hover {
    fill: #818cf8;
  }
  .control-point.active {
    fill: #a5b4fc;
    cursor: grabbing;
  }
  .control-point.p2 {
    fill: #22c55e;
  }
  .control-point.p2:hover {
    fill: #4ade80;
  }
  .control-point.p2.active {
    fill: #86efac;
  }
  .progress-dot {
    fill: #f59e0b;
    stroke: #fff;
    stroke-width: 1;
  }
  .progress-line {
    stroke: #f59e0b;
    stroke-width: 1;
    stroke-dasharray: 2, 2;
    opacity: 0.5;
  }
  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .preset-btn {
    padding: 2px 6px;
    font-size: 9px;
    background: #333;
    border: 1px solid #555;
    border-radius: 3px;
    color: #aaa;
    cursor: pointer;
  }
  .preset-btn:hover:not(:disabled) {
    background: #444;
    color: #fff;
  }
  .preset-btn.active {
    background: #4f46e5;
    border-color: #6366f1;
    color: #fff;
  }
  .preset-btn.custom {
    cursor: default;
  }
  .preset-btn.custom.active {
    background: #059669;
    border-color: #10b981;
  }
  .value-display {
    font-size: 9px;
    color: #666;
    font-family: monospace;
    text-align: center;
  }
</style>
