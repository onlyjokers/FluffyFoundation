<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { Parameter } from '$lib/parameters/parameter';
  import { createParamStore, type ParamStore } from '$lib/stores/param-store';

  export let parameter: Parameter<number>;
  export let label: string | undefined = undefined;
  export let suffix = '';
  export let disabled = false;

  let className = '';
  export { className as class };

  const dispatch = createEventDispatcher<{
    contextmenu: { parameter: Parameter<number>; event: MouseEvent };
  }>();

  let store: ParamStore<number>;
  let base: number;
  let effective: number;
  let isOffline: boolean;
  let min: number;
  let max: number;

  $: store = createParamStore(parameter);
  $: ({ base, effective, isOffline, min: pMin, max: pMax } = $store);
  $: min = pMin ?? 0;
  $: max = pMax ?? 1;

  // Calculate visual percentage for the modulation bar
  $: basePercent = ((base - min) / (max - min)) * 100;
  $: effectivePercent = ((effective - min) / (max - min)) * 100;

  // Modulation offset visualization
  $: hasModulation = Math.abs(effective - base) > 0.001;

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    store.set(parseFloat(target.value));
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    dispatch('contextmenu', { parameter, event: e });
  }

  // Step calculation
  $: step = parameter.metadata?.step ?? (max - min > 10 ? 1 : 0.01);
  $: displayLabel = label ?? parameter.metadata?.label ?? parameter.path.split('/').pop();
  $: displayValue = Number(effective).toFixed(step < 1 ? 2 : 0);
</script>

<div
  class="param-slider {className}"
  class:offline={isOffline}
  class:has-modulation={hasModulation}
  on:contextmenu={handleContextMenu}
  role="group"
  aria-label={displayLabel}
>
  <div class="slider-header">
    <label class="control-label" for="slider-{parameter.path}">{displayLabel}</label>
    <span class="value-display">
      {displayValue}{suffix}
      {#if hasModulation}
        <span class="mod-indicator" title="Modulated">~</span>
      {/if}
    </span>
  </div>

  <div class="slider-track-container">
    <!-- Effective value bar (modulation result) -->
    <div class="effective-bar" style="width: {effectivePercent}%"></div>

    <!-- Base value indicator line -->
    {#if hasModulation}
      <div class="base-indicator" style="left: {basePercent}%"></div>
    {/if}

    <!-- The actual input slider -->
    <input
      type="range"
      class="range-slider"
      {min}
      {max}
      {step}
      value={base}
      on:input={handleInput}
      disabled={disabled || isOffline}
      id="slider-{parameter.path}"
    />
  </div>
</div>

<style>
  .param-slider {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs, 4px);
    width: 100%;
    transition: opacity 0.2s;
  }

  .param-slider.offline {
    opacity: 0.4;
    pointer-events: none;
  }

  .slider-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .control-label {
    font-size: var(--text-sm, 0.875rem);
    color: var(--text-secondary, #a0a0a0);
  }

  .value-display {
    font-family: var(--font-mono, monospace);
    font-size: var(--text-sm, 0.875rem);
    color: var(--text-accent, #6366f1);
  }

  .mod-indicator {
    color: var(--color-warning, #f59e0b);
    margin-left: 2px;
  }

  .slider-track-container {
    position: relative;
    height: 24px;
    background: var(--bg-tertiary, #2a2a2a);
    border-radius: var(--radius-sm, 4px);
    overflow: hidden;
  }

  /* Effective value visualization bar */
  .effective-bar {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    background: linear-gradient(
      90deg,
      var(--color-primary, #6366f1) 0%,
      var(--color-primary-light, #818cf8) 100%
    );
    opacity: 0.3;
    transition: width 0.05s linear;
    pointer-events: none;
  }

  .has-modulation .effective-bar {
    background: linear-gradient(
      90deg,
      var(--color-warning, #f59e0b) 0%,
      var(--color-primary, #6366f1) 100%
    );
    opacity: 0.5;
  }

  /* Base value indicator line */
  .base-indicator {
    position: absolute;
    top: 2px;
    bottom: 2px;
    width: 2px;
    background: var(--color-success, #22c55e);
    transform: translateX(-50%);
    z-index: 2;
    pointer-events: none;
  }

  /* Override range slider styling */
  .range-slider {
    position: relative;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    background: transparent;
    -webkit-appearance: none;
    appearance: none;
    z-index: 3;
    cursor: pointer;
  }

  .range-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 20px;
    background: var(--text-primary, #ffffff);
    border-radius: 3px;
    cursor: grab;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .range-slider::-webkit-slider-thumb:active {
    cursor: grabbing;
  }

  .range-slider::-moz-range-thumb {
    width: 16px;
    height: 20px;
    background: var(--text-primary, #ffffff);
    border-radius: 3px;
    cursor: grab;
    border: none;
  }

  .range-slider:disabled {
    cursor: not-allowed;
  }
</style>
