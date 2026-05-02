<!--
Purpose: Isolate manager login UI and dev-only password configuration from the main route.
-->
<script lang="ts">
  import {
    ALLOWED_USERNAMES,
    auth,
    isDevPasswordLoginEnabled,
    type AuthUser,
  } from '$lib/stores/auth';

  let username: AuthUser | '' = '';
  let password = '';
  let rememberLogin = false;

  function handleLogin(event: Event) {
    event.preventDefault();
    auth.clearError();
    const result = auth.login(username, password, rememberLogin);

    if (result.ok) {
      password = '';
    } else {
      password = '';
    }
  }
</script>

<div class="connect-screen">
  <div class="connect-card card card-glass">
    <h1 class="title">Fluffy Manager</h1>

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

      <label class="remember-row">
        <input type="checkbox" bind:checked={rememberLogin} />
        <span>Remember me</span>
      </label>

      {#if $auth.error}
        <p class="error-message">{$auth.error}</p>
      {/if}

      {#if !isDevPasswordLoginEnabled()}
        <p class="error-message">Password login is available only in explicit dev mode.</p>
      {/if}

      <button
        class="btn btn-primary btn-lg w-full"
        type="submit"
        disabled={!isDevPasswordLoginEnabled()}
      >
        Login
      </button>
    </form>
  </div>
</div>

<style>
  .remember-row {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--text-sm);
    color: var(--text-secondary);
    cursor: pointer;
  }
</style>
