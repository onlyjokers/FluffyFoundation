<!--
Purpose: Lightweight Manager performance console for published Group controls.
-->
<script lang="ts">
  import '@shugu/ui-kit/styles';
  import { onMount } from 'svelte';
  import { connect, disconnect, connectionStatus, state } from '$lib/stores/domain/connection';
  import { auth } from '$lib/stores/auth';

  import AppShell from '$lib/layouts/AppShell.svelte';
  import ClientSelector from '$lib/components/ClientSelector.svelte';
  import DisplayPanel from '$lib/components/DisplayPanel.svelte';
  import PublishedGroupControls from '$lib/components/PublishedGroupControls.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import Toggle from '$lib/components/ui/Toggle.svelte';
  import ManagerLoginPanel from '$lib/components/ManagerLoginPanel.svelte';
  import GeoControl from '$lib/features/location/GeoControl.svelte';

  let serverUrl = 'https://localhost:3001';
  let managerKey = '';
  let isConnecting = false;

  const PERFORMANCE_MODE_STORAGE_KEY = 'shugu-manager-performance-mode';
  const MANAGER_KEY_STORAGE_KEY = 'shugu-manager-key';
  const allowInsecureHttpManagerControl = import.meta.env.DEV;

  let performanceMode = false;
  let performanceModeRestored = false;

  onMount(() => {
    const isAccessingViaIP =
      window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    const savedUrl = localStorage.getItem('shugu-server-url');
    const savedIsLocalhost =
      savedUrl && (savedUrl.includes('localhost') || savedUrl.includes('127.0.0.1'));
    const savedIsHttp = savedUrl && savedUrl.startsWith('http:');

    if (
      savedUrl &&
      (allowInsecureHttpManagerControl || !savedIsHttp) &&
      !(isAccessingViaIP && savedIsLocalhost)
    ) {
      serverUrl = savedUrl;
    } else if (window.location.protocol === 'https:' && window.location.port === '') {
      serverUrl = window.location.origin;
    } else {
      serverUrl = `https://${window.location.hostname}:3001`;
    }

    managerKey = localStorage.getItem(MANAGER_KEY_STORAGE_KEY) ?? '';

    try {
      performanceMode = localStorage.getItem(PERFORMANCE_MODE_STORAGE_KEY) === '1';
    } catch {
      // ignore
    }
    performanceModeRestored = true;

    return () => disconnect();
  });

  $: if (typeof window !== 'undefined' && performanceModeRestored) {
    try {
      localStorage.setItem(PERFORMANCE_MODE_STORAGE_KEY, performanceMode ? '1' : '0');
    } catch {
      // ignore
    }
  }

  function handleConnect() {
    if (!$auth.user) return;
    if (!allowInsecureHttpManagerControl && serverUrl.trim().toLowerCase().startsWith('http:')) {
      return;
    }
    localStorage.setItem('shugu-server-url', serverUrl);
    localStorage.setItem(MANAGER_KEY_STORAGE_KEY, managerKey);
    isConnecting = true;
    connect({
      serverUrl,
      managerKey,
      transports: performanceMode ? ['websocket'] : ['polling', 'websocket'],
      commandEnvelope: {
        actor: $auth.user,
        role: 'manager',
        scopeGroupId: 'manager-performance',
      },
    });
    isConnecting = false;
  }

  function handleLogout() {
    disconnect();
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
    <AppShell>
      <div slot="tabs" class="page-tabs">
        <a class="active" href="/manager/">Manager</a>
        <a href="/manager/root">Root</a>
      </div>

      <div class="dashboard-grid">
        <div class="grid-item wide">
          <PublishedGroupControls />
        </div>
        <div class="grid-item">
          <Card>
            <ClientSelector height={280} />
          </Card>
        </div>
        <div class="grid-item">
          <DisplayPanel />
        </div>
        <div class="grid-item">
          <Card title="Performance Mode">
            <Toggle
              label="WebSocket-only"
              description="Lower jitter when stable; may fail on restrictive networks."
              bind:checked={performanceMode}
            />
            <p class="setting-hint">
              Takes effect on next connect.
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
    </AppShell>
  {/if}
</div>

<style>
  .app {
    min-height: 100vh;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

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

  .dashboard-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: var(--space-lg);
    padding-bottom: var(--space-xl);
  }

  .grid-item.wide {
    grid-column: 1 / -1;
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

  .page-tabs a {
    position: relative;
    border: none;
    padding: 8px 14px;
    border-radius: 999px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-weight: 600;
    text-decoration: none;
  }

  .page-tabs a.active {
    color: white;
    background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
    box-shadow: 0 10px 30px rgba(99, 102, 241, 0.35);
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
