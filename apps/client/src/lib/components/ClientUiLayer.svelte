<!-- Purpose: Render ClientUI nodes deployed into the Client runtime. -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { getSDK, getServerUrl } from '$lib/stores/client';
  import { createAgentTextPayload } from '$lib/client-page/agent-text';
  import {
    clientUiRuntime,
    type ClientUiInteractionEvent,
    type ClientUiNodeState,
  } from '$lib/stores/client/client-ui-runtime';

  type RenderClientUiNodeState = ClientUiNodeState & { nodeId: string };

  let inputDrafts: Record<string, string> = {};
  const recorders = new Map<string, { recorder: MediaRecorder; chunks: Blob[]; stream: MediaStream }>();

  function pressButton(nodeId: string): void {
    clientUiRuntime.pressButton(nodeId);
  }

  function assetRef(assetId: string): string {
    return assetId ? `asset:${assetId}` : '';
  }

  function recordingMimeType(): string | undefined {
    if (typeof MediaRecorder === 'undefined') return undefined;
    const preferred = 'audio/webm;codecs=opus';
    return MediaRecorder.isTypeSupported?.(preferred) ? preferred : undefined;
  }

  async function uploadRecording(nodeId: string, blob: Blob): Promise<void> {
    const serverUrl = getServerUrl().trim();
    if (!serverUrl) throw new Error('Missing server URL');
    const form = new FormData();
    const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('mpeg') ? 'mp3' : 'webm';
    form.set('file', blob, `client-recording-${Date.now()}.${extension}`);
    const response = await fetch(new URL('/api/stt/recording-asset', serverUrl).toString(), {
      method: 'POST',
      body: form,
      credentials: 'include',
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(body || `Recording upload failed (${response.status})`);
    }
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const assetId = typeof json.assetId === 'string' ? json.assetId : '';
    clientUiRuntime.finishRecording(nodeId, { assetId, asset: assetRef(assetId) });
  }

  async function toggleRecording(nodeId: string): Promise<void> {
    const current = recorders.get(nodeId);
    if (current) {
      current.recorder.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const mimeType = recordingMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorders.set(nodeId, { recorder, chunks, stream });
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      });
      recorder.addEventListener('stop', () => {
        recorders.delete(nodeId);
        stream.getTracks().forEach((track) => track.stop());
        clientUiRuntime.setRecording(nodeId, false);
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        void uploadRecording(nodeId, blob).catch((error) => {
          console.warn('[ClientUI] recording upload failed', error);
        });
      });
      recorder.start();
      clientUiRuntime.setRecording(nodeId, true);
    } catch (error) {
      console.warn('[ClientUI] recording failed', error);
      clientUiRuntime.setRecording(nodeId, false);
    }
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

  const visibleRecorders = (nodes: Map<string, ClientUiNodeState>): RenderClientUiNodeState[] =>
    visibleNodes(nodes).filter((node) => node.kind === 'record');

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
        recording: event.recording,
        assetId: event.assetId,
        asset: event.asset,
        finished: event.finished,
      },
      { trackLatest: false }
    );
  };

  const unsubscribeInteraction = clientUiRuntime.onInteraction(sendInteraction);
  onDestroy(unsubscribeInteraction);
</script>

{#if visibleNodes($clientUiRuntime).length > 0}
  <div class="client-ui-layer" aria-label="Client controls">
    <div class="client-ui-stage" aria-hidden="true"></div>

    {#if visibleButtons($clientUiRuntime).length > 0}
      <div class="client-ui-button-stage">
        {#each visibleButtons($clientUiRuntime) as node, index (node.nodeId)}
          <div class="client-ui-button-shell" style={`--slot-opacity:${Math.max(0.5, 0.82 - index * 0.08)};`}>
            <button class="client-ui-button" type="button" on:click={() => pressButton(node.nodeId)}>
              <span class="button-halo" aria-hidden="true"></span>
              <span class="button-ring" aria-hidden="true"></span>
              <span class="button-surface" aria-hidden="true"></span>
              <span class="button-core" aria-hidden="true"></span>
              <span class="button-label">
                <span class="button-light" aria-hidden="true"></span>
                Press
              </span>
            </button>
          </div>
        {/each}
      </div>
    {/if}

    {#if visibleInputs($clientUiRuntime).length > 0}
      <div class="client-ui-input-dock">
        {#each visibleInputs($clientUiRuntime) as node (node.nodeId)}
          <div class="client-ui-input-shell">
            <form class="client-ui-input-form" on:submit|preventDefault={() => submitInput(node.nodeId)}>
              <span class="input-rail" aria-hidden="true"></span>
              <span class="input-sigil" aria-hidden="true"></span>
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
          </div>
        {/each}
      </div>
    {/if}

    {#if visibleRecorders($clientUiRuntime).length > 0}
      <div class="client-ui-record-dock">
        {#each visibleRecorders($clientUiRuntime) as node (node.nodeId)}
          <button
            class:recording={Boolean(node.recording)}
            class="client-ui-record-button"
            type="button"
            on:click={() => void toggleRecording(node.nodeId)}
          >
            <span class="record-dot" aria-hidden="true"></span>
            {node.recording ? 'Stop' : 'Record'}
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .client-ui-layer {
    position: fixed;
    inset: 0;
    z-index: var(--layer-static-ui);
    overflow: hidden;
    pointer-events: none;
    isolation: isolate;
    --fct-ink: #040506;
    --fct-red: #e54a2d;
    --fct-red-deep: #8f1914;
    --fct-gold: #f1c65d;
    --fct-teal: #39c7a7;
    --fct-panel: rgba(7, 9, 11, 0.76);
    --fct-panel-deep: rgba(2, 3, 4, 0.9);
    --fct-frame: rgba(255, 243, 202, 0.16);
    --fct-highlight: rgba(255, 248, 225, 0.8);
    color: #fff6d6;
  }

  .client-ui-layer::before,
  .client-ui-layer::after {
    position: absolute;
    inset: 0;
    content: '';
    pointer-events: none;
  }

  .client-ui-layer::before {
    background:
      radial-gradient(circle at 50% 45%, rgba(228, 74, 45, 0.24), transparent 18%),
      radial-gradient(circle at 50% 45%, rgba(57, 199, 167, 0.16), transparent 34%),
      radial-gradient(circle at 50% 50%, rgba(241, 198, 93, 0.1), transparent 42%),
      radial-gradient(circle at 50% 50%, rgba(0, 0, 0, 0.36), transparent 58%),
      linear-gradient(180deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.42));
    mix-blend-mode: screen;
    opacity: 0.96;
  }

  .client-ui-layer::after {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 12%),
      repeating-linear-gradient(
        180deg,
        rgba(255, 255, 255, 0.038) 0,
        rgba(255, 255, 255, 0.038) 1px,
        transparent 1px,
        transparent 8px
      ),
      radial-gradient(circle at center, transparent 34%, rgba(0, 0, 0, 0.68) 100%);
    opacity: 0.55;
  }

  .client-ui-stage {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 50% 48%, rgba(229, 74, 45, 0.2), transparent 15%),
      radial-gradient(circle at 50% 48%, rgba(241, 198, 93, 0.12), transparent 28%),
      radial-gradient(circle at 50% 48%, rgba(57, 199, 167, 0.08), transparent 38%);
    filter: blur(3px);
    opacity: 0.86;
  }

  .client-ui-button-stage {
    position: absolute;
    top: 50%;
    left: 50%;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
    gap: 22px;
    width: min(900px, calc(100vw - 36px));
    transform: translate(-50%, -58%);
    place-items: center;
    pointer-events: none;
  }

  .client-ui-button-shell {
    position: relative;
    display: grid;
    place-items: center;
  }

  .client-ui-button-shell::before {
    position: absolute;
    inset: 8% 10%;
    border-radius: 50%;
    background:
      radial-gradient(circle, rgba(241, 198, 93, 0.3), transparent 58%),
      radial-gradient(circle, rgba(57, 199, 167, 0.24), transparent 66%);
    filter: blur(28px);
    content: '';
    opacity: var(--slot-opacity, 0.82);
    transform: scale(1.06);
  }

  .client-ui-input-dock {
    position: absolute;
    left: 50%;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 22px);
    display: grid;
    gap: 12px;
    width: min(760px, calc(100vw - 22px));
    transform: translateX(-50%);
    pointer-events: none;
  }

  .client-ui-record-dock {
    position: absolute;
    left: 50%;
    top: calc(50% + 150px);
    display: grid;
    gap: 12px;
    transform: translateX(-50%);
    pointer-events: none;
  }

  .client-ui-input-shell {
    position: relative;
  }

  .client-ui-input-shell::before {
    position: absolute;
    inset: -12px -10px;
    border: 1px solid rgba(241, 198, 93, 0.12);
    border-radius: 30px 30px 46px 46px / 36px 36px 62px 62px;
    background:
      radial-gradient(circle at 20% 50%, rgba(57, 199, 167, 0.16), transparent 34%),
      radial-gradient(circle at 80% 50%, rgba(229, 74, 45, 0.18), transparent 36%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent 45%),
      rgba(0, 0, 0, 0.12);
    box-shadow:
      0 22px 80px rgba(0, 0, 0, 0.46),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
    content: '';
    pointer-events: none;
  }

  .client-ui-button,
  .client-ui-input,
  .client-ui-record-button,
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

  .client-ui-record-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-width: 180px;
    border: 1px solid rgba(250, 245, 220, 0.28);
    background:
      linear-gradient(180deg, rgba(13, 18, 20, 0.82), rgba(4, 6, 7, 0.88)),
      rgba(229, 74, 45, 0.12);
    box-shadow:
      0 18px 48px rgba(0, 0, 0, 0.42),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
    font-weight: 800;
    text-transform: uppercase;
    cursor: pointer;
  }

  .client-ui-record-button.recording {
    border-color: rgba(229, 74, 45, 0.62);
    background:
      linear-gradient(180deg, rgba(70, 15, 12, 0.9), rgba(12, 5, 5, 0.92)),
      rgba(229, 74, 45, 0.24);
    box-shadow:
      0 0 0 8px rgba(229, 74, 45, 0.1),
      0 18px 52px rgba(0, 0, 0, 0.48);
  }

  .record-dot {
    width: 11px;
    height: 11px;
    border-radius: 999px;
    background: #e54a2d;
    box-shadow: 0 0 18px rgba(229, 74, 45, 0.9);
  }

  .client-ui-button {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: clamp(220px, 30vw, 340px);
    min-height: auto;
    aspect-ratio: 1.14;
    overflow: hidden;
    border: 1px solid rgba(250, 245, 220, 0.3);
    border-radius: 34% 66% 42% 58% / 56% 38% 62% 44%;
    background:
      radial-gradient(circle at 50% 40%, rgba(255, 255, 255, 0.12), transparent 24%),
      linear-gradient(145deg, rgba(255, 249, 214, 0.16), rgba(255, 255, 255, 0.02) 34%, rgba(0, 0, 0, 0.24)),
      conic-gradient(from 225deg, #e3522f, #f3c95c, #38c2a5, #263c53, #e3522f);
    box-shadow:
      0 36px 110px rgba(0, 0, 0, 0.54),
      0 0 0 12px rgba(255, 255, 255, 0.04),
      inset 0 2px 0 rgba(255, 255, 255, 0.3),
      inset 0 -24px 44px rgba(0, 0, 0, 0.3);
    font-weight: 800;
    isolation: isolate;
    text-transform: uppercase;
    cursor: pointer;
  }

  .client-ui-button::before {
    position: absolute;
    inset: 16px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: inherit;
    background:
      linear-gradient(150deg, rgba(5, 7, 9, 0.8), rgba(16, 24, 27, 0.88)),
      radial-gradient(circle at 50% 28%, rgba(255, 255, 255, 0.22), transparent 34%);
    content: '';
    z-index: 0;
  }

  .client-ui-button::after {
    position: absolute;
    inset: -44%;
    background: conic-gradient(
      from 90deg,
      transparent 0 18%,
      rgba(255, 247, 193, 0.32) 22%,
      transparent 30% 58%,
      rgba(56, 194, 165, 0.28) 64%,
      transparent 72% 100%
    );
    content: '';
    opacity: 0.72;
    transform: rotate(0deg);
    animation: client-ui-spin 9s linear infinite;
    z-index: -1;
  }

  .button-halo {
    position: absolute;
    inset: 8px;
    border-radius: inherit;
    background:
      radial-gradient(circle at 50% 50%, rgba(229, 74, 45, 0.22), transparent 48%),
      radial-gradient(circle at 50% 50%, rgba(241, 198, 93, 0.12), transparent 56%);
    filter: blur(10px);
    opacity: 0.82;
    z-index: 0;
  }

  .button-ring {
    position: absolute;
    inset: 22px;
    border: 1px dashed rgba(255, 247, 210, 0.34);
    border-radius: 50%;
    opacity: 0.74;
    transform: rotate(-12deg);
    z-index: 1;
  }

  .button-surface {
    position: absolute;
    inset: 46px;
    border-radius: 38% 62% 44% 56% / 58% 40% 60% 42%;
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.05)),
      linear-gradient(135deg, rgba(227, 82, 47, 0.42), rgba(56, 194, 165, 0.44));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.28),
      0 12px 28px rgba(0, 0, 0, 0.28);
    z-index: 1;
    transition:
      inset 180ms ease,
      transform 180ms ease;
  }

  .button-core {
    position: absolute;
    inset: 58px;
    border-radius: 36% 64% 40% 60% / 56% 44% 56% 44%;
    background:
      radial-gradient(circle at 50% 34%, rgba(255, 255, 255, 0.14), transparent 28%),
      linear-gradient(180deg, rgba(34, 39, 44, 0.92), rgba(6, 8, 9, 0.94));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      inset 0 -14px 24px rgba(0, 0, 0, 0.34),
      0 0 24px rgba(0, 0, 0, 0.28);
    z-index: 1;
  }

  .client-ui-button:hover {
    border-radius: 58% 42% 62% 38% / 40% 62% 38% 60%;
    transform: translateY(-5px) rotate(-1.25deg) scale(1.01);
    box-shadow:
      0 46px 120px rgba(0, 0, 0, 0.58),
      0 0 0 14px rgba(255, 255, 255, 0.055),
      0 0 54px rgba(56, 194, 165, 0.24),
      inset 0 2px 0 rgba(255, 255, 255, 0.32),
      inset 0 -22px 38px rgba(0, 0, 0, 0.22);
  }

  .client-ui-button:hover .button-surface {
    inset: 40px;
    transform: rotate(4deg) scale(1.01);
  }

  .client-ui-button:active {
    transform: translateY(2px) scale(0.97);
  }

  .client-ui-button:focus-visible,
  .client-ui-input:focus,
  .client-ui-record-button:focus-visible,
  .client-ui-submit:focus-visible {
    box-shadow:
      0 0 0 3px rgba(255, 255, 255, 0.14),
      0 0 0 6px rgba(57, 199, 167, 0.26),
      0 0 0 10px rgba(241, 198, 93, 0.18);
  }

  .button-label {
    position: relative;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    gap: 9px;
    padding: 12px 16px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 999px 16px 999px 16px;
    background:
      linear-gradient(180deg, rgba(9, 12, 14, 0.58), rgba(3, 4, 5, 0.72)),
      rgba(4, 7, 9, 0.42);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.14),
      0 12px 22px rgba(0, 0, 0, 0.22);
    color: #fff8d4;
    font-size: clamp(16px, 2.1vw, 22px);
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
    grid-template-columns: 18px 12px minmax(0, 1fr) minmax(100px, auto);
    gap: 12px;
    align-items: center;
    min-height: 70px;
    padding: 9px 10px 9px 16px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 999px 22px 999px 26px;
    background:
      linear-gradient(145deg, rgba(250, 245, 220, 0.13), rgba(255, 255, 255, 0.03)),
      linear-gradient(180deg, rgba(8, 10, 13, 0.84), rgba(4, 5, 7, 0.9));
    box-shadow:
      0 28px 90px rgba(0, 0, 0, 0.48),
      inset 0 1px 0 rgba(255, 255, 255, 0.14);
    backdrop-filter: blur(20px) saturate(1.25);
    pointer-events: auto;
  }

  .client-ui-input-form::after {
    position: absolute;
    right: 28px;
    bottom: 8px;
    left: 72px;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(244, 201, 92, 0.7), transparent);
    content: '';
    opacity: 0.7;
  }

  .input-rail {
    width: 10px;
    height: 38px;
    border-radius: 999px;
    background: linear-gradient(#f4c95c, #38c2a5 56%, #e3522f);
    box-shadow:
      0 0 18px rgba(56, 194, 165, 0.48),
      0 0 10px rgba(243, 201, 92, 0.3);
  }

  .input-sigil {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background:
      radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.8), transparent 28%),
      linear-gradient(180deg, var(--fct-gold), var(--fct-red));
    box-shadow:
      0 0 14px rgba(241, 198, 93, 0.45),
      0 0 24px rgba(227, 82, 47, 0.32);
  }

  .client-ui-input {
    min-width: 0;
    padding: 0 4px 0 2px;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    color: #fff8d4;
    font-size: 16px;
  }

  .client-ui-input::placeholder {
    color: rgba(255, 248, 212, 0.42);
  }

  .client-ui-submit {
    min-height: 48px;
    padding: 0 22px;
    border-radius: 999px 18px 999px 20px;
    background:
      linear-gradient(145deg, #fff4b8, #f4c95c 58%, #d9883d);
    box-shadow:
      0 12px 28px rgba(0, 0, 0, 0.32),
      inset 0 1px 0 rgba(255, 255, 255, 0.7);
    color: #111418;
    font-weight: 700;
    cursor: pointer;
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
      transform: translate(-50%, -54%);
    }

    .client-ui-input-dock {
      bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
      width: min(100vw - 20px, 560px);
    }

    .client-ui-button {
      width: clamp(184px, 58vw, 248px);
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
