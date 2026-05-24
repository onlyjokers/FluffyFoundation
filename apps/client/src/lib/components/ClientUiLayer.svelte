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
          <span class="button-light" aria-hidden="true"></span>
          <span class="button-label">Press</span>
        </button>
      {:else if node.kind === 'input'}
        <form class="client-ui-input-form" on:submit|preventDefault={() => submitInput(node.nodeId)}>
          <input
            class="client-ui-input"
            bind:value={inputDrafts[node.nodeId]}
            autocomplete="off"
            inputmode="text"
            aria-label="Client input"
            placeholder="Type a message"
          />
          <button
            class="client-ui-submit"
            type="submit"
            disabled={!String(inputDrafts[node.nodeId] ?? '').trim()}
          >
            Send
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
    bottom: calc(env(safe-area-inset-bottom, 0px) + 18px);
    z-index: 32;
    display: grid;
    gap: 12px;
    width: min(560px, calc(100vw - 28px));
    padding: 12px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 18px;
    background:
      linear-gradient(145deg, rgba(18, 22, 29, 0.9), rgba(6, 8, 12, 0.72)),
      radial-gradient(circle at 18% 0%, rgba(255, 255, 255, 0.18), transparent 36%);
    box-shadow:
      0 22px 60px rgba(0, 0, 0, 0.42),
      inset 0 1px 0 rgba(255, 255, 255, 0.18);
    transform: translateX(-50%);
    backdrop-filter: blur(18px) saturate(1.25);
    pointer-events: auto;
  }

  .client-ui-button,
  .client-ui-input,
  .client-ui-submit {
    min-height: 48px;
    border: 0;
    border-radius: 12px;
    color: #fbfaf5;
    font: inherit;
    font-size: 16px;
    letter-spacing: 0;
    outline: none;
    transition:
      border-color 160ms ease,
      box-shadow 160ms ease,
      transform 160ms ease,
      background 160ms ease,
      opacity 160ms ease;
  }

  .client-ui-button {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.22);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.06)),
      linear-gradient(135deg, #1d7f76 0%, #0f5f5c 46%, #123a44 100%);
    box-shadow:
      0 12px 28px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.24);
    font-weight: 700;
  }

  .client-ui-button::after {
    position: absolute;
    inset: 1px;
    border-radius: 11px;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.22), transparent);
    content: '';
    opacity: 0;
    transform: translateX(-60%);
    transition:
      opacity 180ms ease,
      transform 260ms ease;
  }

  .client-ui-button:hover {
    transform: translateY(-1px);
    box-shadow:
      0 16px 34px rgba(0, 0, 0, 0.36),
      0 0 0 3px rgba(55, 211, 190, 0.16),
      inset 0 1px 0 rgba(255, 255, 255, 0.26);
  }

  .client-ui-button:hover::after {
    opacity: 1;
    transform: translateX(60%);
  }

  .client-ui-button:active {
    transform: translateY(1px) scale(0.99);
  }

  .client-ui-button:focus-visible,
  .client-ui-input:focus,
  .client-ui-submit:focus-visible {
    box-shadow:
      0 0 0 3px rgba(255, 255, 255, 0.16),
      0 0 0 5px rgba(55, 211, 190, 0.28);
  }

  .button-light {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: #67f3d2;
    box-shadow: 0 0 16px rgba(103, 243, 210, 0.9);
  }

  .button-label {
    position: relative;
    z-index: 1;
  }

  .client-ui-input-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(86px, auto);
    gap: 6px;
    padding: 6px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.08);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
  }

  .client-ui-input {
    min-width: 0;
    padding: 0 14px;
    background: rgba(5, 7, 10, 0.5);
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.18);
  }

  .client-ui-input::placeholder {
    color: rgba(251, 250, 245, 0.42);
  }

  .client-ui-submit {
    padding: 0 18px;
    background: #f4f0df;
    box-shadow:
      0 10px 22px rgba(0, 0, 0, 0.26),
      inset 0 1px 0 rgba(255, 255, 255, 0.7);
    color: #111418;
    font-weight: 700;
  }

  .client-ui-submit:not(:disabled):hover {
    background: #fff9df;
    transform: translateY(-1px);
  }

  .client-ui-submit:not(:disabled):active {
    transform: translateY(1px) scale(0.98);
  }

  .client-ui-submit:disabled {
    cursor: default;
    background: rgba(255, 255, 255, 0.14);
    box-shadow: none;
    color: rgba(251, 250, 245, 0.38);
    opacity: 1;
  }

  @media (max-width: 520px) {
    .client-ui-layer {
      bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
      width: min(100vw - 20px, 560px);
      padding: 10px;
      border-radius: 16px;
    }

    .client-ui-button,
    .client-ui-input,
    .client-ui-submit {
      min-height: 46px;
      font-size: 15px;
    }

    .client-ui-input-form {
      grid-template-columns: minmax(0, 1fr) 74px;
    }

    .client-ui-submit {
      padding: 0 12px;
    }
  }
</style>
