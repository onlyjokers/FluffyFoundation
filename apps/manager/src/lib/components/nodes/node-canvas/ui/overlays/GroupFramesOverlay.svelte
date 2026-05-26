<!-- Purpose: Render group frames and group actions overlay. -->
<script lang="ts">
  // @ts-nocheck
  import { tick } from 'svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { createObserveActionOverflow } from './group-frame-actions';

  type GroupFrame = {
    group: {
      id: string;
      name?: string;
      disabled?: boolean;
      kind?: 'group' | 'ai-space';
      minimized?: boolean;
      runtimeActive?: boolean;
    };
    left: number;
    top: number;
    width: number;
    height: number;
    effectiveDisabled?: boolean;
  };

  export let frames: GroupFrame[] = [];
  export let areaTransform: { k: number; tx: number; ty: number } | null = null;
  export let isRunning = false;
  export let editModeGroupId: string | null = null;
  export let selectedGroupId: string | null = null;
  export let toast: { groupId: string; message: string } | null = null;
  export let customNodeGroupIds: Set<string> | null = null;
  export let onToggleDisabled: (groupId: string) => void = () => undefined;
  export let onToggleMinimized: (groupId: string) => void = () => undefined;
  export let onToggleEditMode: (groupId: string) => void = () => undefined;
  export let onNodelize: (groupId: string) => void = () => undefined;
  export let onDenodelize: (groupId: string) => void = () => undefined;
  export let onCollapseCustomNode: (groupId: string) => void = () => undefined;
  export let onDisassemble: (groupId: string) => void = () => undefined;
  export let onRename: (groupId: string, name: string) => void = () => undefined;
  export let onHeaderPointerDown: (groupId: string, event: PointerEvent) => void = () => undefined;
  export let edgeHighlight: { groupId: string; side: 'input' | 'output' } | null = null;

  let editingGroupId: string | null = null;
  let draftName = '';
  let nameInputEl: HTMLInputElement | null = null;
  let actionCompactByGroupId: Record<string, boolean> = {};
  let k = 1;
  let tx = 0;
  let ty = 0;

  $: k = Number(areaTransform?.k ?? 1) || 1;
  $: tx = Number(areaTransform?.tx ?? 0) || 0;
  $: ty = Number(areaTransform?.ty ?? 0) || 0;

  const observeActionOverflow = createObserveActionOverflow({
    getCompact: (groupId) => Boolean(actionCompactByGroupId[groupId]),
    setCompact: (groupId, compact) => {
      actionCompactByGroupId = { ...actionCompactByGroupId, [groupId]: compact };
    },
    clearCompact: (groupId) => {
      if (!(groupId in actionCompactByGroupId)) return;
      const next = { ...actionCompactByGroupId };
      delete next[groupId];
      actionCompactByGroupId = next;
    },
  });

  async function startEdit(group: GroupFrame['group']) {
    editingGroupId = String(group?.id ?? '');
    draftName = String(group?.name ?? 'Group');
    await tick();
    nameInputEl?.focus?.();
    nameInputEl?.select?.();
  }

  function commitEdit() {
    if (!editingGroupId) return;
    const trimmed = draftName.trim();
    if (trimmed) onRename(editingGroupId, trimmed);
    editingGroupId = null;
  }

  function cancelEdit() {
    editingGroupId = null;
  }

  function handleActionsWheel(event: WheelEvent) {
    const el = event.currentTarget as HTMLDivElement | null;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth + 1) return;

    event.stopPropagation();
    event.preventDefault();

    const dx = event.deltaX;
    const dy = event.deltaY;
    const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    el.scrollLeft += delta;
  }
</script>

{#if frames.length > 0}
  <div
    class="group-frame-layer"
    style="transform: translate({tx}px, {ty}px) scale({k}); transform-origin: 0 0;"
  >
    {#each frames as frame (frame.group.id)}
      {@const group = frame.group}
      {@const isEditing = editModeGroupId === group.id}
      {@const toastMessage = toast?.groupId === group.id ? toast.message : ''}
      {@const runtimeGateClosed = group.runtimeActive === false}
      {@const gateClosed = !isRunning || frame.effectiveDisabled}
      {@const isMinimized = Boolean(group.minimized)}
      {@const isAiSpace = group.kind === 'ai-space'}
      {@const isCustomNodeGroup = Boolean(customNodeGroupIds?.has?.(group.id))}
      {@const isActionsCompact = Boolean(actionCompactByGroupId[String(group.id)])}
      {@const highlightSide = edgeHighlight?.groupId === group.id ? edgeHighlight.side : null}
      {@const isSelected = selectedGroupId === group.id}
      {@const gateReason = !isRunning
        ? 'Graph STOP'
        : frame.effectiveDisabled
          ? group.disabled
            ? 'Gate closed'
            : runtimeGateClosed
              ? 'Input gate closed'
              : 'Parent gate closed'
          : 'Gate open'}
      {#if !isMinimized}
        <div
          class="group-frame {isAiSpace ? 'ai-space' : ''} {gateClosed ? 'disabled' : ''} {isEditing
            ? 'editing'
            : ''} {isSelected ? 'selected' : ''} {highlightSide === 'input'
            ? 'edge-highlight-input'
            : ''} {highlightSide === 'output' ? 'edge-highlight-output' : ''}"
          style="left: {frame.left}px; top: {frame.top}px; width: {frame.width}px; height: {frame.height}px;"
        >
          <div class="group-frame-header">
            <div class="group-frame-title-row">
              <button
                type="button"
                class="group-frame-drag-handle"
                title="Drag frame"
                aria-label="Drag frame"
                on:pointerdown|stopPropagation={(event) =>
                  onHeaderPointerDown(String(group.id), event)}
              >
                ::
              </button>
              {#if editingGroupId === group.id}
                <div class="group-frame-title editing">
                  <input
                    class="group-frame-title-input"
                    bind:this={nameInputEl}
                    bind:value={draftName}
                    on:pointerdown|stopPropagation
                    on:keydown={(e) => {
                      if (e.key === 'Enter') commitEdit();
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    on:blur={commitEdit}
                  />
                </div>
              {:else}
                <button
                  type="button"
                  class="group-frame-title"
                  on:pointerdown|stopPropagation={(event) =>
                    onHeaderPointerDown(String(group.id), event)}
                  on:click={() => startEdit(group)}
                  on:keydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') startEdit(group);
                  }}
                  title={gateReason}
                >
                  <span class="group-frame-title-name">{group.name ?? 'Group'}</span>
                </button>
              {/if}
            </div>
            <div
              class="group-frame-actions"
              on:wheel={handleActionsWheel}
              use:observeActionOverflow={String(group.id)}
            >
              {#if isCustomNodeGroup}
                <Button
                  variant="ghost"
                  size="sm"
                  ariaLabel="Collapse"
                  title="Collapse"
                  on:click={() => onCollapseCustomNode(group.id)}
                >
                  {#if isActionsCompact}▣{:else}Collapse{/if}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  ariaLabel="Denodelize"
                  title="Denodelize"
                  on:click={() => onDenodelize(group.id)}
                >
                  {#if isActionsCompact}↩{:else}Denodelize{/if}
                </Button>
              {:else}
                {#if !isAiSpace}
                  <Button
                    variant="ghost"
                    size="sm"
                    ariaLabel="Nodelization"
                    title="Nodelization"
                    on:click={() => onNodelize(group.id)}
                  >
                    {#if isActionsCompact}⧉{:else}Nodelization{/if}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    ariaLabel="Minimize"
                    title="Minimize"
                    on:click={() => onToggleMinimized(group.id)}
                  >
                    {#if isActionsCompact}▁{:else}Minimize{/if}
                  </Button>
                {/if}
                <Button
                  variant={isEditing ? 'primary' : 'ghost'}
                  size="sm"
                  ariaLabel={isEditing ? 'Editing' : 'Edit Group'}
                  title={isEditing ? 'Editing' : 'Edit Group'}
                  on:click={() => onToggleEditMode(group.id)}
                >
                  {#if isActionsCompact}✎{:else}{isEditing ? 'Editing…' : 'Edit Group'}{/if}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  ariaLabel="Disassemble"
                  title="Disassemble"
                  on:click={() => onDisassemble(group.id)}
                >
                  {#if isActionsCompact}✂{:else}Disassemble{/if}
                </Button>
              {/if}
              <Button
                variant={group.disabled ? 'primary' : 'ghost'}
                size="sm"
                ariaLabel={group.disabled ? 'Activate group' : 'Deactivate group'}
                title={group.disabled ? 'Activate group' : 'Deactivate group'}
                on:click={() => onToggleDisabled(group.id)}
              >
                {#if isActionsCompact}⏻{:else}{group.disabled
                    ? 'Activate group'
                    : 'Deactivate group'}{/if}
              </Button>
            </div>
          </div>

          {#if toastMessage}
            <div class="group-frame-toast" aria-live="polite">
              {toastMessage}
            </div>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .group-frame-layer {
    position: absolute;
    inset: 0;
    z-index: 5;
    pointer-events: none;
  }

  .group-frame {
    position: absolute;
    border-radius: 26px;
    border: 2px solid rgba(59, 130, 246, 0.65);
    background: rgba(59, 130, 246, 0.03);
    box-shadow:
      0 0 0 1px rgba(59, 130, 246, 0.16),
      0 18px 64px rgba(59, 130, 246, 0.06);
    pointer-events: none;
  }

  .group-frame.disabled {
    border-color: rgba(148, 163, 184, 0.55);
    background: rgba(148, 163, 184, 0.04);
    box-shadow:
      0 0 0 1px rgba(148, 163, 184, 0.14),
      0 18px 64px rgba(148, 163, 184, 0.06);
  }

  .group-frame.selected {
    border-color: rgba(99, 102, 241, 0.95);
    box-shadow:
      0 0 0 1px rgba(99, 102, 241, 0.22),
      0 18px 64px rgba(99, 102, 241, 0.1);
  }

  .group-frame.ai-space {
    border-color: rgba(34, 197, 94, 0.72);
    background: rgba(34, 197, 94, 0.035);
    box-shadow:
      0 0 0 1px rgba(34, 197, 94, 0.18),
      0 18px 64px rgba(34, 197, 94, 0.08);
  }

  .group-frame.ai-space.selected {
    border-color: rgba(22, 163, 74, 0.98);
    box-shadow:
      0 0 0 1px rgba(34, 197, 94, 0.26),
      0 18px 64px rgba(34, 197, 94, 0.12);
  }

  .group-frame.disabled.selected {
    border-color: rgba(148, 163, 184, 0.7);
    box-shadow:
      0 0 0 1px rgba(148, 163, 184, 0.22),
      0 18px 64px rgba(148, 163, 184, 0.08);
  }

  .group-frame.edge-highlight-input {
    border-left-width: 4px;
    border-left-color: rgba(245, 158, 11, 0.95);
    box-shadow:
      0 0 0 1px rgba(245, 158, 11, 0.22),
      0 18px 64px rgba(245, 158, 11, 0.08);
  }

  .group-frame.edge-highlight-output {
    border-right-width: 4px;
    border-right-color: rgba(99, 102, 241, 0.95);
    box-shadow:
      0 0 0 1px rgba(99, 102, 241, 0.18),
      0 18px 64px rgba(99, 102, 241, 0.08);
  }

  .group-frame.editing {
    animation: group-frame-pulse 1.4s ease-in-out infinite;
  }

  .group-frame.disabled.editing {
    animation-name: group-frame-pulse-disabled;
  }

  .group-frame.ai-space.editing {
    animation-name: ai-space-frame-pulse;
  }

  .group-frame.ai-space.disabled.editing {
    animation-name: group-frame-pulse-disabled;
  }

  .group-frame-header {
    position: absolute;
    top: 12px;
    left: 18px;
    right: 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    min-width: 0;
    overflow: hidden;
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
  }

  .group-frame-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    /* Reserve the native Rete Group Gate socket anchored at the header start. */
    padding-left: 32px;
  }

  .group-frame-drag-handle {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    flex: 0 1 26px;
    min-width: 0;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 6, 23, 0.45);
    color: rgba(148, 163, 184, 0.9);
    font-weight: 800;
    font-size: 13px;
    line-height: 1;
    letter-spacing: 1px;
    pointer-events: auto;
    cursor: grab;
  }

  .group-frame-drag-handle:active {
    cursor: grabbing;
  }

  .group-frame-header:active,
  .group-frame-header:active *,
  .group-frame-header *:active {
    cursor: grabbing;
  }

  .group-frame-title {
    appearance: none;
    display: inline-flex;
    align-items: center;
    height: 26px;
    padding: 0 10px;
    border-radius: 999px;
    font-size: 11px;
    font-family: inherit;
    color: rgba(255, 255, 255, 0.75);
    background: rgba(2, 6, 23, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(12px);
    white-space: nowrap;
    gap: 8px;
    cursor: pointer;
    flex: 0 1 auto;
    min-width: 0;
    max-width: 100%;
    pointer-events: auto;
  }

  .group-frame-title.editing {
    cursor: default;
  }

  .group-frame-title-name {
    font-weight: 700;
    letter-spacing: 0.2px;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .group-frame-title-count {
    color: rgba(148, 163, 184, 0.95);
    font-variant-numeric: tabular-nums;
    flex: 0 0 auto;
  }

  .group-frame-gate {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 8px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.2px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 6, 23, 0.35);
    color: rgba(255, 255, 255, 0.82);
  }

  .group-frame-gate.open {
    border-color: rgba(34, 197, 94, 0.45);
    background: rgba(34, 197, 94, 0.14);
    color: rgba(187, 247, 208, 0.95);
  }

  .group-frame-gate.closed {
    border-color: rgba(148, 163, 184, 0.4);
    background: rgba(148, 163, 184, 0.12);
    color: rgba(226, 232, 240, 0.92);
  }

  .group-frame-title-input {
    width: min(220px, 42vw);
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.9);
    font-size: 11px;
    outline: none;
    cursor: text;
    user-select: text;
    -webkit-user-select: text;
  }

  .group-frame-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    pointer-events: auto;
    flex-wrap: nowrap;
    white-space: nowrap;
    flex: 0 1 auto;
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .group-frame-actions :global(.btn) {
    border-radius: 999px;
    white-space: nowrap;
  }

  .group-frame-actions::-webkit-scrollbar {
    display: none;
  }

  .group-frame-toast {
    position: absolute;
    top: 46px;
    left: 50%;
    transform: translateX(-50%);
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    background: rgba(2, 6, 23, 0.58);
    border: 1px solid rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(12px);
    pointer-events: none;
    white-space: nowrap;
    max-width: min(520px, calc(100% - 48px));
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @keyframes group-frame-pulse {
    0%,
    100% {
      border-color: rgba(59, 130, 246, 0.65);
      background: rgba(59, 130, 246, 0.03);
      box-shadow:
        0 0 0 1px rgba(59, 130, 246, 0.16),
        0 18px 64px rgba(59, 130, 246, 0.06);
    }
    50% {
      border-color: rgba(59, 130, 246, 0.22);
      background: rgba(59, 130, 246, 0.01);
      box-shadow:
        0 0 0 1px rgba(59, 130, 246, 0.08),
        0 18px 64px rgba(59, 130, 246, 0.03);
    }
  }

  @keyframes group-frame-pulse-disabled {
    0%,
    100% {
      border-color: rgba(148, 163, 184, 0.55);
      background: rgba(148, 163, 184, 0.04);
      box-shadow:
        0 0 0 1px rgba(148, 163, 184, 0.14),
        0 18px 64px rgba(148, 163, 184, 0.06);
    }
    50% {
      border-color: rgba(148, 163, 184, 0.22);
      background: rgba(148, 163, 184, 0.02);
      box-shadow:
        0 0 0 1px rgba(148, 163, 184, 0.08),
        0 18px 64px rgba(148, 163, 184, 0.03);
    }
  }

  @keyframes ai-space-frame-pulse {
    0%,
    100% {
      border-color: rgba(34, 197, 94, 0.72);
      background: rgba(34, 197, 94, 0.035);
      box-shadow:
        0 0 0 1px rgba(34, 197, 94, 0.18),
        0 18px 64px rgba(34, 197, 94, 0.08);
    }
    50% {
      border-color: rgba(34, 197, 94, 0.24);
      background: rgba(34, 197, 94, 0.012);
      box-shadow:
        0 0 0 1px rgba(34, 197, 94, 0.09),
        0 18px 64px rgba(34, 197, 94, 0.04);
    }
  }
</style>
