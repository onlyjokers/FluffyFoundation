<script lang="ts">
  import { parameterRegistry, parameterWritable } from '$lib/parameters';
  import { writable, type Writable } from 'svelte/store';
  import type { Parameter } from '$lib/parameters';
  import Slider from '$lib/components/ui/Slider.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Toggle from '$lib/components/ui/Toggle.svelte';
  import Select from '$lib/components/ui/Select.svelte';
  import Button from '$lib/components/ui/Button.svelte';

  export let path: string;
  export let label: string | undefined = undefined;
  export let description: string | undefined = undefined;
  export let disabled = false;

  let param: Parameter<unknown> | undefined;
  let store: Writable<unknown> = writable(0);
  let widget: string | undefined;
  let type: string | undefined;
  let min: number | undefined;
  let max: number | undefined;
  let step: number | undefined;
  let enumOptions:
    | {
        value: string;
        label?: string;
      }[]
    | undefined;

  $: param = parameterRegistry.get(path) as Parameter<unknown> | undefined;
  $: store = param ? (parameterWritable(param) as Writable<unknown>) : store;
  $: widget = param?.metadata?.widgetType;
  $: type = param?.type;
  $: min = param?.min;
  $: max = param?.max;
  $: enumOptions = param?.enumOptions as
    | {
        value: string;
        label?: string;
      }[]
    | undefined;
  $: step = param?.metadata?.step;
  $: numberValue = typeof $store === 'number' ? $store : Number($store ?? 0);
  $: stringValue = typeof $store === 'string' || typeof $store === 'number' ? $store : String($store ?? '');
  $: booleanValue = Boolean($store);

  function handleTrigger() {
    param?.setValue(true, 'ui');
    // Immediately reset to default to avoid sticky button
    param?.setValue(param.defaultValue, 'ui');
  }

  const eventDetail = (event: Event): unknown =>
    (event as CustomEvent<unknown>).detail;
</script>

{#if !param}
  <div class="param-missing">Missing param: {path}</div>
{:else if type === 'number' && (widget === 'slider' || widget === undefined)}
  <Slider
    value={numberValue}
    on:input={(event) => store.set(eventDetail(event))}
    min={min ?? 0}
    max={max ?? 1}
    step={step ?? 0.01}
    label={label ?? param.metadata?.label ?? param.path}
    {disabled}
  />
{:else if type === 'number'}
  <Input
    type="number"
    value={numberValue}
    on:input={(event) => store.set(eventDetail(event))}
    min={min ?? 0}
    max={max ?? 1}
    step={step ?? 0.01}
    label={label ?? param.metadata?.label ?? param.path}
    {disabled}
  />
{:else if type === 'boolean'}
  <Toggle
    checked={booleanValue}
    on:change={(event) => store.set(eventDetail(event))}
    label={label ?? param.metadata?.label ?? param.path}
    description={description ?? param.metadata?.description}
    class="param-toggle"
  />
{:else if type === 'enum'}
  <Select
    bind:value={$store}
    options={enumOptions?.map((opt) => ({
      value: opt.value,
      label: opt.label ?? opt.value,
    })) ?? []}
    label={label ?? param.metadata?.label ?? param.path}
    {disabled}
  />
{:else if type === 'trigger'}
  <Button variant="secondary" size="sm" fullWidth on:click={handleTrigger} {disabled}>
    {label ?? param.metadata?.label ?? param.path}
  </Button>
{:else}
  <Input
    value={stringValue}
    on:input={(event) => store.set(eventDetail(event))}
    label={label ?? param.metadata?.label ?? param.path}
    {disabled}
  />
{/if}

<style>
  .param-missing {
    padding: var(--space-sm);
    background: var(--bg-tertiary);
    border-radius: var(--radius-sm);
    color: var(--color-warning);
    font-size: var(--text-sm);
  }

  .param-toggle {
    width: 100%;
  }
</style>
