<!--
Purpose: Isolate manager login UI and dev-only password configuration from the main route.
-->
<script lang="ts">
  import { ALLOWED_USERNAMES, auth, type AuthUser } from '$lib/stores/auth';

  let username: AuthUser | '' = '';
  let password = '';
  let serverUrl = '';
  let isSubmitting = false;

  async function handleLogin(event: Event) {
    event.preventDefault();
    if (isSubmitting) return;
    auth.clearError();
    try {
      localStorage.setItem('shugu-server-url', serverUrl);
    } catch {
      // ignore
    }
    isSubmitting = true;
    const result = await auth.login(username, password, serverUrl);
    isSubmitting = false;

    if (result.ok) {
      password = '';
    } else {
      password = '';
    }
  }

  $: if (typeof window !== 'undefined' && !serverUrl) {
    serverUrl = localStorage.getItem('shugu-server-url') ?? 'http://localhost:3001';
  }
</script>

<div class="connect-screen">
  <div class="connect-card card card-glass">
    <h1 class="title">Fluffy Manager</h1>

    <form class="connect-form" on:submit|preventDefault={handleLogin} autocomplete="on">
      <label class="form-label" for="server-url">Server URL</label>
      <input
        id="server-url"
        type="text"
        class="input"
        bind:value={serverUrl}
        placeholder="http://localhost:3001"
      />

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
        {#each ALLOWED_USERNAMES as name}
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

      {#if $auth.error}
        <p class="error-message">{$auth.error}</p>
      {/if}

      <button
        class="btn btn-primary btn-lg w-full"
        type="submit"
        disabled={isSubmitting}
      >
        {isSubmitting ? 'Logging in...' : 'Login'}
      </button>
    </form>
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
    width: min(100%, 400px);
    padding: var(--space-xl);
    text-align: center;
  }

  .title {
    margin: 0 0 var(--space-md);
    font-size: var(--text-3xl);
    font-weight: 700;
    line-height: 1.1;
    background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .connect-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    margin-top: var(--space-lg);
    text-align: left;
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
    font-size: var(--text-base);
  }

  .input:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--border-glow);
  }

  .error-message {
    margin: 0;
    color: var(--color-error);
    font-size: var(--text-sm);
    text-align: center;
  }
</style>
