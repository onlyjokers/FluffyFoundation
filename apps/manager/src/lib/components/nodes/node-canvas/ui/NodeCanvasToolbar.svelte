<!-- Purpose: Toolbar controls for node canvas start/stop and file actions. -->
<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import { onDestroy } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import GroupIndexItem from './GroupIndexItem.svelte';
  import {
    nodeGraphEdgeShadows,
    nodeGraphLiveValues,
    nodeGraphPerfConsole,
    nodeGraphFlags,
    setEdgeShadows,
    setLiveValues,
    setPerfConsole,
  } from '$lib/features/node-graph-flags';

  export let isRunning = false;
  export let lastError: string | null = null;
  export let nodeCount = 0;
  export let groups: Array<{
    id: string;
    parentId: string | null;
    name: string;
    disabled: boolean;
    runtimeActive?: boolean;
  }> = [];
  export let onFocusGroup: (groupId: string) => void = () => undefined;

  export let isMenuOpen = false;
  export let toolbarMenuWrap: HTMLDivElement | null = null;

  export let onToggleEngine: () => void = () => undefined;
  export let onClear: () => void = () => undefined;
  export let onToggleMenu: () => void = () => undefined;
  export let onMenuPick: (action: () => void) => void = (action) => action();
  export let onImportGraph: () => void = () => undefined;
  export let onExportGraph: () => void = () => undefined;
  export let onImportCustomNode: () => void = () => undefined;
  export let onExportCustomNode: () => void = () => undefined;
  export let onImportTemplates: () => void = () => undefined;
  export let onExportTemplates: () => void = () => undefined;
  export let onToggleExecutorLogs: () => void = () => undefined;
  export let onToggleModelDistributionPanel: () => void = () => undefined;

  // Transient toolbar error pill: show on new error, auto-hide after 5s (or dismiss via X).
  let isErrorPillVisible = false;
  let errorPillMessage: string | null = null;
  let lastShownError: string | null = null;
  let errorPillTimer: ReturnType<typeof setTimeout> | null = null;

  // DEV-only toggles for Node Graph feature flags (Step 0.3).
  const showDevFlags = import.meta.env.DEV;

  type GroupIndexNode = {
    group: (typeof groups)[number];
    children: GroupIndexNode[];
  };

  let groupIndexRoots: GroupIndexNode[] = [];

  const buildGroupIndexTree = (raw: typeof groups): GroupIndexNode[] => {
    const normalized = (raw ?? [])
      .map((g) => ({
        id: String(g?.id ?? ''),
        parentId: g?.parentId ? String(g.parentId) : null,
        name: String(g?.name ?? 'Group'),
        disabled: Boolean(g?.disabled),
        runtimeActive: g?.runtimeActive,
      }))
      .filter((g) => g.id);

    const byId = new Map<string, GroupIndexNode>();
    for (const g of normalized) byId.set(g.id, { group: g, children: [] });

    // Build parent pointers (ignore missing/invalid parent IDs).
    const parentOf = new Map<string, string | null>();
    for (const g of normalized) {
      const pid = g.parentId ? String(g.parentId) : null;
      if (!pid || pid === g.id || !byId.has(pid)) parentOf.set(g.id, null);
      else parentOf.set(g.id, pid);
    }

    const wouldCreateCycle = (childId: string, parentId: string): boolean => {
      if (!childId || !parentId) return false;
      if (childId === parentId) return true;
      const visited = new Set<string>();
      let cursor: string | null = parentId;
      while (cursor) {
        if (cursor === childId) return true;
        if (visited.has(cursor)) return true; // cycle upstream
        visited.add(cursor);
        cursor = parentOf.get(cursor) ?? null;
      }
      return false;
    };

    const attached = new Set<string>();
    for (const g of normalized) {
      const node = byId.get(g.id);
      if (!node) continue;
      const pid = parentOf.get(g.id);
      if (!pid) continue;
      const parent = byId.get(pid) ?? null;
      if (!parent) continue;
      if (wouldCreateCycle(g.id, pid)) continue;
      parent.children.push(node);
      attached.add(g.id);
    }

    const roots: GroupIndexNode[] = [];
    for (const g of normalized) {
      if (!attached.has(g.id)) roots.push(byId.get(g.id)!);
    }

    // Fallback: if something is corrupted (e.g. cycles), never "hide" the index.
    if (roots.length === 0) return normalized.map((g) => byId.get(g.id)!).filter(Boolean);

    return roots;
  };

  $: groupIndexRoots = buildGroupIndexTree(groups);

  const showErrorPill = (message: string) => {
    const m = String(message ?? '').trim();
    if (!m) return;
    errorPillMessage = m;
    isErrorPillVisible = true;

    if (errorPillTimer) clearTimeout(errorPillTimer);
    errorPillTimer = setTimeout(() => {
      isErrorPillVisible = false;
      errorPillTimer = null;
    }, 5000);
  };

  const dismissErrorPill = () => {
    isErrorPillVisible = false;
    if (errorPillTimer) {
      clearTimeout(errorPillTimer);
      errorPillTimer = null;
    }
  };

  $: {
    const err = lastError ? String(lastError) : null;
    if (err && err !== lastShownError) {
      lastShownError = err;
      showErrorPill(err);
    }
    if (!err) {
      dismissErrorPill();
      errorPillMessage = null;
      lastShownError = null;
    }
  }

  onDestroy(() => {
    if (errorPillTimer) clearTimeout(errorPillTimer);
  });
</script>

<div class="canvas-toolbar-frame">
  <div class="canvas-toolbar pill-toolbar">
    <div class="toolbar-left">
      <Button
        variant={isRunning ? 'danger' : 'primary'}
        size="sm"
        on:click={onToggleEngine}
        ariaLabel={isRunning ? 'Stop' : 'Start'}
      >
        {isRunning ? '⏹' : '▶'}
      </Button>
    </div>

    {#if groupIndexRoots.length > 0}
      <div class="toolbar-center" aria-label="Group index">
        <div class="group-index-bar">
          {#each groupIndexRoots as node (node.group.id)}
            <GroupIndexItem {node} depth={0} onFocus={onFocusGroup} />
          {/each}
        </div>
      </div>
    {/if}

    <div class="toolbar-right">
      <div class="toolbar-menu-wrap" bind:this={toolbarMenuWrap}>
        <Button variant="ghost" size="sm" on:click={onToggleMenu}>⋯</Button>
        {#if isMenuOpen}
          <div class="toolbar-menu" role="menu" on:pointerdown|stopPropagation>
            <button
              type="button"
              class="toolbar-menu-item"
              on:click={() => onMenuPick(onImportGraph)}
            >
              ⬇ Import
            </button>
            <button
              type="button"
              class="toolbar-menu-item"
              on:click={() => onMenuPick(onExportGraph)}
            >
              ⬆ Export
            </button>
            <div class="toolbar-menu-sep" />
            <button
              type="button"
              class="toolbar-menu-item"
              on:click={() => onMenuPick(onImportCustomNode)}
            >
              ⬇ Import Custom Node
            </button>
            <button
              type="button"
              class="toolbar-menu-item"
              on:click={() => onMenuPick(onExportCustomNode)}
            >
              ⬆ Export Custom Node
            </button>
            <div class="toolbar-menu-sep" />
            <button
              type="button"
              class="toolbar-menu-item"
              on:click={() => onMenuPick(onImportTemplates)}
            >
              ⬇ Templates
            </button>
            <button
              type="button"
              class="toolbar-menu-item"
              on:click={() => onMenuPick(onExportTemplates)}
            >
              ⬆ Templates
            </button>
            <div class="toolbar-menu-sep" />
            <button type="button" class="toolbar-menu-item" on:click={() => onMenuPick(onClear)}>
              🗑️ Clear
            </button>
            <div class="toolbar-menu-sep" />
            <button
              type="button"
              class="toolbar-menu-item"
              on:click={() => onMenuPick(onToggleExecutorLogs)}
            >
              📜 Executor Logs
            </button>
            <button
              type="button"
              class="toolbar-menu-item"
              on:click={() => onMenuPick(onToggleModelDistributionPanel)}
            >
              🤖 Model Distribution
            </button>
            {#if showDevFlags}
              <div class="toolbar-menu-sep" />
              <div class="toolbar-menu-title">DEV</div>
              <button
                type="button"
                class="toolbar-menu-item"
                on:click={() => setPerfConsole(!$nodeGraphPerfConsole)}
              >
                Perf console: {$nodeGraphPerfConsole ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                class="toolbar-menu-item"
                on:click={() => setEdgeShadows(!$nodeGraphEdgeShadows)}
              >
                Edge shadows: {$nodeGraphEdgeShadows ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                class="toolbar-menu-item"
                on:click={() => setLiveValues(!$nodeGraphLiveValues)}
              >
                Live values: {$nodeGraphLiveValues ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                class="toolbar-menu-item"
                on:click={() => nodeGraphFlags.reset()}
                title="Reset node graph flags (localStorage)"
              >
                ↺ Reset flags
              </button>
            {/if}
            <div class="toolbar-menu-sep" />
            <div class="toolbar-menu-footer">{nodeCount} nodes · {groups.length} groups</div>
          </div>
        {/if}
      </div>

      {#if lastError}
        <button
          type="button"
          class="error-indicator"
          on:click={() => showErrorPill(String(lastError))}
          aria-label="Show last error"
          title={String(lastError)}
        >
          ⚠
        </button>
      {/if}
    </div>
  </div>

  {#if isErrorPillVisible && errorPillMessage}
    <div
      class="canvas-toolbar-error-pill"
      role="status"
      aria-live="polite"
      in:fly={{ y: -12, duration: 180, easing: cubicOut }}
      out:fly={{ y: -12, duration: 160, easing: cubicOut }}
    >
      <span aria-hidden="true">⚠️</span>
      <span class="error-text" title={errorPillMessage}>{errorPillMessage}</span>
      <button type="button" class="error-dismiss" aria-label="Dismiss error" on:click={dismissErrorPill}>
        ✕
      </button>
    </div>
  {/if}
</div>

<style>
  .canvas-toolbar-frame {
    position: absolute;
    top: var(--ui-pill-toolbar-top);
    left: 0;
    right: 0;
    margin-left: var(--space-2xl, 32px);
    margin-right: var(--space-2xl, 32px);
    z-index: 25;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: none;
  }

  .canvas-toolbar {
    width: 100%;
    --ui-pill-toolbar-gap: 14px;
    pointer-events: auto;
  }

  .toolbar-left {
    display: flex;
    gap: var(--space-sm, 8px);
    align-items: center;
    min-width: 0;
  }

  .toolbar-center {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .toolbar-right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .group-index-bar {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    overflow-x: auto;
    padding: 0;
    border-radius: 0;
    background: transparent;
    border: none;
    box-shadow: none;
    backdrop-filter: none;
  }

  .group-index-bar::-webkit-scrollbar {
    height: 0px;
  }

  .group-index-bar::-webkit-scrollbar-thumb {
    background: transparent;
  }

  .group-index-bar::-webkit-scrollbar-track {
    background: transparent;
  }

  .toolbar-menu-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .toolbar-menu {
    position: absolute;
    top: calc(100% + 10px);
    right: 0;
    z-index: 40;
    min-width: 180px;
    padding: 8px;
    border-radius: 14px;
    background: rgba(15, 23, 42, 0.94);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 18px 56px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(14px);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .toolbar-menu-item {
    width: 100%;
    border: none;
    border-radius: 12px;
    padding: 8px 10px;
    background: transparent;
    color: rgba(226, 232, 240, 0.92);
    font-size: 13px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }

  .toolbar-menu-item:hover {
    background: rgba(99, 102, 241, 0.18);
    color: rgba(255, 255, 255, 0.96);
  }

  .toolbar-menu-sep {
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
    margin: 6px 4px;
  }

  .toolbar-menu-title {
    padding: 2px 10px 0;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.45);
  }

  .toolbar-menu-footer {
    color: var(--text-muted, #666);
    font-size: var(--text-sm, 0.875rem);
    text-align: center;
    padding: 2px 6px;
  }

  .error-indicator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 28px;
    min-width: 28px;
    padding: 0 8px;
    border-radius: 999px;
    border: 1px solid rgba(239, 68, 68, 0.35);
    background: rgba(239, 68, 68, 0.12);
    color: rgba(254, 202, 202, 0.95);
    font-size: 14px;
    font-weight: 900;
    cursor: pointer;
  }

  .error-indicator:hover {
    border-color: rgba(239, 68, 68, 0.55);
    background: rgba(239, 68, 68, 0.18);
    color: rgba(254, 226, 226, 0.98);
  }

  .canvas-toolbar-error-pill {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 999px;
    background: rgba(239, 68, 68, 0.14);
    border: 1px solid rgba(239, 68, 68, 0.35);
    color: rgba(254, 226, 226, 0.95);
    box-shadow: 0 16px 56px rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(16px);
    max-width: min(920px, 100%);
    margin-top: -2px;
  }

  .error-text {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    font-weight: 650;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .error-dismiss {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 26px;
    min-width: 26px;
    padding: 0 6px;
    border: none;
    border-radius: 999px;
    background: rgba(2, 6, 23, 0.25);
    color: rgba(254, 202, 202, 0.95);
    font-weight: 900;
    cursor: pointer;
  }

  .error-dismiss:hover {
    background: rgba(2, 6, 23, 0.35);
    color: rgba(254, 226, 226, 0.98);
  }
</style>
