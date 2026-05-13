<!-- Purpose: Header controls for a Rete node, including collapse, custom-node, and group-frame actions. -->
<script lang="ts">
  export let label = '';
  export let isCollapsed = false;
  export let isCustomNode = false;
  export let customRole: string | null = null;
  export let isGroupFrameNode = false;
  export let groupFrameDisabled = false;
  export let toggleCollapsed: (event: Event) => void = () => undefined;
  export let toggleGroupDisabled: () => void = () => undefined;
  export let toggleGroupMinimized: () => void = () => undefined;
  export let requestCustomUncouple: (event: Event) => void = () => undefined;
  export let requestCustomExpand: (event: Event) => void = () => undefined;
</script>

<div class="title" data-testid="title">
  {#if isGroupFrameNode}
    <div class="group-frame-gate-slot" aria-hidden="true" />
  {:else}
    <button
      type="button"
      class="collapse-toggle"
      aria-label={isCollapsed ? 'Expand node' : 'Minimize node'}
      aria-pressed={isCollapsed}
      title={isCollapsed ? 'Expand' : 'Minimize'}
      on:pointerdown|stopPropagation|preventDefault
      on:click={(event) => toggleCollapsed(event)}
    />
  {/if}
  <span class="title-label">{label}</span>
  {#if isCustomNode}
    {#if customRole === 'child'}
      <button
        type="button"
        class="custom-node-uncouple"
        aria-label="Uncoupled (fork)"
        title="Uncoupled (fork into a new Custom Node)"
        on:pointerdown|stopPropagation|preventDefault
        on:click={requestCustomUncouple}
      >
        Uncoupled
      </button>
    {:else if customRole === 'mother'}
      <button
        type="button"
        class="custom-node-expand"
        aria-label="Expand node"
        title="Expand"
        on:pointerdown|stopPropagation|preventDefault
        on:click={requestCustomExpand}
      >
        Expand
      </button>
    {/if}
  {/if}
  {#if isGroupFrameNode}
    <button
      type="button"
      class="group-frame-active-toggle {groupFrameDisabled ? 'off' : 'on'}"
      aria-label={groupFrameDisabled ? 'Activate group' : 'Deactivate group'}
      aria-pressed={!groupFrameDisabled}
      title={groupFrameDisabled ? 'Activate group' : 'Deactivate group'}
      on:pointerdown|stopPropagation|preventDefault
      on:click={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleGroupDisabled();
      }}
    >
      <span class="group-frame-active-thumb" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="group-frame-expand"
      aria-label="Expand group"
      title="Expand group"
      on:pointerdown|stopPropagation|preventDefault
      on:click={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleGroupMinimized();
      }}
    >
      Expand
    </button>
  {/if}
</div>

<style>
  .title {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: visible;
    padding: 10px 12px;
    font-weight: 700;
    letter-spacing: 0.2px;
    color: rgba(255, 255, 255, 0.92);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  :global(.node.collapsed) .title {
    border-bottom: none !important;
  }

  :global(.node.group-disabled) .title {
    color: rgba(226, 232, 240, 0.7);
  }

  :global(.node.group-port-activate) .title {
    padding: 8px 10px;
    font-size: 12px;
    border-bottom: none;
    text-align: center;
  }

  .collapse-toggle {
    appearance: none;
    position: relative;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(148, 163, 184, 0.55);
    background: rgba(148, 163, 184, 0.35);
    width: 12px;
    height: 12px;
    border-radius: 999px;
    padding: 0;
    flex: 0 0 auto;
    cursor: pointer;
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.2),
      0 4px 10px rgba(0, 0, 0, 0.3);
  }

  .collapse-toggle:hover {
    background: rgba(148, 163, 184, 0.5);
    border-color: rgba(148, 163, 184, 0.7);
  }

  .collapse-toggle:active {
    transform: scale(0.95);
  }

  .title-label {
    min-width: 0;
    flex: 1;
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.15;
  }

  :global(.node.collapsed) .title-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .group-frame-gate-slot {
    width: 14px;
    height: 14px;
    border-radius: 999px;
    flex: 0 0 auto;
    pointer-events: none;
    opacity: 0;
  }

  .group-frame-active-toggle {
    appearance: none;
    position: relative;
    width: 34px;
    height: 18px;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.4);
    background: rgba(148, 163, 184, 0.22);
    padding: 0;
    flex: 0 0 auto;
    cursor: pointer;
    transition:
      background 160ms ease,
      border-color 160ms ease;
  }

  .group-frame-active-toggle.on {
    border-color: rgba(34, 197, 94, 0.55);
    background: rgba(34, 197, 94, 0.28);
  }

  .group-frame-active-toggle.off {
    border-color: rgba(148, 163, 184, 0.4);
    background: rgba(148, 163, 184, 0.2);
  }

  .group-frame-active-thumb {
    position: absolute;
    top: 50%;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.9);
    transform: translateY(-50%);
    transition: transform 160ms ease;
  }

  .group-frame-active-toggle.on .group-frame-active-thumb {
    transform: translate(16px, -50%);
  }

  .custom-node-uncouple,
  .custom-node-expand,
  .group-frame-expand {
    appearance: none;
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 10px;
    border-radius: 999px;
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.2px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 6, 23, 0.35);
    color: rgba(255, 255, 255, 0.82);
    cursor: pointer;
    flex: 0 0 auto;
  }

  .custom-node-uncouple:hover {
    background: rgba(2, 6, 23, 0.52);
  }

  .custom-node-expand:hover,
  .group-frame-expand:hover {
    background: rgba(2, 6, 23, 0.48);
    border-color: rgba(255, 255, 255, 0.18);
  }
</style>
