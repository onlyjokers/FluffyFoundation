<script lang="ts">
  import '@shugu/ui-kit/styles';

  import AppShell from '$lib/layouts/AppShell.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import ClientSelector from '$lib/components/ClientSelector.svelte';
  import DisplayPanel from '$lib/components/DisplayPanel.svelte';
  import PerformanceConsole from '$lib/components/PerformanceConsole.svelte';
</script>

<svelte:head>
  <title>Fluffy Manager</title>
</svelte:head>

<AppShell>
  <div class="dashboard-grid">
    <div class="grid-item">
      <Card>
        <ClientSelector height={280} />
      </Card>
    </div>
    <div class="grid-item">
      <DisplayPanel />
    </div>
    <div class="grid-item">
      <PerformanceConsole />
    </div>
  </div>
</AppShell>

<style>
  .dashboard-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: var(--space-lg);
    padding-bottom: var(--space-xl);
  }
</style>
