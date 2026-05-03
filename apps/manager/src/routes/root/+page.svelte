<!--
Purpose: Root route coordinator for authoring session lifecycle and workspace separation.
-->
<script lang="ts">
  import '@shugu/ui-kit/styles';
  import { onMount } from 'svelte';
  import { connect, disconnect, connectionStatus } from '$lib/stores/manager';
  import { auth } from '$lib/stores/auth';
  import {
    loadLocalProject,
    saveLocalProject,
    startAutoSave,
    stopAutoSave,
  } from '$lib/stores/root-authoring';
  import ManagerLoginPanel from '$lib/components/ManagerLoginPanel.svelte';
  import RootConnectPanel from './RootConnectPanel.svelte';
  import RootWorkspace from './RootWorkspace.svelte';

  let serverUrl = 'https://localhost:3001';
  let assetWriteToken = '';
  let managerKey = '';
  let isConnecting = false;

  const PERFORMANCE_MODE_STORAGE_KEY = 'shugu-manager-performance-mode';
  const MANAGER_KEY_STORAGE_KEY = 'shugu-manager-key';
  const allowInsecureHttpManagerControl = import.meta.env.DEV;

  let performanceMode = false;
  let performanceModeRestored = false;
  let projectRestored = false;
  let autoSaveStarted = false;

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

    assetWriteToken = localStorage.getItem('shugu-asset-write-token') ?? '';
    managerKey = localStorage.getItem(MANAGER_KEY_STORAGE_KEY) ?? '';

    try {
      performanceMode = localStorage.getItem(PERFORMANCE_MODE_STORAGE_KEY) === '1';
    } catch {
      // ignore
    }
    performanceModeRestored = true;

    return () => {
      disconnect();
      stopAutoSave();
    };
  });

  $: if (typeof window !== 'undefined' && performanceModeRestored) {
    try {
      localStorage.setItem(PERFORMANCE_MODE_STORAGE_KEY, performanceMode ? '1' : '0');
    } catch {
      // ignore
    }
  }

  $: if (!projectRestored && $connectionStatus === 'connected') {
    if (loadLocalProject()) {
      console.info('[Project] restored from local storage');
    }
    projectRestored = true;
  }

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

  function handleLogout() {
    disconnect();
    auth.logout();
  }
</script>

<svelte:head>
  <title>Fluffy Root</title>
</svelte:head>

<div class="app">
  {#if $auth.isRestoring}
    <div class="connect-screen">
      <div class="connect-card card card-glass">
        <h1 class="title">Fluffy Root</h1>
        <p class="subtitle">Restoring session...</p>
      </div>
    </div>
  {:else if !$auth.user}
    <ManagerLoginPanel />
  {:else if $connectionStatus === 'disconnected' || $connectionStatus === 'error'}
    <RootConnectPanel
      bind:serverUrl
      bind:assetWriteToken
      bind:managerKey
      {isConnecting}
      hasConnectionError={$connectionStatus === 'error'}
      {allowInsecureHttpManagerControl}
      loggedInUser={$auth.user}
      on:connect={handleConnect}
      on:logout={handleLogout}
    />
  {:else}
    <RootWorkspace bind:performanceMode {serverUrl} />
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
</style>
