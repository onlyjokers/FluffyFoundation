<script lang="ts">
  import { disconnect } from '$lib/stores/manager';
  import { auth } from '$lib/stores/auth';
  import { onMount } from 'svelte';

  let isMenuOpen = false;
  let menuWrap: HTMLDivElement | null = null;

  function closeMenu() {
    isMenuOpen = false;
  }

  function toggleMenu() {
    isMenuOpen = !isMenuOpen;
  }

  function handleDisconnect() {
    closeMenu();
    disconnect();
  }

  function handleLogout() {
    closeMenu();
    disconnect();
    auth.logout();
  }

  onMount(() => {
    const onWindowPointerDown = (event: PointerEvent) => {
      if (!isMenuOpen) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (menuWrap?.contains(target)) return;
      closeMenu();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (!isMenuOpen) return;
      event.preventDefault();
      closeMenu();
    };

    window.addEventListener('pointerdown', onWindowPointerDown, { capture: true });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onWindowPointerDown, { capture: true });
      window.removeEventListener('keydown', onKeyDown);
    };
  });
</script>

<div class="menu-wrap" bind:this={menuWrap}>
  <button
    type="button"
    class="menu-button"
    aria-label="Connection menu"
    title="Menu"
    on:click={toggleMenu}
  >
    ⋯
  </button>
  {#if isMenuOpen}
    <div class="menu" role="menu" on:pointerdown|stopPropagation>
      <button type="button" class="menu-item" on:click={handleDisconnect}>Disconnect</button>
      <button type="button" class="menu-item" on:click={handleLogout}>Logout</button>
    </div>
  {/if}
</div>

<style>
  .menu-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .menu-button {
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(15, 23, 42, 0.5);
    color: rgba(226, 232, 240, 0.92);
    cursor: pointer;
    font-weight: 800;
    line-height: 1;
    box-shadow: 0 16px 44px rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(14px);
  }

  .menu-button:hover {
    background: rgba(99, 102, 241, 0.16);
    border-color: rgba(99, 102, 241, 0.55);
  }

  .menu {
    position: absolute;
    top: calc(100% + 10px);
    right: 0;
    z-index: 90;
    min-width: 160px;
    padding: 8px;
    border-radius: 14px;
    background: rgba(15, 23, 42, 0.94);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 18px 56px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(14px);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .menu-item {
    width: 100%;
    border: none;
    border-radius: 12px;
    padding: 8px 10px;
    background: transparent;
    color: rgba(226, 232, 240, 0.92);
    font-size: 13px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }

  .menu-item:hover {
    background: rgba(99, 102, 241, 0.18);
    color: rgba(255, 255, 255, 0.96);
  }
</style>
