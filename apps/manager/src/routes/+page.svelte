<!--
Purpose: Classic Manager control and authoring route.
-->
<script lang="ts">
  import '@shugu/ui-kit/styles';
  import { onMount } from 'svelte';
  import { resolveLocalServerUrl } from '@shugu/protocol';
  import { connect, disconnect, connectionStatus } from '$lib/stores/domain/connection';
  import { auth } from '$lib/stores/auth';

  import Button from '$lib/components/ui/Button.svelte';
  import ManagerLoginPanel from '$lib/components/ManagerLoginPanel.svelte';
  import ManagerWorkspace from '$lib/components/ManagerWorkspace.svelte';

  let serverUrl = 'https://localhost:3001';
  let managerKey = '';
  let isConnecting = false;

  const PERFORMANCE_MODE_STORAGE_KEY = 'shugu-manager-performance-mode';
  const MANAGER_KEY_STORAGE_KEY = 'shugu-manager-key';
  const allowInsecureHttpManagerControl = import.meta.env.DEV;

  let performanceMode = false;
  let performanceModeRestored = false;

  onMount(() => {
    serverUrl = resolveLocalServerUrl({
      currentProtocol: window.location.protocol,
      hostname: window.location.hostname,
      port: window.location.port,
      origin: window.location.origin,
      savedUrl: localStorage.getItem('shugu-server-url'),
      allowInsecureHttp: allowInsecureHttpManagerControl,
    });

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
    <ManagerWorkspace bind:performanceMode {serverUrl} />
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

</style>
