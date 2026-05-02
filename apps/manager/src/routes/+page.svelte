<script lang="ts">
  import '@shugu/ui-kit/styles';
  import { onMount, tick } from 'svelte';
  import { spring } from 'svelte/motion';
  import { connect, disconnect, connectionStatus, state } from '$lib/stores/manager';
  import { auth } from '$lib/stores/auth';
  import { nodeEngine } from '$lib/nodes';
  import {
    loadLocalProject,
    saveLocalProject,
    startAutoSave,
    stopAutoSave,
  } from '$lib/project/projectManager';

  // Layouts & Components
  import AppShell from '$lib/layouts/AppShell.svelte';
  import ClientSelector from '$lib/components/ClientSelector.svelte';
  import DisplayPanel from '$lib/components/DisplayPanel.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Toggle from '$lib/components/ui/Toggle.svelte';
  import ManagerLoginPanel from '$lib/components/ManagerLoginPanel.svelte';

  import GeoControl from '$lib/features/location/GeoControl.svelte';
  import RegistryMidiPanel from '$lib/components/RegistryMidiPanel.svelte';
  import NodeCanvasRenderer from '$lib/components/nodes/NodeCanvasRenderer.svelte';
  import AssetsManager from '$lib/components/AssetsManager.svelte';

  let serverUrl = 'https://localhost:3001';
  let assetWriteToken = '';
  let managerKey = '';
  let isConnecting = false;

  type WorkspaceTab = 'dashboard' | 'assets' | 'registry-midi' | 'nodes';
  let activePage: WorkspaceTab = 'dashboard';
  const nodeGraphRunning = nodeEngine.isRunning;

  let tabsEl: HTMLDivElement | null = null;
  let tabDashboardEl: HTMLButtonElement | null = null;
  let tabAssetsEl: HTMLButtonElement | null = null;
  let tabRegistryMidiEl: HTMLButtonElement | null = null;
  let tabNodesEl: HTMLButtonElement | null = null;
  const tabSlider = spring(
    { x: 0, width: 0 },
    {
      stiffness: 0.18,
      damping: 0.72,
    }
  );

  let projectRestored = false;
  let autoSaveStarted = false;

  const wheelListenerOptions: AddEventListenerOptions = { passive: false };

  function canScrollHorizontally(element: Element | null, deltaX: number): boolean {
    let current: Element | null = element;

    while (current && current !== document.documentElement) {
      if (current instanceof HTMLElement) {
        const style = window.getComputedStyle(current);
        const overflowX = style.overflowX;
        const isScrollable =
          overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay';

        if (isScrollable && current.scrollWidth > current.clientWidth) {
          const maxScrollLeft = current.scrollWidth - current.clientWidth;
          if (deltaX < 0 && current.scrollLeft > 0) return true;
          if (deltaX > 0 && current.scrollLeft < maxScrollLeft) return true;
        }
      }

      current = current.parentElement;
    }

    return false;
  }

  function handleWheelNavigationGuard(event: WheelEvent): void {
    if (!event.cancelable) return;

    // Trackpad pinch-to-zoom on Chrome comes through as wheel+ctrlKey; don't interfere.
    if (event.ctrlKey) return;

    const deltaX = event.deltaX ?? 0;
    const deltaY = event.deltaY ?? 0;

    // Only guard against primarily-horizontal gestures (these tend to trigger back/forward).
    if (Math.abs(deltaX) <= Math.abs(deltaY) || deltaX === 0) return;

    const target = event.target instanceof Element ? event.target : null;
    if (canScrollHorizontally(target, deltaX)) return;

    event.preventDefault();
  }

  // Settings (persisted)
  const PERFORMANCE_MODE_STORAGE_KEY = 'shugu-manager-performance-mode';
  const MANAGER_KEY_STORAGE_KEY = 'shugu-manager-key';
  const allowInsecureHttpManagerControl = import.meta.env.DEV;

  let performanceMode = false;

  function getActiveTabEl(): HTMLButtonElement | null {
    if (activePage === 'dashboard') return tabDashboardEl;
    if (activePage === 'assets') return tabAssetsEl;
    if (activePage === 'registry-midi') return tabRegistryMidiEl;
    if (activePage === 'nodes') return tabNodesEl;
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

  onMount(() => {
    // Detect if accessing via IP address
    const isAccessingViaIP =
      window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

    // Try to get server URL from localStorage
    const savedUrl = localStorage.getItem('shugu-server-url');

    // If accessing via IP but saved URL is localhost, ignore the saved URL
    const savedIsLocalhost =
      savedUrl && (savedUrl.includes('localhost') || savedUrl.includes('127.0.0.1'));
    const savedIsHttp = savedUrl && savedUrl.startsWith('http:');

    if (
      savedUrl &&
      (allowInsecureHttpManagerControl || !savedIsHttp) &&
      !(isAccessingViaIP && savedIsLocalhost)
    ) {
      serverUrl = savedUrl;
    } else {
      // Default to current hostname (localhost or IP) with HTTPS
      // If running on standard HTTPS port (443), assume we are proxied and use the origin
      if (window.location.protocol === 'https:' && window.location.port === '') {
        serverUrl = window.location.origin;
      } else {
        serverUrl = `https://${window.location.hostname}:3001`;
      }
    }

    const savedAssetWrite = localStorage.getItem('shugu-asset-write-token');
    assetWriteToken = savedAssetWrite ? savedAssetWrite : '';
    const savedManagerKey = localStorage.getItem(MANAGER_KEY_STORAGE_KEY);
    managerKey = savedManagerKey ? savedManagerKey : '';

    try {
      performanceMode = localStorage.getItem(PERFORMANCE_MODE_STORAGE_KEY) === '1';
    } catch {
      // ignore
    }

    return () => {
      disconnect();
      stopAutoSave();
    };
  });

  $: if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(PERFORMANCE_MODE_STORAGE_KEY, performanceMode ? '1' : '0');
    } catch {
      // ignore
    }
  }

  onMount(() => {
    window.addEventListener('wheel', handleWheelNavigationGuard, wheelListenerOptions);
    return () =>
      window.removeEventListener('wheel', handleWheelNavigationGuard, wheelListenerOptions);
  });

  onMount(() => {
    const onResize = () => {
      void updateTabSlider();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  $: if (tabsEl && activePage) void updateTabSlider();

  // Restore project once we're connected (parameters are registered after connect)
  $: if (!projectRestored && $connectionStatus === 'connected') {
    if (loadLocalProject()) {
      console.info('[Project] restored from local storage');
    }
    projectRestored = true;
  }

  // Start autosave once connected
  $: if ($connectionStatus === 'connected' && !autoSaveStarted) {
    startAutoSave();
    autoSaveStarted = true;
  }

  onMount(() => {
    const handler = () => saveLocalProject('beforeunload');
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  });

  function handleConnect() {
    if (!$auth.user) return;
    if (!allowInsecureHttpManagerControl && serverUrl.trim().toLowerCase().startsWith('http:')) {
      return;
    }
    localStorage.setItem('shugu-server-url', serverUrl);
    localStorage.setItem('shugu-asset-write-token', assetWriteToken);
    localStorage.setItem(MANAGER_KEY_STORAGE_KEY, managerKey);
    isConnecting = true;
    connect({
      serverUrl,
      managerKey,
      transports: performanceMode ? ['websocket'] : ['polling', 'websocket'],
    });
    isConnecting = false;
  }

  function handleDisconnect() {
    disconnect();
  }

  function handleLogout() {
    handleDisconnect();
    auth.logout();
  }
</script>

<svelte:head>
  <title>Fluffy Manager</title>
</svelte:head>

<div class="app">
  {#if $auth.isRestoring}
    <div class="connect-screen">
      <div class="connect-card card card-glass">
        <h1 class="title">Fluffy Manager</h1>
        <p class="subtitle">Restoring session...</p>
      </div>
    </div>
  {:else if !$auth.user}
    <ManagerLoginPanel />
  {:else if $connectionStatus === 'disconnected' || $connectionStatus === 'error'}
    <div class="connect-screen">
      <div class="connect-card card card-glass">
        <h1 class="title">Fluffy Manager</h1>

        <div class="connect-form">
          <label class="form-label" for="server-url">Server URL</label>
          <input
            id="server-url"
            type="text"
            class="input"
            bind:value={serverUrl}
            placeholder="https://localhost:3001"
          />

          <label class="form-label" for="asset-write-token">Asset Write Token</label>
          <input
            id="asset-write-token"
            type="password"
            class="input"
            bind:value={assetWriteToken}
            placeholder="ASSET_WRITE_TOKEN"
            autocomplete="off"
          />

          <label class="form-label" for="manager-key">Manager Key</label>
          <input
            id="manager-key"
            type="password"
            class="input"
            bind:value={managerKey}
            placeholder="SHUGU_MANAGER_KEY"
            autocomplete="off"
          />

          <p class="status-note">Logged in as: <strong>{$auth.user}</strong></p>

          {#if $connectionStatus === 'error'}
            <p class="error-message">Failed to connect. Please check the server URL.</p>
          {/if}

          {#if !allowInsecureHttpManagerControl && serverUrl
              .trim()
              .toLowerCase()
              .startsWith('http:')}
            <p class="error-message">Manager control requires HTTPS in production.</p>
          {/if}

          <Button
            variant="primary"
            size="lg"
            fullWidth
            on:click={handleConnect}
            disabled={isConnecting ||
              (!allowInsecureHttpManagerControl &&
                serverUrl.trim().toLowerCase().startsWith('http:'))}
          >
            {isConnecting ? 'Connecting...' : 'Connect'}
          </Button>

          <Button variant="secondary" size="lg" fullWidth on:click={handleLogout}>Logout</Button>
        </div>
      </div>
    </div>
  {:else}
    <AppShell
      fullBleed={activePage === 'nodes' || activePage === 'assets'}
      collapseHeader={activePage === 'nodes' && $nodeGraphRunning}
    >
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
          🧰 Console
        </button>
        <button
          bind:this={tabAssetsEl}
          class:active={activePage === 'assets'}
          on:click={() => (activePage = 'assets')}
        >
          🗂️ Assets Manager
        </button>
        <button
          bind:this={tabRegistryMidiEl}
          class:active={activePage === 'registry-midi'}
          on:click={() => (activePage = 'registry-midi')}
        >
          🎹 Registry MIDI
        </button>
        <button
          bind:this={tabNodesEl}
          class:active={activePage === 'nodes'}
          on:click={() => (activePage = 'nodes')}
        >
          📊 Node Graph
        </button>
      </div>

      <div class:hide={activePage !== 'dashboard'}>
        <div class="dashboard-grid">
          <div class="grid-item">
            <!-- Client selection card (same behavior as sidebar client-list-container) -->
            <Card>
              <ClientSelector height={280} />
            </Card>
          </div>
          <div class="grid-item">
            <DisplayPanel />
          </div>
          <div class="grid-item">
            <Card title="🎭 Performance Mode">
              <Toggle
                label="WebSocket-only"
                description="Lower jitter when stable; may fail on restrictive networks."
                bind:checked={performanceMode}
              />
              <p class="setting-hint">
                Takes effect on next connect (recommended to disconnect/reconnect).
              </p>
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
        </div>
      </div>

      <div class="assets-pane" class:hide={activePage !== 'assets'}>
        <AssetsManager {serverUrl} />
      </div>

      <div class:hide={activePage !== 'registry-midi'}>
        <div class="midi-pane">
          <RegistryMidiPanel />
        </div>
      </div>

      <div class="nodes-page" class:hide={activePage !== 'nodes'}>
        <div class="nodes-pane">
          <NodeCanvasRenderer />
        </div>
      </div>
    </AppShell>
  {/if}
</div>

<style>
  .app {
    min-height: 100vh;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  /* Connect Screen Styles */
  .connect-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: var(--space-lg);
    background: linear-gradient(135deg, var(--bg-primary) 0%, #0f0f1a 100%);
  }

  .connect-card {
    max-width: 400px;
    width: 100%;
    text-align: center;
    padding: var(--space-xl);
  }

  .title {
    font-size: var(--text-3xl);
    font-weight: 700;
    margin-bottom: var(--space-md);
    background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .subtitle {
    color: var(--text-muted);
  }

  .connect-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    text-align: left;
    margin-top: var(--space-lg);
  }

  .form-label {
    font-size: var(--text-sm);
    color: var(--text-secondary);
  }

  .input {
    width: 100%;
    padding: var(--space-sm) var(--space-md);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: 1rem;
  }

  .input:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  .error-message {
    color: var(--color-error);
    font-size: var(--text-sm);
    text-align: center;
  }

  .status-note {
    text-align: center;
    color: var(--text-secondary);
    font-size: var(--text-sm);
  }

  /* Dashboard Grid */
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

  .midi-pane {
    margin-top: var(--space-sm);
  }

  .nodes-page {
    flex: 1;
    min-height: 0;
    display: flex;
  }

  .assets-pane {
    flex: 1;
    min-height: 0;
    display: flex;
  }

  .nodes-pane {
    flex: 1;
    min-height: 0;
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
