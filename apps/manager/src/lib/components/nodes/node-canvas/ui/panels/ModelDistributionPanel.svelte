<script lang="ts">
  import { get } from 'svelte/store';
  import { onDestroy } from 'svelte';
  import { assetsStore, type AssetRecord } from '$lib/stores/assets';
  import { modelDistributionStore } from '$lib/stores/model-distribution';
  import { nodeGroupsState } from '$lib/project/nodeGraphUiState';
  import { state as managerState } from '$lib/stores/manager';

  export let onClose: () => void = () => undefined;

  type GroupRow = { id: string; name: string };
  type Distribution = Record<string, string[]>;

  let selectedGroupId = '';
  let search = '';

  let groups: GroupRow[] = [];
  let modelAssets: AssetRecord[] = [];
  let distribution: Distribution = {};

  const unsubGroups = nodeGroupsState.subscribe((raw) => {
    const next = (raw ?? [])
      .map((g) => ({ id: String(g?.id ?? ''), name: String(g?.name ?? 'Group') }))
      .filter((g) => g.id);
    next.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    groups = next;
    if (!selectedGroupId && next.length > 0) {
      selectedGroupId = next[0].id;
    }
  });

  const unsubAssets = assetsStore.subscribe((s) => {
    const assets = (s.assets ?? []).filter((a) => a.kind === 'model');
    assets.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    modelAssets = assets;
  });

  const unsubDist = modelDistributionStore.subscribe((mapping) => {
    distribution = (mapping ?? {}) as Distribution;
  });

  const cleanup = () => {
    unsubGroups();
    unsubAssets();
    unsubDist();
  };

  onDestroy(() => {
    cleanup();
  });

  $: selectedIds = new Set((distribution[selectedGroupId] ?? []).map(String));

  $: filteredAssets = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return modelAssets;
    return modelAssets.filter((a) => {
      const name = String(a.originalName ?? '').toLowerCase();
      const id = String(a.id ?? '').toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  })();

  const currentOwner = () => {
    const groupId = String(selectedGroupId ?? '');
    if (!groupId) return '';
    const o = (get(managerState).controlPlane.ownership ?? {})[groupId];
    const stackRaw = (o as { ownerStack?: unknown } | undefined)?.ownerStack;
    const stack = Array.isArray(stackRaw) ? stackRaw.map(String).filter(Boolean) : [];
    return stack.length > 0 ? stack[stack.length - 1] : '';
  };

  const setChecked = (assetId: string, checked: boolean) => {
    const groupId = String(selectedGroupId ?? '').trim();
    if (!groupId) return;
    const next = new Set((distribution[groupId] ?? []).map(String));
    if (checked) next.add(assetId);
    else next.delete(assetId);
    modelDistributionStore.setGroupModels(groupId, Array.from(next));
  };

  const handleCheckboxChange = (assetId: string, event: Event) => {
    const target = event.currentTarget;
    const checked =
      target && typeof (target as { checked?: unknown }).checked === 'boolean'
        ? Boolean((target as { checked?: unknown }).checked)
        : false;
    setChecked(assetId, checked);
  };

  const clearGroup = () => {
    const groupId = String(selectedGroupId ?? '').trim();
    if (!groupId) return;
    modelDistributionStore.clearGroup(groupId);
  };

  $: ownerLabel = currentOwner();
</script>

<div class="model-panel" on:pointerdown|stopPropagation>
  <div class="model-panel-header">
    <div class="model-panel-title">Model Distribution</div>
    <button class="model-panel-close" type="button" on:click={() => (cleanup(), onClose())}>
      ✕
    </button>
  </div>

  <div class="model-panel-body">
    <div class="row">
      <label class="label" for="group">Group</label>
      <select id="group" class="select" bind:value={selectedGroupId}>
        {#each groups as g (g.id)}
          <option value={g.id}>{g.name} · {g.id}</option>
        {/each}
      </select>
    </div>

    <div class="meta">
      <div class="meta-row">
        <span class="meta-k">Owner</span>
        <span class="meta-v">{ownerLabel || 'n/a'}</span>
      </div>
      <div class="meta-row">
        <span class="meta-k">Models</span>
        <span class="meta-v">{selectedIds.size}</span>
      </div>
      <button class="btn" type="button" on:click={clearGroup} disabled={!selectedGroupId}>
        Clear
      </button>
    </div>

    <div class="row">
      <label class="label" for="search">Search</label>
      <input
        id="search"
        class="input"
        type="text"
        bind:value={search}
        placeholder="onnx / gguf / id"
      />
    </div>

    {#if !selectedGroupId}
      <div class="empty">Create a group first.</div>
    {:else if modelAssets.length === 0}
      <div class="empty">No model assets uploaded yet.</div>
    {:else}
      <div class="list">
        {#each filteredAssets as asset (asset.id)}
          <label class="item">
            <input
              type="checkbox"
              checked={selectedIds.has(asset.id)}
              on:change={(e) => handleCheckboxChange(asset.id, e)}
            />
            <span class="item-main">
              <span class="item-name">{asset.originalName}</span>
              <span class="item-sub">{asset.id}</span>
            </span>
          </label>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .model-panel {
    position: absolute;
    top: 54px;
    right: 14px;
    width: 460px;
    max-width: calc(100% - 28px);
    max-height: min(520px, calc(100% - 78px));
    z-index: 30;
    overflow: hidden;
    border-radius: 14px;
    background: rgba(15, 23, 42, 0.95);
    border: 1px solid rgba(34, 197, 94, 0.35);
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(14px);
    display: flex;
    flex-direction: column;
    color: rgba(255, 255, 255, 0.85);
  }

  .model-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 10px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    gap: 10px;
  }

  .model-panel-title {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.2px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .model-panel-close {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 6, 23, 0.25);
    color: rgba(255, 255, 255, 0.8);
    border-radius: 10px;
    padding: 4px 8px;
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
  }

  .model-panel-close:hover {
    border-color: rgba(34, 197, 94, 0.55);
    background: rgba(2, 6, 23, 0.32);
  }

  .model-panel-body {
    padding: 10px 10px 12px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .row {
    display: grid;
    grid-template-columns: 76px 1fr;
    gap: 10px;
    align-items: center;
  }

  .label {
    font-size: 12px;
    color: rgba(148, 163, 184, 0.95);
  }

  .select,
  .input {
    width: 100%;
    padding: 6px 8px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 6, 23, 0.25);
    color: rgba(255, 255, 255, 0.85);
    font-size: 12px;
  }

  .meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(2, 6, 23, 0.18);
    border-radius: 12px;
    padding: 8px 10px;
  }

  .meta-row {
    display: flex;
    gap: 8px;
    font-size: 11px;
    align-items: baseline;
  }

  .meta-k {
    color: rgba(148, 163, 184, 0.95);
  }

  .meta-v {
    color: rgba(255, 255, 255, 0.85);
    font-variant-numeric: tabular-nums;
  }

  .btn {
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 6, 23, 0.25);
    color: rgba(255, 255, 255, 0.8);
    border-radius: 10px;
    padding: 6px 10px;
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
  }

  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .item {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(2, 6, 23, 0.22);
    border-radius: 12px;
    padding: 8px 10px;
    cursor: pointer;
  }

  .item input {
    margin-top: 2px;
  }

  .item-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .item-name {
    font-size: 12px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-sub {
    font-size: 11px;
    color: rgba(148, 163, 184, 0.95);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty {
    font-size: 12px;
    color: rgba(148, 163, 184, 0.95);
    padding: 10px 0;
  }
</style>
