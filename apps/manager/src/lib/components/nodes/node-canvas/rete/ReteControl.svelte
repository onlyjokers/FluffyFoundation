<!-- Purpose: Render Rete controls (inputs/selects/MIDI learn) for the node canvas. -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { ClassicPreset } from 'rete';
  import {
    audienceClients,
    clientReadiness,
    sensorData,
  } from '$lib/stores/manager';
  import { assetsStore } from '$lib/stores/assets';
  import { nodeEngine, nodeRegistry } from '$lib/nodes';
  import type { ClientInfo } from '@shugu/protocol';
  import { midiService, type MidiEvent } from '$lib/features/midi/midi-service';
  import { midiNodeBridge, type MidiSource } from '$lib/features/midi/midi-node-bridge';
  import type { Connection, NodeInstance } from '$lib/nodes/types';
  import { renderMarkdownToHtml } from '../utils/markdown';
  import CurveEditor from '../ui/CurveEditor.svelte';
  import ReteClientPickerControl from './ReteClientPickerControl.svelte';
  import ReteFileControl from './ReteFileControl.svelte';
  import ReteLocalAssetControl from './ReteLocalAssetControl.svelte';
  import ReteMidiLearnControl from './ReteMidiLearnControl.svelte';
  import ReteNoteControl from './ReteNoteControl.svelte';
  import ReteTimeRangeControl from './ReteTimeRangeControl.svelte';

  type AnyRecord = Record<string, unknown>;

  export let data: AnyRecord;
  $: isInline = Boolean((data as AnyRecord)?.inline);
  $: inputControlLabel =
    data instanceof ClassicPreset.InputControl ? (data as AnyRecord).controlLabel : undefined;
  type NumberBounds = { min?: number; max?: number; step?: number };
  const resolveNumberBounds = (ctrl: unknown): NumberBounds => {
    if (!(ctrl instanceof ClassicPreset.InputControl)) return {};
    if ((ctrl as AnyRecord).type !== 'number') return {};

    const isFiniteNumber = (value: unknown): value is number =>
      typeof value === 'number' && Number.isFinite(value);

    const fromControl: NumberBounds = {
      min: isFiniteNumber((ctrl as AnyRecord).min) ? (ctrl as AnyRecord).min : undefined,
      max: isFiniteNumber((ctrl as AnyRecord).max) ? (ctrl as AnyRecord).max : undefined,
      step: isFiniteNumber((ctrl as AnyRecord).step) ? (ctrl as AnyRecord).step : undefined,
    };
    if (
      fromControl.min !== undefined ||
      fromControl.max !== undefined ||
      fromControl.step !== undefined
    ) {
      return fromControl;
    }

    // Safety: some legacy graphs/controls may miss `min/max` hints. Resolve them from the node registry so
    // critical constraints (e.g. non-negative playback rate) still apply at the UI layer.
    const nodeType =
      typeof (ctrl as AnyRecord).nodeType === 'string' ? String((ctrl as AnyRecord).nodeType) : '';
    const portId = typeof (ctrl as AnyRecord).portId === 'string' ? String((ctrl as AnyRecord).portId) : '';
    const configKey =
      typeof (ctrl as AnyRecord).configKey === 'string' ? String((ctrl as AnyRecord).configKey) : '';
    const key = portId || configKey;
    if (!nodeType || !key) return {};

    const def = nodeRegistry.get(nodeType);
    if (!def) return {};
    const port = def.inputs?.find((p) => String(p.id) === key);
    const field = def.configSchema?.find((f) => String(f.key) === key);

    const min = isFiniteNumber(port?.min)
      ? port!.min
      : isFiniteNumber(field?.min)
        ? field!.min
        : undefined;
    const max = isFiniteNumber(port?.max)
      ? port!.max
      : isFiniteNumber(field?.max)
        ? field!.max
        : undefined;
    const step = isFiniteNumber(port?.step)
      ? port!.step
      : isFiniteNumber(field?.step)
        ? field!.step
        : undefined;
    return { min, max, step };
  };

  $: numberBounds =
    data instanceof ClassicPreset.InputControl && data.type === 'number'
      ? resolveNumberBounds(data)
      : {};
  $: numberInputMin = numberBounds.min;
  $: numberInputMax = numberBounds.max;
  $: numberInputStep =
    data instanceof ClassicPreset.InputControl && data.type === 'number'
      ? (numberBounds.step ?? (data as AnyRecord).step ?? 'any')
      : undefined;
  $: isMomentaryButton =
    data instanceof ClassicPreset.InputControl && Boolean((data as AnyRecord).button);
  $: momentaryButtonLabel = isMomentaryButton
    ? String((data as AnyRecord).buttonLabel ?? data?.label ?? 'Push')
    : 'Push';
  const graphStateStore = nodeEngine.graphState;
  const tickTimeStore = nodeEngine.tickTime;
  const midiLearnModeStore = midiNodeBridge.learnMode;
  const midiLastMessageStore = midiService.lastMessage;
  const midiSelectedInputStore = midiService.selectedInputId;
  const midiSupportedStore = midiService.isSupported;

  function changeInput(event: Event) {
    if (!(data instanceof ClassicPreset.InputControl)) return;
    const target = event.target as HTMLInputElement;
    if (data.type === 'number') {
      const num = Number(target.value);
      let next = Number.isFinite(num) ? num : 0;
      const min = numberBounds.min;
      const max = numberBounds.max;
      if (typeof min === 'number' && Number.isFinite(min)) next = Math.max(min, next);
      if (typeof max === 'number' && Number.isFinite(max)) next = Math.min(max, next);
      if (Number.isFinite(num) && next !== num) target.value = String(next);
      data.setValue(next);
    } else {
      data.setValue(target.value);
    }
  }

  function normalizeNumberInput(event: Event) {
    if (!(data instanceof ClassicPreset.InputControl)) return;
    if (data.type !== 'number') return;
    if ((data as AnyRecord).readonly) return;

    const target = event.target as HTMLInputElement;
    const raw = target.value;
    if (raw === '') return;

    const num = Number(raw);
    const current = typeof (data as AnyRecord).value === 'number' ? (data as AnyRecord).value : 0;

    if (!Number.isFinite(num)) {
      target.value = String(current);
      return;
    }

    let next = num;
    const min = numberBounds.min;
    const max = numberBounds.max;
    if (typeof min === 'number' && Number.isFinite(min)) next = Math.max(min, next);
    if (typeof max === 'number' && Number.isFinite(max)) next = Math.min(max, next);

    // Force a canonical display string (e.g. "000" -> "0", "01.0" -> "1").
    const canonical = String(next);
    if (target.value !== canonical) target.value = canonical;

    // Ensure the underlying control value matches the canonical/clamped value.
    data.setValue(next);
  }

  let momentaryInputResetTimer: ReturnType<typeof setTimeout> | null = null;
  let momentaryBooleanResetTimer: ReturnType<typeof setTimeout> | null = null;

  function pressMomentaryInput(): void {
    if (!(data instanceof ClassicPreset.InputControl)) return;
    if (!(data as AnyRecord).button) return;
    if ((data as AnyRecord).readonly) return;

    if (momentaryInputResetTimer) clearTimeout(momentaryInputResetTimer);
    data.setValue(1);
    // Keep the trigger high long enough for at least one graph tick to observe it.
    momentaryInputResetTimer = setTimeout(() => {
      momentaryInputResetTimer = null;
      data.setValue(0);
    }, 120);
  }

  function pressMomentaryBooleanInput(): void {
    if (!data || data.controlType !== 'boolean') return;
    if (!data.button) return;
    if (data.readonly) return;

    if (momentaryBooleanResetTimer) clearTimeout(momentaryBooleanResetTimer);
    data.setValue(true);
    // Keep the trigger high long enough for at least one graph tick to observe it.
    momentaryBooleanResetTimer = setTimeout(() => {
      momentaryBooleanResetTimer = null;
      data.setValue(false);
    }, 120);
  }

  function changeSelect(event: Event) {
    const target = event.target as HTMLSelectElement;
    data?.setValue?.(target.value);
  }

  function changeBoolean(event: Event) {
    const target = event.target as HTMLInputElement;
    data?.setValue?.(Boolean(target.checked));
  }

  function changeNote(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    const next = target.value;
    data?.setValue?.(next);
    // `data.setValue` mutates an object field (no Svelte invalidation), so keep the preview in sync here.
    if (data?.controlType === 'note') noteHtml = renderMarkdownToHtml(next);
  }

  type NoteViewMode = 'edit' | 'preview' | 'split';
  // Persist the note toolbar mode per node so imports restore the last view.
  const noteViewModeKey = '__noteViewMode';
  const resolveNoteViewMode = (value: unknown): NoteViewMode =>
    value === 'edit' || value === 'preview' || value === 'split' ? value : 'edit';
  let noteViewMode: NoteViewMode = 'edit';
  let noteNodeId = '';
  let noteHtml = '';

  $: if (data?.controlType === 'note') {
    const raw = typeof data?.value === 'string' ? data.value : String(data?.value ?? '');
    noteHtml = renderMarkdownToHtml(raw);
  } else {
    noteHtml = '';
  }

  $: if (data?.controlType === 'note') {
    const nextNodeId = typeof data?.nodeId === 'string' ? data.nodeId : '';
    if (nextNodeId !== noteNodeId) {
      noteNodeId = nextNodeId;
      const stored = nextNodeId
        ? (nodeEngine.getNode(nextNodeId)?.config as Record<string, unknown> | undefined)?.[
            noteViewModeKey
          ]
        : undefined;
      noteViewMode = resolveNoteViewMode(stored);
    }
  } else {
    noteNodeId = '';
    noteViewMode = 'edit';
  }

  function setNoteViewMode(next: NoteViewMode) {
    if (noteViewMode === next) return;
    noteViewMode = next;
    const nodeId = typeof data?.nodeId === 'string' ? data.nodeId : '';
    if (!nodeId) return;
    nodeEngine.updateNodeConfig(nodeId, { [noteViewModeKey]: next });
  }

  function pickClient(clientId: string) {
    data?.setValue?.(clientId);
  }

  let didRefreshAssets = false;
  $: if (data?.controlType === 'asset-picker' && !didRefreshAssets) {
    didRefreshAssets = true;
    void assetsStore.refresh();
  }

  function buildAssetOptions(kind: string): { value: string; label: string }[] {
    const list = ($assetsStore?.assets ?? []) as AnyRecord[];
    const k = kind && typeof kind === 'string' ? kind : 'any';
    const filtered = k === 'any' ? list : list.filter((a) => String(a?.kind ?? '') === k);
    return filtered.map((a) => ({
      value: `asset:${String(a?.id ?? '')}`,
      label: `${String(a?.originalName ?? a?.id ?? '')}`,
    }));
  }

  function clientLabel(c: ClientInfo): string {
    return String((c as AnyRecord).clientId ?? '');
  }

  function readinessClass(clientId: string, connected?: boolean): string {
    if (connected === false) return 'disconnected';
    const info = $clientReadiness.get(clientId);
    if (!info) return 'connected';
    if (info.status === 'assets-ready') return 'ready';
    if (info.status === 'assets-error') return 'error';
    if (info.status === 'assets-loading') return 'loading';
    return 'connected';
  }

  $: hasLabel = Boolean(data?.label) && !isInline;
  $: showInputControlLabel = Boolean(inputControlLabel) && !isInline;

  const clampInt = (value: number, min: number, max: number) => {
    const next = Math.floor(value);
    return Math.max(min, Math.min(max, next));
  };

  const toFiniteNumber = (value: unknown, fallback: number): number => {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  const coerceBoolean = (value: unknown, fallback = false): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value >= 0.5;
    return fallback;
  };

  const hashStringDjb2 = (value: string): number => {
    let hash = 5381;
    for (let i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
    }
    return hash >>> 0;
  };

  const buildStableRandomOrder = (nodeId: string, clients: string[]) => {
    const keyed = clients.map((id) => ({ id, score: hashStringDjb2(`${nodeId}|${id}`) }));
    keyed.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
    return keyed.map((k) => k.id);
  };

  $: clientPickerInputLocked = (() => {
    if (data?.controlType !== 'client-picker') return false;
    const nodeId = String(data?.nodeId ?? '');
    if (!nodeId) return false;
    return ($graphStateStore?.connections ?? []).some(
      (c) =>
        String(c.targetNodeId) === nodeId &&
        (String(c.targetPortId) === 'index' ||
          String(c.targetPortId) === 'range' ||
          String(c.targetPortId) === 'loadIndexs')
    );
  })();

  $: clientPickerView = (() => {
    if (data?.controlType !== 'client-picker') return [];
    const _tick = $tickTimeStore;
    void _tick;

    const nodeId = String(data?.nodeId ?? '');
    if (!nodeId) return [];

    const rawClients = ($audienceClients ?? []) as AnyRecord[];
    const clients = rawClients.map((c) => String(c?.clientId ?? '')).filter(Boolean);
    if (clients.length === 0) return [];
    const clientById = new Map<string, ClientInfo>();
    for (const c of rawClients) {
      const id = String((c as AnyRecord)?.clientId ?? '');
      if (!id) continue;
      clientById.set(id, c as ClientInfo);
    }

    const node = nodeEngine.getNode(nodeId);
    if (!node) {
      const orderedClients = clients
        .map((id) => clientById.get(id))
        .filter(Boolean) as ClientInfo[];
      return orderedClients.map((c) => ({ client: c, selected: false, primary: false }));
    }
    const computed = nodeEngine.getLastComputedInputs(nodeId);
    const isPortConnected = (portId: string) =>
      ($graphStateStore?.connections ?? []).some(
        (c) => String(c.targetNodeId) === nodeId && String(c.targetPortId) === String(portId)
      );
    const getEffectiveInput = (portId: 'index' | 'range' | 'random'): unknown => {
      const connected = isPortConnected(portId);
      if (connected && computed && Object.prototype.hasOwnProperty.call(computed, portId)) {
        return (computed as AnyRecord)[portId];
      }
      return (node.inputValues as AnyRecord)?.[portId];
    };

    const total = clients.length;
    const indexRaw = toFiniteNumber(getEffectiveInput('index'), 1);
    const rangeRaw = toFiniteNumber(getEffectiveInput('range'), 1);
    const random = coerceBoolean(getEffectiveInput('random'), false);

    const index = clampInt(indexRaw, 1, total);
    const range = clampInt(rangeRaw, 1, total);
    const ordered = random ? buildStableRandomOrder(nodeId, clients) : clients;

    const selectedIdSet = new Set<string>();
    const start = index - 1;
    for (let i = 0; i < range; i += 1) selectedIdSet.add(ordered[(start + i) % total]);
    const selectedFirstId = ordered[start] ?? '';

    const orderedClients = ordered.map((id) => clientById.get(id)).filter(Boolean) as ClientInfo[];
    return orderedClients.map((c) => ({
      client: c,
      selected: selectedIdSet.has(String((c as AnyRecord)?.clientId ?? '')),
      primary: String((c as AnyRecord)?.clientId ?? '') === selectedFirstId,
    }));
  })();

  function formatValue(val: unknown): string {
    if (val === null || val === undefined) return '0.00';
    const num = Number(val);
    if (!Number.isFinite(num)) return '0.00';
    return num.toFixed(2);
  }

  let sensorsClientId = '';
  let sensorsData: AnyRecord | null = null;
  let sensorsPayload: AnyRecord = {};
  let sensorValueText = '--';

  function formatBpm(val: unknown): string {
    if (val === null || val === undefined) return '0';
    const num = Number(val);
    if (!Number.isFinite(num)) return '0';
    return String(Math.round(num));
  }

  function computeSensorValue(portId: string, msg: AnyRecord | null, payload: AnyRecord): string {
    const fallbackNumber = formatValue(0);
    const fallbackBpm = formatBpm(0);
    if (!msg || typeof msg !== 'object') return portId === 'micBpm' ? fallbackBpm : fallbackNumber;
    const sensorType = typeof msg.sensorType === 'string' ? msg.sensorType : '';

    if (portId === 'accelX')
      return sensorType === 'accel' ? formatValue(payload.x) : fallbackNumber;
    if (portId === 'accelY')
      return sensorType === 'accel' ? formatValue(payload.y) : fallbackNumber;
    if (portId === 'accelZ')
      return sensorType === 'accel' ? formatValue(payload.z) : fallbackNumber;

    const isAngle = sensorType === 'gyro' || sensorType === 'orientation';
    if (portId === 'gyroA') return isAngle ? formatValue(payload.alpha) : fallbackNumber;
    if (portId === 'gyroB') return isAngle ? formatValue(payload.beta) : fallbackNumber;
    if (portId === 'gyroG') return isAngle ? formatValue(payload.gamma) : fallbackNumber;

    if (portId === 'micVol')
      return sensorType === 'mic' ? formatValue(payload.volume) : fallbackNumber;
    if (portId === 'micLow')
      return sensorType === 'mic' ? formatValue(payload.lowEnergy) : fallbackNumber;
    if (portId === 'micHigh')
      return sensorType === 'mic' ? formatValue(payload.highEnergy) : fallbackNumber;
    if (portId === 'micBpm') return sensorType === 'mic' ? formatBpm(payload.bpm) : fallbackBpm;

    return fallbackNumber;
  }

  $: if (data?.controlType === 'client-sensor-value') {
    const nodeId = String(data?.nodeId ?? '');
    const portId = String(data?.portId ?? '');
    const conn = ($graphStateStore.connections ?? []).find(
      (c: Connection) => c.targetNodeId === nodeId && c.targetPortId === 'client'
    );
    const srcNode = conn
      ? ($graphStateStore.nodes ?? []).find((n: NodeInstance) => n.id === conn.sourceNodeId)
      : null;
    sensorsClientId = srcNode?.config?.clientId ? String(srcNode.config.clientId) : '';
    sensorsData = sensorsClientId ? (($sensorData.get(sensorsClientId) as AnyRecord) ?? null) : null;
    const nextPayload =
      sensorsData && typeof sensorsData.payload === 'object'
        ? (sensorsData.payload as AnyRecord)
        : null;
    sensorsPayload = nextPayload ?? {};
    sensorValueText = computeSensorValue(portId, sensorsData, sensorsPayload);
  }

  let midiNodeId = '';
  let midiSource: MidiSource | null = null;
  let midiIsLearning = false;

  let fileInput: HTMLInputElement | null = null;
  let fileName = '';
  let fileDisplayLabel = '';
  let fileIsUploading = false;
  let fileUploadError: string | null = null;

  const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

  function openFilePicker() {
    if (data?.readonly) return;
    if (fileIsUploading) return;
    fileInput?.click?.();
  }

  function inferAssetKind(mimeType: string): 'audio' | 'image' | 'video' | 'model' | null {
    const t = mimeType.toLowerCase();
    if (t.startsWith('audio/')) return 'audio';
    if (t.startsWith('image/')) return 'image';
    if (t.startsWith('video/')) return 'video';
    if (t.startsWith('model/')) return 'model';
    return null;
  }

  function buildAssetUploadUrl(serverUrl: string): string | null {
    const trimmed = serverUrl.trim();
    if (!trimmed) return null;
    try {
      const base = trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
      return new URL('api/assets', base).toString();
    } catch {
      return null;
    }
  }

  async function uploadFileToAssetService(file: File): Promise<{ assetId: string } | null> {
    const serverUrl = (() => {
      try {
        return localStorage.getItem('shugu-server-url') ?? '';
      } catch {
        return '';
      }
    })();
    const uploadUrl = buildAssetUploadUrl(serverUrl);
    if (!uploadUrl) {
      fileUploadError = 'Invalid server URL (missing shugu-server-url)';
      return null;
    }

    const token = localStorage.getItem('shugu-asset-write-token') ?? '';
    if (!token) {
      fileUploadError = 'Missing Asset Write Token (shugu-asset-write-token)';
      return null;
    }

    const formData = new FormData();
    formData.set('file', file);
    formData.set('originalName', file.name);
    const kind = inferAssetKind(file.type);
    if (kind) formData.set('kind', kind);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      fileUploadError = text
        ? `Upload failed (${res.status}): ${text}`
        : `Upload failed (${res.status})`;
      return null;
    }

    const json = (await res.json().catch(() => null)) as AnyRecord;
    const assetId = String(json?.asset?.id ?? '');
    if (!assetId) {
      fileUploadError = 'Upload failed: invalid response (missing asset.id)';
      return null;
    }
    return { assetId };
  }

  async function handleFileChange(event: Event) {
    if (data?.readonly) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    fileName = file.name;
    fileIsUploading = true;
    fileUploadError = null;

    try {
      const uploaded = await uploadFileToAssetService(file);
      if (!uploaded) return;
      data?.setValue?.(`asset:${uploaded.assetId}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        fileUploadError = 'Upload timed out. Please retry.';
      } else {
        const message = err instanceof Error ? err.message : String(err);
        fileUploadError = `Upload failed: ${message}`;
      }
      console.warn('[file-picker] Upload failed', err);
    } finally {
      fileIsUploading = false;
    }
  }

  function formatMidiEvent(event: MidiEvent | null): string {
    if (!event) return '—';
    const channel = `ch${event.channel + 1}`;
    if (event.type === 'pitchbend')
      return `pitchbend • ${channel} • ${event.normalized.toFixed(3)}`;
    const num = event.number ?? 0;
    const suffix = event.type === 'note' ? (event.isPress ? 'on' : 'off') : `${event.rawValue}`;
    return `${event.type} ${num} • ${channel} • ${suffix}`;
  }

  $: if (data?.controlType === 'midi-learn') {
    midiNodeId = String(data?.nodeId ?? '');
    const node = ($graphStateStore.nodes ?? []).find(
      (n: NodeInstance) => String(n.id) === midiNodeId
    );
    midiSource = node?.config?.source ?? null;
    midiIsLearning = Boolean(
      $midiLearnModeStore.active && $midiLearnModeStore.nodeId === midiNodeId
    );
  }

  $: fileDisplayLabel =
    data?.controlType === 'file-picker'
      ? fileIsUploading
        ? 'Uploading…'
        : fileName || (typeof data?.value === 'string' && data.value ? 'Loaded' : 'No file')
      : '';

  function toggleMidiLearn(nodeId: string) {
    void midiService.init();
    if (midiIsLearning) {
      midiNodeBridge.cancelLearn();
    } else {
      midiNodeBridge.startLearn(nodeId);
    }
  }

  function clearMidiBinding(nodeId: string) {
    nodeEngine.updateNodeConfig(nodeId, { source: null });
  }

  onDestroy(() => {
    if (momentaryInputResetTimer) clearTimeout(momentaryInputResetTimer);
    if (momentaryBooleanResetTimer) clearTimeout(momentaryBooleanResetTimer);
  });
</script>

{#if data instanceof ClassicPreset.InputControl}
  <div class="control-field {isInline ? 'inline' : ''}">
    {#if showInputControlLabel}
      <div class="control-label">{inputControlLabel}</div>
    {/if}
    {#if isMomentaryButton}
      <button
        type="button"
        class="control-btn {isInline ? 'inline' : ''}"
        disabled={data.readonly}
        on:pointerdown|stopPropagation
        on:click|stopPropagation={pressMomentaryInput}
      >
        {momentaryButtonLabel}
      </button>
    {:else}
      <input
        class="control-input {isInline ? 'inline' : ''}"
        type={data.type}
        value={data.value}
        min={numberInputMin}
        max={numberInputMax}
        step={numberInputStep}
        readonly={data.readonly}
        disabled={data.readonly}
        on:pointerdown|stopPropagation
        on:input={changeInput}
        on:blur={normalizeNumberInput}
      />
    {/if}
  </div>
{:else if data?.controlType === 'select'}
  <div class="control-field {isInline ? 'inline' : ''}">
    {#if hasLabel}
      <div class="control-label">{data.label}</div>
    {/if}
    <select
      class="control-input {isInline ? 'inline' : ''}"
      value={data.value}
      disabled={data.readonly}
      on:pointerdown|stopPropagation
      on:change={changeSelect}
    >
      {#if data.placeholder}
        <option value="">{data.placeholder}</option>
      {/if}
      {#each data.options ?? [] as opt (opt.value)}
        <option value={opt.value}>{opt.label}</option>
      {/each}
    </select>
  </div>
{:else if data?.controlType === 'boolean'}
  {#if Boolean(data.button)}
    <div class="control-field {isInline ? 'inline' : ''}">
      <button
        type="button"
        class="control-btn {isInline ? 'inline' : ''}"
        disabled={data.readonly}
        on:pointerdown|stopPropagation
        on:click|stopPropagation={pressMomentaryBooleanInput}
      >
        {data.buttonLabel ?? data.label ?? 'Push'}
      </button>
    </div>
  {:else}
    <div class="control-field boolean-field {isInline ? 'inline' : ''}">
      <label class="toggle {isInline ? 'inline' : ''}" on:pointerdown|stopPropagation>
        <input
          type="checkbox"
          checked={Boolean(data.value)}
          disabled={data.readonly}
          on:change={changeBoolean}
        />
        <span class="toggle-track">
          <span class="toggle-thumb"></span>
        </span>
        {#if hasLabel}
          <span class="toggle-label">{data.label}</span>
        {/if}
      </label>
    </div>
  {/if}
{:else if data?.controlType === 'note'}
  <ReteNoteControl
    {data}
    {isInline}
    {hasLabel}
    {noteViewMode}
    {noteHtml}
    {setNoteViewMode}
    {changeNote}
  />
{:else if data?.controlType === 'curve'}
  {@const curveNodeId = data?.nodeId ?? ''}
  {@const curveNode = curveNodeId ? nodeEngine.getNode(curveNodeId) : null}
  {@const curveRunning = Boolean(curveNode?.outputValues?.running)}
  {@const curveOutput =
    typeof curveNode?.outputValues?.value === 'number' ? curveNode.outputValues.value : 0}
  {@const curveStart = typeof curveNode?.config?.start === 'number' ? curveNode.config.start : 0}
  {@const curveEnd = typeof curveNode?.config?.end === 'number' ? curveNode.config.end : 1}
  {@const curveProgress =
    curveRunning && curveEnd !== curveStart
      ? (curveOutput - curveStart) / (curveEnd - curveStart)
      : 0}
  <div class="control-field curve-field {isInline ? 'inline' : ''}" on:pointerdown|stopPropagation>
    {#if hasLabel}
      <div class="control-label">{data.label}</div>
    {/if}
    <CurveEditor
      value={data.value}
      readonly={Boolean(data.readonly)}
      progress={curveProgress}
      on:change={(e) => {
        if (data?.setValue) {
          data.value = e.detail;
          data.setValue(e.detail);
        }
      }}
    />
  </div>
{:else if data?.controlType === 'time-range'}
  <ReteTimeRangeControl {data} {isInline} {hasLabel} />
{:else if data?.controlType === 'file-picker'}
  <ReteFileControl
    {data}
    {isInline}
    {hasLabel}
    bind:fileInput
    {fileDisplayLabel}
    {fileIsUploading}
    {fileUploadError}
    {openFilePicker}
    {handleFileChange}
  />
{:else if data?.controlType === 'client-picker'}
  <ReteClientPickerControl
    {data}
    {hasLabel}
    audienceClients={$audienceClients ?? []}
    {clientPickerInputLocked}
    {clientPickerView}
    {clientLabel}
    {readinessClass}
    {pickClient}
  />
{:else if data?.controlType === 'asset-picker'}
  <div class="control-field {isInline ? 'inline' : ''}">
    {#if hasLabel}
      <div class="control-label">{data.label}</div>
    {/if}
    <select
      class="control-input {isInline ? 'inline' : ''}"
      value={data.value}
      disabled={data.readonly}
      on:pointerdown|stopPropagation
      on:change={changeSelect}
    >
      <option value="">(select asset)</option>
      {#each buildAssetOptions(data.assetKind) as opt (opt.value)}
        <option value={opt.value}>{opt.label}</option>
      {/each}
    </select>
  </div>
{:else if data?.controlType === 'local-asset-picker'}
  <ReteLocalAssetControl {data} {isInline} {hasLabel} />
{:else if data?.controlType === 'client-sensor-value'}
  <div class="sensor-inline-value">{sensorValueText}</div>
{:else if data?.controlType === 'midi-learn'}
  <ReteMidiLearnControl
    {data}
    {hasLabel}
    {midiNodeId}
    {midiSource}
    {midiIsLearning}
    midiSupported={$midiSupportedStore}
    midiSelectedInput={$midiSelectedInputStore}
    midiLastMessage={$midiLastMessageStore}
    {toggleMidiLearn}
    {clearMidiBinding}
    {formatMidiEvent}
  />
{:else}
  <div class="control-unknown">Unsupported control</div>
{/if}

<style>
  .control-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 10px;
  }

  .control-field.inline {
    flex-direction: row;
    align-items: center;
    justify-content: flex-end;
    gap: 0;
    padding: 0;
  }

  .control-label {
    font-size: 11px;
    letter-spacing: 0.2px;
    color: rgba(255, 255, 255, 0.72);
  }

  .control-input {
    width: 100%;
    box-sizing: border-box;
    border-radius: 10px;
    padding: 6px 10px;
    background: rgba(2, 6, 23, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.92);
    outline: none;
    font-size: 12px;
  }

  .control-btn {
    width: 100%;
    box-sizing: border-box;
    border-radius: 10px;
    padding: 6px 10px;
    background: rgba(2, 6, 23, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.92);
    outline: none;
    font-size: 12px;
    cursor: pointer;
  }

  .control-btn.inline {
    width: 110px;
    padding: 5px 8px;
  }

  .control-btn:hover:not(:disabled) {
    border-color: rgba(99, 102, 241, 0.35);
    background: rgba(2, 6, 23, 0.45);
  }

  .control-btn:disabled {
    background: rgba(2, 6, 23, 0.22);
    border-color: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.58);
    cursor: not-allowed;
  }

  select.control-input {
    appearance: auto;
    -webkit-appearance: menulist;
  }

  .control-input.inline {
    width: 110px;
    padding: 5px 8px;
  }

  .control-input:focus {
    border-color: rgba(99, 102, 241, 0.7);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.18);
  }

  .control-input:disabled,
  .control-input[readonly] {
    background: rgba(2, 6, 23, 0.22);
    border-color: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.58);
    cursor: not-allowed;
  }

  .control-input:disabled:focus,
  .control-input[readonly]:focus {
    border-color: rgba(255, 255, 255, 0.12);
    box-shadow: none;
  }

  .boolean-field {
    padding-top: 8px;
    padding-bottom: 8px;
  }

  .boolean-field.inline {
    padding-top: 0;
    padding-bottom: 0;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    user-select: none;
  }

  .toggle.inline {
    gap: 0;
  }

  .toggle input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .toggle-track {
    width: 34px;
    height: 18px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.08);
    display: inline-flex;
    align-items: center;
    padding: 2px;
    box-sizing: border-box;
    transition:
      background 120ms ease,
      border-color 120ms ease;
  }

  .toggle-thumb {
    width: 14px;
    height: 14px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.78);
    transform: translateX(0);
    transition:
      transform 120ms ease,
      background 120ms ease;
  }

  .toggle input:checked + .toggle-track {
    background: rgba(99, 102, 241, 0.35);
    border-color: rgba(99, 102, 241, 0.55);
  }

  .toggle input:checked + .toggle-track .toggle-thumb {
    transform: translateX(16px);
    background: rgba(255, 255, 255, 0.9);
  }

  .toggle input:disabled + .toggle-track {
    opacity: 0.45;
  }

  .toggle input:disabled ~ .toggle-label {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .toggle-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.84);
  }

  .control-unknown {
    padding: 10px 12px;
    color: rgba(255, 255, 255, 0.65);
    font-size: 12px;
  }

  .sensor-inline-value {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    color: rgba(99, 102, 241, 0.95);
    text-align: right;
    min-width: 56px;
    white-space: nowrap;
  }

</style>
