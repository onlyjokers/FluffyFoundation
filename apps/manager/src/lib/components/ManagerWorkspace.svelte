<!--
Purpose: Classic Manager workspace for graph editing, assets, runtime controls, and operator panels.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { spring } from 'svelte/motion';
  import { state, interruptMedia } from '$lib/stores/manager';

  import AppShell from '$lib/layouts/AppShell.svelte';
  import ClientSelector from '$lib/components/ClientSelector.svelte';
  import DisplayPanel from '$lib/components/DisplayPanel.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Toggle from '$lib/components/ui/Toggle.svelte';
  import GeoControl from '$lib/features/location/GeoControl.svelte';
  import RegistryMidiPanel from '$lib/components/RegistryMidiPanel.svelte';
  import NodeCanvasRenderer from '$lib/components/nodes/NodeCanvasRenderer.svelte';
  import AssetsManager from '$lib/components/AssetsManager.svelte';
  import OperatorConsole from '$lib/components/OperatorConsole.svelte';
  import PluginsPanel from '$lib/components/PluginsPanel.svelte';
  import NodeManagerPanel from '$lib/components/NodeManagerPanel.svelte';
  import ArduinoUnoPanel from '$lib/components/ArduinoUnoPanel.svelte';

  export let serverUrl = 'https://localhost:3001';
  export let performanceMode = false;

  type WorkspaceTab =
    | 'dashboard'
    | 'assets'
    | 'registry-midi'
    | 'nodes'
    | 'node-manager'
    | 'operator'
    | 'plugins';
  let activePage: WorkspaceTab = 'dashboard';
  let tabsEl: HTMLDivElement | null = null;
  let tabDashboardEl: HTMLButtonElement | null = null;
  let tabAssetsEl: HTMLButtonElement | null = null;
  let tabRegistryMidiEl: HTMLButtonElement | null = null;
  let tabPluginsEl: HTMLButtonElement | null = null;
  let tabNodeManagerEl: HTMLButtonElement | null = null;
  let tabNodesEl: HTMLButtonElement | null = null;
  let tabOperatorEl: HTMLButtonElement | null = null;
  const tabSlider = spring(
    { x: 0, width: 0 },
    {
      stiffness: 0.18,
      damping: 0.72,
    }
  );

  function getActiveTabEl(): HTMLButtonElement | null {
    if (activePage === 'dashboard') return tabDashboardEl;
    if (activePage === 'assets') return tabAssetsEl;
    if (activePage === 'registry-midi') return tabRegistryMidiEl;
    if (activePage === 'plugins') return tabPluginsEl;
    if (activePage === 'node-manager') return tabNodeManagerEl;
    if (activePage === 'nodes') return tabNodesEl;
    if (activePage === 'operator') return tabOperatorEl;
    return null;
  }

  async function updateTabSlider() {
    await tick();
    if (!tabsEl) return;
    const button = getActiveTabEl();
    if (!button) return;
    const containerRect = tabsEl.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    tabSlider.set({ x: buttonRect.left - containerRect.left, width: buttonRect.width });
  }

  $: if (tabsEl && activePage) void updateTabSlider();
</script>

<svelte:window on:resize={() => void updateTabSlider()} />

<AppShell
  fullBleed={activePage === 'nodes' || activePage === 'assets' || activePage === 'node-manager'}
  collapseHeader={false}
>
  <div slot="headerActions">
    <Button variant="danger" size="sm" on:click={() => interruptMedia(true)}>Global Stop</Button>
  </div>

  <div slot="tabs" class="page-tabs" bind:this={tabsEl}>
    <div
      class="page-tabs-slider"
      aria-hidden="true"
      style="transform: translate3d({$tabSlider.x}px, 0, 0); width: {$tabSlider.width}px;"
    />
    <button
      bind:this={tabDashboardEl}
      class:active={activePage === 'dashboard'}
      on:click={() => (activePage = 'dashboard')}
    >
      Manager
    </button>
    <button
      bind:this={tabOperatorEl}
      class:active={activePage === 'operator'}
      on:click={() => (activePage = 'operator')}
    >
      Operator
    </button>
    <button
      bind:this={tabAssetsEl}
      class:active={activePage === 'assets'}
      on:click={() => (activePage = 'assets')}
    >
      Assets
    </button>
    <button
      bind:this={tabRegistryMidiEl}
      class:active={activePage === 'registry-midi'}
      on:click={() => (activePage = 'registry-midi')}
    >
      Registry MIDI
    </button>
    <button
      bind:this={tabPluginsEl}
      class:active={activePage === 'plugins'}
      on:click={() => (activePage = 'plugins')}
    >
      Plugins
    </button>
    <button
      bind:this={tabNodeManagerEl}
      class:active={activePage === 'node-manager'}
      on:click={() => (activePage = 'node-manager')}
    >
      Node Manager
    </button>
    <button
      bind:this={tabNodesEl}
      class:active={activePage === 'nodes'}
      on:click={() => (activePage = 'nodes')}
    >
      Node Graph
    </button>
  </div>

  <div class:hide={activePage !== 'dashboard'}>
    <div class="dashboard-grid">
      <div class="grid-item">
        <Card>
          <ClientSelector height={280} />
        </Card>
      </div>
      <div class="grid-item">
        <DisplayPanel {serverUrl} />
      </div>
      <div class="grid-item">
        <Card title="Performance Mode">
          <Toggle
            label="WebSocket-only"
            description="Lower jitter when stable; may fail on restrictive networks."
            bind:checked={performanceMode}
          />
          <p class="setting-hint">Takes effect on next connect.</p>
        </Card>
      </div>
      <div class="grid-item">
        <Card title="Server State">
          <dl class="state-strategy-list">
            <div>
              <dt>Mode</dt>
              <dd>{$state.stateStrategy?.mode ?? 'unknown'}</dd>
            </div>
            <div>
              <dt>Registry</dt>
              <dd>{$state.stateStrategy?.registryOwner ?? 'unknown'}</dd>
            </div>
            <div>
              <dt>Selection</dt>
              <dd>{$state.stateStrategy?.selectionOwner ?? 'unknown'}</dd>
            </div>
          </dl>
        </Card>
      </div>
      <div class="grid-item">
        <GeoControl {serverUrl} />
      </div>
      <div class="grid-item">
        <ArduinoUnoPanel />
      </div>
    </div>
  </div>

  <div class:hide={activePage !== 'operator'}>
    <OperatorConsole />
  </div>

  <div class="assets-pane" class:hide={activePage !== 'assets'}>
    <AssetsManager {serverUrl} />
  </div>

  <div class:hide={activePage !== 'registry-midi'}>
    <div class="midi-pane">
      <RegistryMidiPanel />
    </div>
  </div>

  <div class:hide={activePage !== 'plugins'}>
    <div class="plugins-pane">
      <PluginsPanel />
    </div>
  </div>

  <div class:hide={activePage !== 'node-manager'}>
    <div class="node-manager-pane">
      <NodeManagerPanel />
    </div>
  </div>

  <div class="nodes-page" class:hide={activePage !== 'nodes'}>
    <div class="nodes-pane">
      <NodeCanvasRenderer />
    </div>
  </div>
</AppShell>

<style>
  .dashboard-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: var(--space-lg);
    padding-bottom: var(--space-xl);
  }

  .page-tabs {
    --tabs-pad: 6px;
    position: relative;
    display: inline-flex;
    gap: var(--space-sm);
    padding: var(--tabs-pad);
    border-radius: 999px;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid var(--border-color);
    overflow: hidden;
  }

  .page-tabs-slider {
    position: absolute;
    top: var(--tabs-pad);
    bottom: var(--tabs-pad);
    left: 0;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
    box-shadow: 0 10px 30px rgba(99, 102, 241, 0.35);
    pointer-events: none;
    will-change: transform, width;
  }

  .page-tabs button {
    position: relative;
    z-index: 1;
    border: none;
    padding: 8px 14px;
    border-radius: 999px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-weight: 600;
  }

  .page-tabs button.active {
    color: white;
  }

  .midi-pane,
  .plugins-pane,
  .node-manager-pane {
    margin-top: var(--space-sm);
  }

  .nodes-page {
    width: 100%;
  }

  .nodes-page,
  .assets-pane,
  .node-manager-pane,
  .nodes-pane {
    flex: 1;
    min-height: 0;
    width: 100%;
    display: flex;
  }

  .hide {
    display: none;
  }

  .setting-hint {
    margin: var(--space-sm) 0 0 0;
    font-size: var(--text-xs);
    color: var(--text-muted);
    line-height: 1.35;
  }

  .state-strategy-list {
    display: grid;
    gap: var(--space-sm);
    margin: 0;
  }

  .state-strategy-list div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-md);
    padding: var(--space-xs) 0;
    border-bottom: 1px solid var(--border-color);
  }

  .state-strategy-list div:last-child {
    border-bottom: 0;
  }

  .state-strategy-list dt {
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  .state-strategy-list dd {
    margin: 0;
    color: var(--text-primary);
    font-size: var(--text-sm);
    font-weight: 700;
    text-align: right;
  }
</style>
