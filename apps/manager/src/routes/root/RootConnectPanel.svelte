<!--
Purpose: Root-only connection form for authoring permissions and recovery tokens.
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Button from '$lib/components/ui/Button.svelte';

  export let serverUrl = 'https://localhost:3001';
  export let assetWriteToken = '';
  export let managerKey = '';
  export let isConnecting = false;
  export let hasConnectionError = false;
  export let allowInsecureHttpManagerControl = false;
  export let loggedInUser = '';

  const dispatch = createEventDispatcher<{
    connect: void;
    logout: void;
  }>();

  $: isInsecureHttp =
    !allowInsecureHttpManagerControl && serverUrl.trim().toLowerCase().startsWith('http:');
</script>

<div class="connect-screen">
  <div class="connect-card card card-glass">
    <h1 class="title">Fluffy Root</h1>

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

      <p class="status-note">Logged in as: <strong>{loggedInUser}</strong></p>

      {#if hasConnectionError}
        <p class="error-message">Failed to connect. Please check the server URL.</p>
      {/if}

      {#if isInsecureHttp}
        <p class="error-message">Manager control requires HTTPS in production.</p>
      {/if}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        on:click={() => dispatch('connect')}
        disabled={isConnecting || isInsecureHttp}
      >
        {isConnecting ? 'Connecting...' : 'Connect'}
      </Button>

      <Button variant="secondary" size="lg" fullWidth on:click={() => dispatch('logout')}>
        Logout
      </Button>
    </div>
  </div>
</div>

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
