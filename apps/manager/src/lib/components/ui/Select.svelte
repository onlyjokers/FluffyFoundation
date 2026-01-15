<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let value: unknown;
  export let options: { value: unknown; label: string }[] = [];
  export let label = '';
  export let disabled = false;

  let className = '';
  export { className as class };

  const dispatch = createEventDispatcher<{
    change: Event;
    input: Event;
  }>();

  function handleChange(e: Event) {
    // Ensure `bind:value` updates before consumer sees the event.
    queueMicrotask(() => dispatch('change', e));
  }

  function handleInput(e: Event) {
    queueMicrotask(() => dispatch('input', e));
  }
</script>

<div class="select-wrapper {className}">
  {#if label}
    <label class="control-label" for="select-{label}">{label}</label>
  {/if}

  <select
    class="select"
    bind:value
    {disabled}
    id={label ? `select-${label}` : undefined}
    on:change={handleChange}
    on:input={handleInput}
  >
    {#each options as option}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
</div>

<style>
  .select-wrapper {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    width: 100%;
  }

  .select {
    width: 100%;
  }
</style>
