<script lang="ts">
  import '@shugu/ui-kit/styles';

  import { onMount } from 'svelte';
  import { auth, type AuthUser } from '$lib/stores/auth';
  import { connect, disconnect, connectionStatus } from '$lib/stores/manager';

  const MANAGER_KEY_STORAGE_KEY = 'shugu-manager-key';
  const PERFORMANCE_MODE_STORAGE_KEY = 'shugu-manager-performance-mode';

  let serverUrl = 'https://localhost:3001';
  let assetWriteToken = '';
  let managerKey = '';
  let performanceMode = false;

  let username: AuthUser | '' = '';
  let password = '';
  let rememberLogin = false;

  onMount(() => {
    const savedUrl = localStorage.getItem('shugu-server-url');

    const isAccessingViaIP =
      window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

    const savedIsLocalhost =
      savedUrl && (savedUrl.includes('localhost') || savedUrl.includes('127.0.0.1'));

    const savedIsHttp = savedUrl && savedUrl.startsWith('http:');

    if (savedUrl && !savedIsHttp && !(isAccessingViaIP && savedIsLocalhost)) {
      serverUrl = savedUrl;
    } else {
      if (window.location.protocol === 'https:' && window.location.port === '') {
        serverUrl = window.location.origin;
      } else {
        serverUrl = `https://${window.location.hostname}:3001`;
      }
    }

    assetWriteToken = localStorage.getItem('shugu-asset-write-token') ?? '';
    managerKey = localStorage.getItem(MANAGER_KEY_STORAGE_KEY) ?? '';

    try {
      performanceMode = localStorage.getItem(PERFORMANCE_MODE_STORAGE_KEY) === '1';
    } catch {
      performanceMode = false;
    }

    return () => {
      disconnect();
    };
  });

  function handleLogin(event: Event) {
    event.preventDefault();
    auth.clearError();
    const result = auth.login(username, password, rememberLogin);

    password = '';
    if (!result.ok) return;
  }

  function handleLogout() {
    disconnect();
    auth.logout();
    rememberLogin = false;
    password = '';
  }

  function handleConnect() {
    if (!$auth.user) return;

    localStorage.setItem('shugu-server-url', serverUrl);
    localStorage.setItem('shugu-asset-write-token', assetWriteToken);
    localStorage.setItem(MANAGER_KEY_STORAGE_KEY, managerKey);
    localStorage.setItem(PERFORMANCE_MODE_STORAGE_KEY, performanceMode ? '1' : '0');

    connect({
      serverUrl,
      managerKey,
      transports: performanceMode ? ['websocket'] : ['polling', 'websocket'],
    });
  }
</script>

{#if $auth.isRestoring}
  <div class="connect-screen">
    <div class="connect-card card card-glass">
      <h1 class="title">Fluffy</h1>
      <p class="subtitle">Restoring session...</p>
    </div>
  </div>
{:else if !$auth.user}
  <div class="connect-screen">
    <div class="connect-card card card-glass">
      <h1 class="title">Fluffy</h1>

      <form class="connect-form" on:submit|preventDefault={handleLogin} autocomplete="on">
        <label class="form-label" for="username">Username</label>
        <input
          id="username"
          list="user-options"
          type="text"
          class="input"
          bind:value={username}
          placeholder="Eureka / Starno / VKong"
          autocomplete="username"
          on:input={() => auth.clearError()}
        />
        <datalist id="user-options">
          {#each ['Eureka', 'Starno', 'VKong'] as name}
            <option value={name} />
          {/each}
        </datalist>

        <label class="form-label" for="password">Password</label>
        <input
          id="password"
          type="password"
          class="input"
          bind:value={password}
          placeholder="******"
          autocomplete="current-password"
          on:input={() => auth.clearError()}
        />

        <label class="remember-row">
          <input type="checkbox" bind:checked={rememberLogin} />
          <span>Remember me</span>
        </label>

        {#if $auth.error}
          <p class="error-message">{$auth.error}</p>
        {/if}

        <button class="btn btn-primary btn-lg w-full" type="submit">Login</button>
      </form>
    </div>
  </div>
{:else if $connectionStatus === 'disconnected' || $connectionStatus === 'error'}
  <div class="connect-screen">
    <div class="connect-card card card-glass">
      <h1 class="title">Fluffy</h1>

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

        <label class="remember-row">
          <input type="checkbox" bind:checked={performanceMode} />
          <span>WebSocket-only</span>
        </label>

        <p class="status-note">Logged in as: <strong>{$auth.user}</strong></p>

        {#if $connectionStatus === 'error'}
          <p class="error-message">Failed to connect. Please check the server URL.</p>
        {/if}

        <button class="btn btn-primary btn-lg w-full" type="button" on:click={handleConnect}>
          Connect
        </button>

        <button class="btn btn-secondary btn-lg w-full" type="button" on:click={handleLogout}>
          Logout
        </button>
      </div>
    </div>
  </div>
{:else}
  <slot />
{/if}

<style>
  .connect-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: var(--space-lg);
    background: linear-gradient(135deg, var(--bg-primary) 0%, #0f0f1a 100%);
  }

  .connect-card {
    max-width: 420px;
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

  .remember-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--text-sm);
    color: var(--text-secondary);
    cursor: pointer;
  }
</style>
