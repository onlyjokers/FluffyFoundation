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

  const visibleButtons = (nodes: Map<string, ClientUiNodeState>): RenderClientUiNodeState[] =>
    visibleNodes(nodes).filter((node) => node.kind === 'button');

  const visibleInputs = (nodes: Map<string, ClientUiNodeState>): RenderClientUiNodeState[] =>
    visibleNodes(nodes).filter((node) => node.kind === 'input');

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
    {#if visibleButtons($clientUiRuntime).length > 0}
      <div class="client-ui-button-stage">
        {#each visibleButtons($clientUiRuntime) as node (node.nodeId)}
        <button class="client-ui-button" type="button" on:click={() => pressButton(node.nodeId)}>
          <span class="button-ring" aria-hidden="true"></span>
          <span class="button-surface" aria-hidden="true"></span>
          <span class="button-label">
            <span class="button-light" aria-hidden="true"></span>
            Press
          </span>
        </button>
        {/each}
      </div>
    {/if}

    {#if visibleInputs($clientUiRuntime).length > 0}
      <div class="client-ui-input-dock">
        {#each visibleInputs($clientUiRuntime) as node (node.nodeId)}
        <form class="client-ui-input-form" on:submit|preventDefault={() => submitInput(node.nodeId)}>
          <span class="input-rail" aria-hidden="true"></span>
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
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .client-ui-layer {
    position: fixed;
    inset: 0;
    z-index: 32;
    pointer-events: none;
  }

  .client-ui-button-stage {
    position: absolute;
    top: 50%;
    left: 50%;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
    gap: 22px;
    width: min(620px, calc(100vw - 36px));
    transform: translate(-50%, -50%);
    place-items: center;
    pointer-events: none;
  }

  .client-ui-input-dock {
    position: absolute;
    left: 50%;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 22px);
    display: grid;
    gap: 12px;
    width: min(620px, calc(100vw - 28px));
    transform: translateX(-50%);
    pointer-events: none;
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
    pointer-events: auto;
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
    width: clamp(176px, 28vw, 260px);
    min-height: auto;
    aspect-ratio: 1;
    overflow: hidden;
    border: 1px solid rgba(250, 245, 220, 0.34);
    border-radius: 34% 66% 42% 58% / 56% 38% 62% 44%;
    background:
      linear-gradient(145deg, rgba(255, 249, 214, 0.2), rgba(255, 255, 255, 0.04) 38%, rgba(0, 0, 0, 0.22)),
      conic-gradient(from 225deg, #e3522f, #f3c95c, #38c2a5, #264a5b, #e3522f);
    box-shadow:
      0 34px 90px rgba(0, 0, 0, 0.46),
      0 0 0 10px rgba(255, 255, 255, 0.045),
      inset 0 2px 0 rgba(255, 255, 255, 0.3),
      inset 0 -22px 38px rgba(0, 0, 0, 0.25);
    font-weight: 800;
    isolation: isolate;
    text-transform: uppercase;
  }

  .client-ui-button::before {
    position: absolute;
    inset: 14px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: inherit;
    background:
      linear-gradient(150deg, rgba(5, 7, 9, 0.78), rgba(16, 24, 27, 0.84)),
      radial-gradient(circle at 50% 28%, rgba(255, 255, 255, 0.22), transparent 34%);
    content: '';
    z-index: 0;
  }

  .client-ui-button::after {
    position: absolute;
    inset: -36%;
    background: conic-gradient(
      from 90deg,
      transparent 0 18%,
      rgba(255, 247, 193, 0.35) 22%,
      transparent 30% 58%,
      rgba(56, 194, 165, 0.32) 64%,
      transparent 72% 100%
    );
    content: '';
    opacity: 0.74;
    transform: rotate(0deg);
    animation: client-ui-spin 7s linear infinite;
    z-index: -1;
  }

  .button-ring {
    position: absolute;
    inset: 28px;
    border: 1px dashed rgba(255, 247, 210, 0.36);
    border-radius: 50%;
    opacity: 0.72;
    transform: rotate(-12deg);
    z-index: 1;
  }

  .button-surface {
    position: absolute;
    inset: 48px;
    border-radius: 38% 62% 44% 56% / 58% 40% 60% 42%;
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.04)),
      linear-gradient(135deg, rgba(227, 82, 47, 0.4), rgba(56, 194, 165, 0.42));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.28),
      0 12px 28px rgba(0, 0, 0, 0.28);
    z-index: 1;
    transition:
      inset 180ms ease,
      transform 180ms ease;
  }

  .client-ui-button:hover {
    border-radius: 58% 42% 62% 38% / 40% 62% 38% 60%;
    transform: translateY(-4px) rotate(-1deg);
    box-shadow:
      0 42px 110px rgba(0, 0, 0, 0.52),
      0 0 0 12px rgba(255, 255, 255, 0.06),
      0 0 48px rgba(56, 194, 165, 0.24),
      inset 0 2px 0 rgba(255, 255, 255, 0.32),
      inset 0 -22px 38px rgba(0, 0, 0, 0.22);
  }

  .client-ui-button:hover .button-surface {
    inset: 42px;
    transform: rotate(5deg);
  }

  .client-ui-button:active {
    transform: translateY(2px) scale(0.97);
  }

  .client-ui-button:focus-visible,
  .client-ui-input:focus,
  .client-ui-submit:focus-visible {
    box-shadow:
      0 0 0 3px rgba(255, 255, 255, 0.16),
      0 0 0 5px rgba(55, 211, 190, 0.28);
  }

  .button-label {
    position: relative;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    gap: 9px;
    padding: 12px 16px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    background: rgba(4, 7, 9, 0.42);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14);
    color: #fff8d4;
    font-size: clamp(16px, 2.4vw, 22px);
  }

  .button-light {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: #f4c95c;
    box-shadow:
      0 0 12px rgba(244, 201, 92, 0.9),
      0 0 28px rgba(227, 82, 47, 0.55);
  }

  .client-ui-input-form {
    position: relative;
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) minmax(92px, auto);
    gap: 10px;
    align-items: center;
    min-height: 64px;
    padding: 8px 8px 8px 16px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 999px 24px 999px 24px;
    background:
      linear-gradient(145deg, rgba(250, 245, 220, 0.14), rgba(255, 255, 255, 0.04)),
      rgba(7, 10, 13, 0.78);
    box-shadow:
      0 24px 70px rgba(0, 0, 0, 0.42),
      inset 0 1px 0 rgba(255, 255, 255, 0.16);
    backdrop-filter: blur(18px) saturate(1.2);
    pointer-events: auto;
  }

  .client-ui-input-form::after {
    position: absolute;
    right: 26px;
    bottom: 7px;
    left: 58px;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(244, 201, 92, 0.72), transparent);
    content: '';
    opacity: 0.7;
  }

  .input-rail {
    width: 10px;
    height: 36px;
    border-radius: 999px;
    background: linear-gradient(#f4c95c, #38c2a5);
    box-shadow: 0 0 18px rgba(56, 194, 165, 0.5);
  }

  .client-ui-input {
    min-width: 0;
    padding: 0 4px;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    color: #fff8d4;
  }

  .client-ui-input::placeholder {
    color: rgba(255, 248, 212, 0.4);
  }

  .client-ui-submit {
    min-height: 48px;
    padding: 0 20px;
    border-radius: 999px 18px 999px 18px;
    background:
      linear-gradient(145deg, #fff4b8, #f4c95c 58%, #d9883d);
    box-shadow:
      0 12px 28px rgba(0, 0, 0, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.7);
    color: #111418;
    font-weight: 700;
  }

  .client-ui-submit:not(:disabled):hover {
    background:
      linear-gradient(145deg, #fff8d0, #ffd767 58%, #e69842);
    transform: translateY(-2px) skewX(-3deg);
  }

  .client-ui-submit:not(:disabled):active {
    transform: translateY(1px) scale(0.98);
  }

  .client-ui-submit:disabled {
    cursor: default;
    background: rgba(255, 255, 255, 0.14);
    box-shadow: none;
    color: rgba(255, 248, 212, 0.38);
    opacity: 1;
  }

  @keyframes client-ui-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 520px) {
    .client-ui-button-stage {
      width: min(100vw - 28px, 420px);
    }

    .client-ui-input-dock {
      bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
      width: min(100vw - 20px, 560px);
    }

    .client-ui-button {
      width: clamp(164px, 54vw, 220px);
    }

    .client-ui-button,
    .client-ui-input,
    .client-ui-submit {
      min-height: 46px;
      font-size: 15px;
    }

    .client-ui-input-form {
      grid-template-columns: 12px minmax(0, 1fr) 76px;
      gap: 8px;
      min-height: 58px;
      padding-left: 12px;
    }

    .client-ui-submit {
      padding: 0 12px;
    }

    .input-rail {
      width: 8px;
      height: 30px;
    }
  }
</style>
