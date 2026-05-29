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
              Press
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
    --client-ui-bg: rgba(10, 13, 16, 0.78);
    --client-ui-bg-strong: rgba(16, 20, 24, 0.9);
    --client-ui-border: rgba(255, 255, 255, 0.2);
    --client-ui-border-strong: rgba(255, 255, 255, 0.34);
    --client-ui-text: rgba(255, 255, 255, 0.92);
    --client-ui-muted: rgba(255, 255, 255, 0.48);
    --client-ui-accent: #7dd3c7;
    --client-ui-record: #ef6b5a;
    color: var(--client-ui-text);
  }

  .client-ui-stage {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 50% 52%, rgba(0, 0, 0, 0.18), transparent 36%);
    opacity: 0.38;
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
    opacity: var(--slot-opacity, 0.82);
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

  .client-ui-button,
  .client-ui-input,
  .client-ui-record-button,
  .client-ui-submit {
    min-height: 48px;
    border: 1px solid var(--client-ui-border);
    border-radius: 12px;
    background: var(--client-ui-bg);
    color: var(--client-ui-text);
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
    min-width: 152px;
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.26);
    font-weight: 650;
    cursor: pointer;
  }

  .client-ui-record-button.recording {
    border-color: rgba(239, 107, 90, 0.72);
    background: rgba(43, 18, 17, 0.88);
    color: rgba(255, 242, 239, 0.96);
  }

  .record-dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: var(--client-ui-record);
  }

  .client-ui-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: clamp(156px, 22vw, 220px);
    min-height: 56px;
    padding: 0 28px;
    box-shadow: 0 16px 42px rgba(0, 0, 0, 0.28);
    font-weight: 650;
    cursor: pointer;
  }

  .client-ui-button:hover {
    border-color: var(--client-ui-border-strong);
    background: var(--client-ui-bg-strong);
    transform: translateY(-1px);
  }

  .client-ui-button:active {
    transform: translateY(1px);
  }

  .client-ui-button:focus-visible,
  .client-ui-input:focus,
  .client-ui-record-button:focus-visible,
  .client-ui-submit:focus-visible {
    box-shadow:
      0 0 0 2px rgba(255, 255, 255, 0.18),
      0 0 0 5px rgba(125, 211, 199, 0.3);
  }

  .client-ui-input-form {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(92px, auto);
    gap: 12px;
    align-items: center;
    min-height: 60px;
    padding: 8px;
    overflow: hidden;
    border: 1px solid var(--client-ui-border);
    border-radius: 14px;
    background: var(--client-ui-bg);
    box-shadow: 0 16px 44px rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(16px) saturate(1.1);
    pointer-events: auto;
  }

  .client-ui-input {
    min-width: 0;
    padding: 0 12px;
    border-color: transparent;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.06);
    box-shadow: none;
    color: var(--client-ui-text);
    font-size: 16px;
  }

  .client-ui-input::placeholder {
    color: var(--client-ui-muted);
  }

  .client-ui-submit {
    min-height: 48px;
    padding: 0 18px;
    border-radius: 10px;
    background: rgba(125, 211, 199, 0.16);
    color: rgba(232, 255, 251, 0.96);
    font-weight: 650;
    cursor: pointer;
  }

  .client-ui-submit:not(:disabled):hover {
    border-color: rgba(125, 211, 199, 0.48);
    background: rgba(125, 211, 199, 0.22);
    transform: translateY(-1px);
  }

  .client-ui-submit:not(:disabled):active {
    transform: translateY(1px) scale(0.98);
  }

  .client-ui-submit:disabled {
    cursor: default;
    border-color: rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.07);
    box-shadow: none;
    color: var(--client-ui-muted);
    opacity: 1;
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
      grid-template-columns: minmax(0, 1fr) 76px;
      gap: 8px;
      min-height: 58px;
      padding: 6px;
    }

    .client-ui-submit {
      padding: 0 12px;
    }
  }
</style>
