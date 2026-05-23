<!-- Purpose: Render Rete controls (inputs/selects/MIDI learn) for the node canvas. -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { ClassicPreset } from 'rete';
  import {
    audienceClients,
    clientReadiness,
    displayClients,
    sensorData,
  } from '$lib/stores/manager';
  import { assetsStore } from '$lib/stores/assets';
  import { nodeEngine, nodeRegistry } from '$lib/nodes';
  import { midiService } from '$lib/features/midi/midi-service';
  import { midiNodeBridge, type MidiSource } from '$lib/features/midi/midi-node-bridge';
  import type { Connection, NodeInstance } from '$lib/nodes/types';
  import { renderMarkdownToHtml } from '../utils/markdown';
  import {
    buildAssetOptions,
    buildAssetUploadUrl,
    buildClientPickerView,
    clampNumberToBounds,
    clientLabel,
    computeSensorValue,
    formatMidiEvent,
    inferAssetKind,
    readinessClass as resolveReadinessClass,
    resolveNumberBounds,
    type AnyRecord,
  } from './rete-control-helpers';
  import CurveEditor from '../ui/CurveEditor.svelte';
  import ReteClientPickerControl from './ReteClientPickerControl.svelte';
  import ReteFileControl from './ReteFileControl.svelte';
  import ReteLocalAssetControl from './ReteLocalAssetControl.svelte';
  import ReteMidiLearnControl from './ReteMidiLearnControl.svelte';
  import ReteNoteControl from './ReteNoteControl.svelte';
  import ReteTimeRangeControl from './ReteTimeRangeControl.svelte';

  type ControlOption = { value: string; label: string };
  type ControlData = AnyRecord & {
    assetKind?: string;
    button?: boolean;
    buttonLabel?: string;
    controlType?: string;
    inline?: boolean;
    label?: string;
    nodeId?: string;
    nodeType?: string;
    options?: ControlOption[];
    placeholder?: string;
    readonly?: boolean;
    setValue?: (value: unknown) => void;
    value?: unknown;
  };

  export let data: ControlData;
  $: isInline = Boolean((data as AnyRecord)?.inline);
  $: inputControlLabel =
    data instanceof ClassicPreset.InputControl ? (data as AnyRecord).controlLabel : undefined;

  $: numberBounds =
    data instanceof ClassicPreset.InputControl && data.type === 'number'
      ? resolveNumberBounds(data, nodeRegistry)
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

  const setControlValue = (value: unknown): void => {
    data.setValue?.(value);
  };

  const asControlOptions = (value: unknown): ControlOption[] =>
    Array.isArray(value)
      ? value.map((opt) => ({
          value: String((opt as AnyRecord)?.value ?? ''),
          label: String((opt as AnyRecord)?.label ?? (opt as AnyRecord)?.value ?? ''),
        }))
      : [];

  const asCurveValue = (value: unknown): [number, number, number, number] | undefined =>
    Array.isArray(value) && value.length === 4 && value.every((v) => typeof v === 'number')
      ? (value as [number, number, number, number])
      : undefined;

  const inputControlType = (value: unknown): 'text' | 'number' =>
    value === 'number' ? 'number' : 'text';
  const inputControlValue = (value: unknown): string | number =>
    typeof value === 'string' || typeof value === 'number' ? value : value == null ? '' : String(value);
  const inputAttrValue = (value: unknown): string | number | null | undefined =>
    typeof value === 'string' || typeof value === 'number' || value == null ? value : String(value);
  const recordValue = (value: unknown): AnyRecord =>
    value && typeof value === 'object' ? (value as AnyRecord) : {};

  function changeInput(event: Event) {
    if (!(data instanceof ClassicPreset.InputControl)) return;
    const target = event.target as HTMLInputElement;
    if (data.type === 'number') {
      const num = Number(target.value);
      let next = Number.isFinite(num) ? num : 0;
      next = clampNumberToBounds(next, numberBounds);
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
    next = clampNumberToBounds(next, numberBounds);

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
    setControlValue(true);
    // Keep the trigger high long enough for at least one graph tick to observe it.
    momentaryBooleanResetTimer = setTimeout(() => {
      momentaryBooleanResetTimer = null;
      setControlValue(false);
    }, 120);
  }

  function changeSelect(event: Event) {
    const target = event.target as HTMLSelectElement;
    setControlValue(target.value);
  }

  function changeBoolean(event: Event) {
    const target = event.target as HTMLInputElement;
    setControlValue(Boolean(target.checked));
  }

  function changeNote(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    const next = target.value;
    setControlValue(next);
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
    setControlValue(clientId);
  }

  let didRefreshAssets = false;
  $: if (data?.controlType === 'asset-picker' && !didRefreshAssets) {
    didRefreshAssets = true;
    void assetsStore.refresh();
  }
  $: assetPickerOptions =
    data?.controlType === 'asset-picker'
      ? buildAssetOptions(($assetsStore?.assets ?? []) as AnyRecord[], String(data.assetKind ?? ''))
      : [];

  function readinessClass(clientId: string, connected?: boolean): string {
    return resolveReadinessClass($clientReadiness as Map<string, AnyRecord>, clientId, connected);
  }

  $: hasLabel = Boolean(data?.label) && !isInline;
  $: showInputControlLabel = Boolean(inputControlLabel) && !isInline;

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
    const pickerClients =
      data?.nodeType === 'display-object'
        ? (($displayClients ?? []) as unknown as AnyRecord[])
        : (($audienceClients ?? []) as unknown as AnyRecord[]);

    return buildClientPickerView({
      data,
      graphState: $graphStateStore,
      audienceClients: pickerClients,
      getNode: (nodeId) => nodeEngine.getNode(nodeId),
      getLastComputedInputs: (nodeId) => nodeEngine.getLastComputedInputs(nodeId),
    });
  })();

  let sensorsClientId = '';
  let sensorsData: AnyRecord | null = null;
  let sensorsPayload: AnyRecord = {};
  let sensorValueText = '--';

  $: if (data?.controlType === 'client-sensor-value') {
    const nodeId = String(data?.nodeId ?? '');
    const portId = String(data?.portId ?? '');
    const conn = ($graphStateStore.connections ?? []).find(
      (c: Connection) => c.targetNodeId === nodeId && c.targetPortId === 'client'
    );
    const srcNode = conn
      ? ($graphStateStore.nodes ?? []).find((n: NodeInstance) => n.id === conn.sourceNodeId)
      : null;
    const outputClient = srcNode?.outputValues?.client as AnyRecord | undefined;
    sensorsClientId =
      typeof outputClient?.clientId === 'string'
        ? String(outputClient.clientId)
        : srcNode?.config?.clientId
          ? String(srcNode.config.clientId)
          : '';
    sensorsData = sensorsClientId
      ? (($sensorData.get(sensorsClientId) as unknown as AnyRecord) ?? null)
      : null;
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

  function openFilePicker() {
    if (data?.readonly) return;
    if (fileIsUploading) return;
    fileInput?.click?.();
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
    const assetId = String(recordValue(json?.asset).id ?? '');
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
      setControlValue(`asset:${uploaded.assetId}`);
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

  $: if (data?.controlType === 'midi-learn') {
    midiNodeId = String(data?.nodeId ?? '');
    const node = ($graphStateStore.nodes ?? []).find(
      (n: NodeInstance) => String(n.id) === midiNodeId
    );
    midiSource = (node?.config?.source as MidiSource | null | undefined) ?? null;
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
        type={inputControlType(data.type)}
        value={inputControlValue(data.value)}
        min={inputAttrValue(numberInputMin)}
        max={inputAttrValue(numberInputMax)}
        step={inputAttrValue(numberInputStep)}
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
      {#each asControlOptions(data.options) as opt (opt.value)}
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
      value={asCurveValue(data.value)}
      readonly={Boolean(data.readonly)}
      progress={curveProgress}
      on:change={(e) => {
        if (data.setValue) {
          data.value = e.detail;
          setControlValue(e.detail);
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
  {@const pickerClients =
    data?.nodeType === 'display-object' ? ($displayClients ?? []) : ($audienceClients ?? [])}
  <ReteClientPickerControl
    {data}
    {hasLabel}
    audienceClients={pickerClients}
    emptyLabel={data?.nodeType === 'display-object'
      ? 'No displays connected'
      : 'No clients connected'}
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
      {#each assetPickerOptions as opt (opt.value)}
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
