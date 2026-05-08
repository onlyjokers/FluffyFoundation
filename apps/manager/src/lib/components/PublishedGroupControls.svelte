<!--
Purpose: Lightweight Manager controls for published Groups without loading Root graph editor bundles.
-->
<script lang="ts">
  import { get } from 'svelte/store';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Slider from '$lib/components/ui/Slider.svelte';
  import Toggle from '$lib/components/ui/Toggle.svelte';
  import { getSDK, publishedGroups, buildPublishedGroupControl } from '$lib/stores/domain/group-controls';
  import type { PublishedGroup } from '$lib/stores/domain/group-controls';

  let selectedGroupId = 'audience';
  let color = '#6366f1';
  let opacity = 1;
  let vibrationMs = 80;
  let blink = false;

  $: groups = $publishedGroups;
  $: if (groups.length > 0 && !groups.some((group) => group.id === selectedGroupId)) {
    selectedGroupId = groups[0].id;
  }
  $: selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? groups[0] ?? null;

  function sender() {
    const sdk = getSDK();
    if (!sdk) return null;
    return {
      sendControl: sdk.sendControl.bind(sdk),
      sendPluginControl: sdk.sendPluginControl.bind(sdk),
    };
  }

  function controlFor(group: PublishedGroup | null) {
    const activeSender = sender();
    if (!group || !activeSender) return null;
    return buildPublishedGroupControl(group, activeSender);
  }

  function sendColor() {
    controlFor(selectedGroup)?.screenColor({ color, opacity, mode: 'solid' });
  }

  function sendVibration() {
    controlFor(selectedGroup)?.vibrate([vibrationMs]);
  }

  function sendFlashlight() {
    controlFor(selectedGroup)?.flashlight(blink ? 'blink' : 'on', blink ? { frequency: 2, dutyCycle: 0.5 } : undefined);
  }

  function stopSelected() {
    controlFor(selectedGroup)?.stop();
  }

  function stopAllPublished() {
    const activeSender = sender();
    if (!activeSender) return;
    for (const group of get(publishedGroups)) {
      buildPublishedGroupControl(group, activeSender).stop();
    }
  }
</script>

<Card title="Published Group Controls">
  <div class="group-controls" data-ff08-group-controls>
    <div class="group-list" role="tablist" aria-label="Published Groups">
      {#each groups as group (group.id)}
        <button
          type="button"
          class:active={group.id === selectedGroupId}
          role="tab"
          aria-selected={group.id === selectedGroupId}
          on:click={() => (selectedGroupId = group.id)}
        >
          <span>{group.name}</span>
          <small>{group.id}</small>
        </button>
      {/each}
    </div>

    {#if selectedGroup}
      <div class="selected-group">
        <div>
          <div class="group-name">{selectedGroup.name}</div>
          {#if selectedGroup.description}
            <div class="group-description">{selectedGroup.description}</div>
          {/if}
        </div>
        <Button variant="danger" size="sm" on:click={stopSelected}>Stop Group</Button>
      </div>

      <div class="control-grid">
        <label class="color-row">
          <span>Color</span>
          <input type="color" bind:value={color} aria-label="Group screen color" />
        </label>
        <Slider bind:value={opacity} min={0} max={1} step={0.05} label="Opacity" />
        <Button variant="primary" size="sm" on:click={sendColor}>Send Color</Button>

        <Slider bind:value={vibrationMs} min={10} max={500} step={10} label="Vibrate" suffix="ms" />
        <Button variant="secondary" size="sm" on:click={sendVibration}>Vibrate</Button>

        <Toggle bind:checked={blink} label="Blink flashlight" />
        <Button variant="secondary" size="sm" on:click={sendFlashlight}>Flashlight</Button>
      </div>

      <div class="stop-row">
        <Button variant="danger" size="sm" on:click={stopAllPublished}>Stop Published Groups</Button>
      </div>
    {:else}
      <div class="empty">No published Groups available</div>
    {/if}
  </div>
</Card>

<style>
  .group-controls {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .group-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .group-list button {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 108px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: var(--radius-md);
    background: rgba(255, 255, 255, 0.03);
    color: var(--text-primary);
    padding: 9px 11px;
    text-align: left;
    cursor: pointer;
  }

  .group-list button.active {
    border-color: rgba(99, 102, 241, 0.72);
    background: rgba(99, 102, 241, 0.18);
  }

  .group-list small,
  .group-description {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .selected-group {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
  }

  .group-name {
    color: var(--text-primary);
    font-weight: 700;
  }

  .control-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-md);
    align-items: end;
  }

  .color-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  .color-row input {
    width: 100%;
    height: 38px;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
  }

  .stop-row {
    display: flex;
    justify-content: flex-end;
  }

  .empty {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  @media (max-width: 720px) {
    .control-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
