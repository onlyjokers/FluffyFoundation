<!-- Purpose: Render ClientUI nodes deployed into the Client runtime. -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getSDK } from '$lib/stores/client';
  import { createAgentTextPayload } from '$lib/client-page/agent-text';
  import {
    clientUiRuntime,
    type ClientUiInteractionEvent,
    type ClientUiNodeState,
  } from '$lib/stores/client/client-ui-runtime';

  type RenderClientUiNodeState = ClientUiNodeState & { nodeId: string };

  let inputDrafts: Record<string, string> = {};

  function pressButton(nodeId: string): void {
    clientUiRuntime.pressButton(nodeId);
  }

  function submitInput(nodeId: string): void {
    const text = String(inputDrafts[nodeId] ?? '');
    const payload = createAgentTextPayload(text);
    if (!payload) return;
    clientUiRuntime.submitInput(nodeId, text.trim());
    getSDK()?.sendSensorData('custom', payload, { trackLatest: false });
    inputDrafts = { ...inputDrafts, [nodeId]: '' };
  }

  const visibleNodes = (nodes: Map<string, ClientUiNodeState>): RenderClientUiNodeState[] =>
    Array.from(nodes.entries())
      .map(([nodeId, node]) => ({ ...node, nodeId }))
      .filter((node) => node.displayed)
      .sort((a, b) => String(a.nodeId).localeCompare(String(b.nodeId)));

  const sendInteraction = (event: ClientUiInteractionEvent): void => {
    getSDK()?.sendSensorData(
      'custom',
      {
        kind: 'client-ui-interaction',
        nodeId: event.nodeId,
        uiKind: event.kind,
        pressed: event.pressed,
        inputContent: event.inputContent,
        firstInputed: event.firstInputed,
      },
      { trackLatest: false }
    );
  };

  const unsubscribeInteraction = clientUiRuntime.onInteraction(sendInteraction);
  onDestroy(unsubscribeInteraction);
</script>

{#if visibleNodes($clientUiRuntime).length > 0}
  <div class="client-ui-layer" aria-label="Client controls">
    {#each visibleNodes($clientUiRuntime) as node (node.nodeId)}
      {#if node.kind === 'button'}
        <button class="client-ui-button" type="button" on:click={() => pressButton(node.nodeId)}>
          Press
        </button>
      {:else if node.kind === 'input'}
        <form class="client-ui-input-form" on:submit|preventDefault={() => submitInput(node.nodeId)}>
          <input
            class="client-ui-input"
            bind:value={inputDrafts[node.nodeId]}
            autocomplete="off"
            inputmode="text"
            aria-label="Client input"
          />
          <button
            class="client-ui-submit"
            type="submit"
            disabled={!String(inputDrafts[node.nodeId] ?? '').trim()}
          >
            发送
          </button>
        </form>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .client-ui-layer {
    position: fixed;
    left: 50%;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
    z-index: 32;
    display: grid;
    gap: 10px;
    width: min(520px, calc(100vw - 32px));
    transform: translateX(-50%);
    pointer-events: auto;
  }

  .client-ui-button,
  .client-ui-input,
  .client-ui-submit {
    min-height: 44px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 8px;
    background: rgba(10, 10, 15, 0.76);
    color: #f7f5ef;
    font: inherit;
    font-size: 16px;
    backdrop-filter: blur(12px);
  }

  .client-ui-button {
    width: 100%;
  }

  .client-ui-input-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
  }

  .client-ui-input {
    min-width: 0;
    padding: 0 14px;
  }

  .client-ui-submit {
    padding: 0 16px;
  }

  .client-ui-submit:disabled {
    cursor: default;
    opacity: 0.45;
  }
</style>
