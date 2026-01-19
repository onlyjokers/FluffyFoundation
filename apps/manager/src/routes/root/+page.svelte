<script lang="ts">
  import '@shugu/ui-kit/styles';

  import AppShell from '$lib/layouts/AppShell.svelte';
  import NodeCanvasRenderer from '$lib/components/nodes/NodeCanvasRenderer.svelte';
</script>

<svelte:head>
  <title>Fluffy Root</title>
</svelte:head>

<AppShell fullBleed collapseHeader={false}>
  <NodeCanvasRenderer />
</AppShell>
