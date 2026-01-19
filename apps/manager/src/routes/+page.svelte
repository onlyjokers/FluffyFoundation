<script lang="ts">
  import '@shugu/ui-kit/styles';

  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  onMount(() => {
    void goto('/manager');
  });
</script>

<svelte:head>
  <title>Fluffy</title>
</svelte:head>

<p style="padding: 24px; color: rgba(226, 232, 240, 0.85)">
  Redirecting… <a href="/manager">Open Manager</a>
</p>
