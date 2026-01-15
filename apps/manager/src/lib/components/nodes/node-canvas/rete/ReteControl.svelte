<!-- Purpose: Render Rete controls (inputs/selects/MIDI learn) for the node canvas. -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { ClassicPreset } from 'rete';
  import {
    audienceClients,
    clientReadiness,
    nodeMediaSignals,
    sensorData,
  } from '$lib/stores/manager';
  import { assetsStore } from '$lib/stores/assets';
  import { localMediaStore, type LocalMediaKind } from '$lib/stores/local-media';
  import { displayBridgeState } from '$lib/display/display-bridge';
  import {
    buildDisplayFileRef,
    isDisplayFileRef,
    localDisplayMediaStore,
    parseDisplayFileId,
  } from '$lib/stores/local-display-media';
  import { nodeEngine, nodeRegistry } from '$lib/nodes';
  import type { ClientInfo } from '@shugu/protocol';
  import { midiService, type MidiEvent } from '$lib/features/midi/midi-service';
  import { midiNodeBridge, formatMidiSource, type MidiSource } from '$lib/features/midi/midi-node-bridge';
  import type { Connection, NodeInstance } from '$lib/nodes/types';
  import {
    getAudioSpectrogramDataUrl,
    getMediaDurationSec,
  } from '$lib/features/assets/media-timeline-preview';
  import { renderMarkdownToHtml } from '../utils/markdown';
  import CurveEditor from '../ui/CurveEditor.svelte';

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
  const isRunningStore = nodeEngine.isRunning;
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

  let didRefreshLocalMedia = false;

  let isLocalDisplayConnected = false;
  $: isLocalDisplayConnected = $displayBridgeState?.status === 'connected';

  function buildAssetOptions(kind: string): { value: string; label: string }[] {
    const list = ($assetsStore?.assets ?? []) as AnyRecord[];
    const k = kind && typeof kind === 'string' ? kind : 'any';
    const filtered = k === 'any' ? list : list.filter((a) => String(a?.kind ?? '') === k);
    return filtered.map((a) => ({
      value: String(a?.id ?? ''),
      label: `${String(a?.originalName ?? a?.id ?? '')}`,
    }));
  }

  function buildLocalMediaOptions(kind: string): { value: string; label: string }[] {
    const list = ($localMediaStore?.files ?? []) as AnyRecord[];
    const k = kind && typeof kind === 'string' ? kind : 'any';
    const filtered = k === 'any' ? list : list.filter((f) => String(f?.kind ?? '') === k);
    return filtered.map((f) => ({
      value: String(f?.path ?? ''),
      label: String(f?.label ?? f?.path ?? ''),
    }));
  }

  function inferLocalKindFromPath(filePath: string): LocalMediaKind | null {
    const lower = filePath.toLowerCase();
    if (/\.(mp3|wav|ogg|m4a|aac|flac|aif|aiff|opus)$/.test(lower)) return 'audio';
    if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lower)) return 'image';
    if (/\.(mp4|webm|mov|m4v)$/.test(lower)) return 'video';
    return null;
  }

  const localAssetKindFromControl = (
    kindRaw: unknown,
    fallbackPath: string
  ): LocalMediaKind | null => {
    const normalized = typeof kindRaw === 'string' ? kindRaw.trim().toLowerCase() : '';
    if (normalized === 'audio' || normalized === 'image' || normalized === 'video')
      return normalized;
    return inferLocalKindFromPath(fallbackPath);
  };

  let localAssetDraft = '';
  let localAssetDraftDirty = false;
  let localAssetError: string | null = null;
  let localAssetValidating = false;
  let localAssetPickerKind: LocalMediaKind | null = null;
  let localAssetSource: 'display' | 'server' = 'display';
  let localAssetSourceInitialized = false;
  let localAssetSourcePinned = false;
  let displayLocalError: string | null = null;
  let displayLocalFileInput: HTMLInputElement | null = null;
  let lastServerLocalAssetPath = '';
  let lastDisplayFileRef = '';

  $: if (data?.controlType === 'local-asset-picker') {
    const current = typeof data?.value === 'string' ? String(data.value) : '';
    const currentTrimmed = current.trim();
    localAssetPickerKind = localAssetKindFromControl((data as AnyRecord)?.assetKind, '') ?? null;

    if (isDisplayFileRef(currentTrimmed)) lastDisplayFileRef = currentTrimmed;
    else if (currentTrimmed) lastServerLocalAssetPath = currentTrimmed;

    if (!localAssetSourceInitialized) {
      if (isDisplayFileRef(currentTrimmed)) localAssetSource = 'display';
      else if (currentTrimmed) localAssetSource = 'server';
      else localAssetSource = isLocalDisplayConnected ? 'display' : 'server';
      localAssetSourceInitialized = true;
    } else if (!localAssetSourcePinned) {
      // If a project loads a non-empty value, keep the UI source in sync.
      if (isDisplayFileRef(currentTrimmed) && localAssetSource !== 'display') {
        localAssetSource = 'display';
      } else if (
        currentTrimmed &&
        !isDisplayFileRef(currentTrimmed) &&
        localAssetSource !== 'server'
      ) {
        localAssetSource = 'server';
      }
    }

    // Server-local draft input only applies when the current value is a filesystem path.
    if (!localAssetDraftDirty)
      localAssetDraft = isDisplayFileRef(currentTrimmed) ? '' : currentTrimmed;
  }

  $: if (data?.controlType === 'local-asset-picker' && localAssetSourceInitialized) {
    if (localAssetSource === 'server') {
      if (!didRefreshLocalMedia) {
        didRefreshLocalMedia = true;
        void localMediaStore.refresh();
      }
    } else {
      didRefreshLocalMedia = false;
    }
  } else {
    didRefreshLocalMedia = false;
  }

  function buildDisplayLocalMediaOptions(kind: string): { value: string; label: string }[] {
    const list = ($localDisplayMediaStore?.files ?? []) as AnyRecord[];
    const k = kind && typeof kind === 'string' ? kind : 'any';
    const filtered = k === 'any' ? list : list.filter((f) => String(f?.kind ?? '') === k);
    return filtered.map((f) => {
      const id = String(f?.id ?? '');
      const name = String(f?.name ?? id);
      const sizeBytes = typeof f?.sizeBytes === 'number' ? f.sizeBytes : 0;
      const sizeMb = sizeBytes > 0 ? Math.round((sizeBytes / (1024 * 1024)) * 100) / 100 : 0;
      const sizeLabel = sizeMb > 0 ? ` (${sizeMb} MB)` : '';
      return {
        value: buildDisplayFileRef(id),
        label: `${name}${sizeLabel}`,
      };
    });
  }

  function acceptForLocalKind(kind: LocalMediaKind | null): string {
    if (kind === 'audio') return 'audio/*';
    if (kind === 'image') return 'image/*';
    if (kind === 'video') return 'video/*';
    return '';
  }

  const switchLocalAssetSource = (next: 'display' | 'server') => {
    if (data?.readonly) return;
    localAssetSource = next;
    localAssetSourcePinned = true;
    displayLocalError = null;
    localAssetError = null;

    const current = typeof data?.value === 'string' ? String(data.value).trim() : '';
    if (isDisplayFileRef(current)) lastDisplayFileRef = current;
    else if (current) lastServerLocalAssetPath = current;

    if (next === 'display') {
      localAssetDraftDirty = false;
      localAssetDraft = lastServerLocalAssetPath;
      if (!isDisplayFileRef(current)) {
        // Switching to Display-local mode: stop using server-local paths and restore the last picked file (if any).
        data?.setValue?.(lastDisplayFileRef || '');
      }
      return;
    }

    // Switching to Server-local mode: restore the last server-local path (if any).
    localAssetDraftDirty = false;
    localAssetDraft = lastServerLocalAssetPath;
    if (isDisplayFileRef(current) || !current) {
      data?.setValue?.(lastServerLocalAssetPath || '');
    }
  };

  const openDisplayLocalFilePicker = () => {
    if (data?.readonly) return;
    displayLocalError = null;
    displayLocalFileInput?.click();
  };

  const changeDisplayLocalSelect = (event: Event) => {
    const target = event.target as HTMLSelectElement;
    const next = target.value;
    displayLocalError = null;
    localAssetError = null;
    localAssetDraftDirty = false;
    localAssetDraft = '';
    localAssetSource = 'display';
    localAssetSourcePinned = true;
    data?.setValue?.(next);
  };

  const onDisplayLocalFileChange = (event: Event) => {
    if (data?.readonly) return;
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0] ?? null;
    target.value = '';
    if (!file) return;

    const fallbackKind = inferLocalKindFromPath(file.name);
    const kind = localAssetKindFromControl((data as AnyRecord)?.assetKind, file.name) ?? fallbackKind;
    if (!kind) {
      displayLocalError = 'Unsupported file type for this node.';
      return;
    }

    const entry = localDisplayMediaStore.registerFile(file, kind);
    displayLocalError = null;
    localAssetError = null;
    localAssetDraftDirty = false;
    localAssetDraft = '';
    localAssetSource = 'display';
    localAssetSourcePinned = true;
    data?.setValue?.(buildDisplayFileRef(entry.id));
  };

  const changeLocalAssetSelect = (event: Event) => {
    const target = event.target as HTMLSelectElement;
    const next = target.value;
    localAssetDraftDirty = false;
    localAssetDraft = next;
    localAssetError = null;
    localAssetSource = 'server';
    localAssetSourcePinned = true;
    data?.setValue?.(next);
  };

  const onLocalAssetDraftInput = (event: Event) => {
    const target = event.target as HTMLInputElement;
    localAssetDraftDirty = true;
    localAssetDraft = target.value;
    localAssetError = null;
  };

  const validateLocalAssetDraft = async () => {
    if (data?.readonly) return;
    const draft = localAssetDraft.trim();
    if (!draft) {
      localAssetDraftDirty = false;
      localAssetError = null;
      localAssetSourcePinned = true;
      localAssetSource = 'server';
      data?.setValue?.('');
      return;
    }

    const kind = localAssetKindFromControl((data as AnyRecord)?.assetKind, draft);
    if (!kind) {
      localAssetError = 'Unsupported file type for this node.';
      return;
    }

    localAssetValidating = true;
    localAssetError = null;
    try {
      const validated = await localMediaStore.validatePath(draft, kind);
      if (!validated?.path) throw new Error('Invalid path');
      localAssetDraftDirty = false;
      localAssetDraft = validated.path;
      localAssetSourcePinned = true;
      localAssetSource = 'server';
      data?.setValue?.(validated.path);
    } catch (err) {
      localAssetError = err instanceof Error ? err.message : String(err);
    } finally {
      localAssetValidating = false;
    }
  };

  const onLocalAssetDraftKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void validateLocalAssetDraft();
  };

  const onLocalAssetDraftBlur = () => {
    void validateLocalAssetDraft();
  };

  function displayLocalSelectedName(value: unknown): string {
    const raw = typeof value === 'string' ? value.trim() : '';
    const id = parseDisplayFileId(raw);
    if (!id) return '';
    const entry = localDisplayMediaStore.getFileById(id);
    return entry ? entry.name : '';
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

  function inferAssetKind(mimeType: string): 'audio' | 'image' | 'video' | null {
    const t = mimeType.toLowerCase();
    if (t.startsWith('audio/')) return 'audio';
    if (t.startsWith('image/')) return 'image';
    if (t.startsWith('video/')) return 'video';
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

  // ===== time-range control (dual cursor timeline) =====
  let didRefreshAssetsForTimeRange = false;
  $: if (data?.controlType === 'time-range' && !didRefreshAssetsForTimeRange) {
    didRefreshAssetsForTimeRange = true;
    void assetsStore.refresh();
  }

  let timeRangeNodeId = '';
  let timeRangeNodeType = '';
  let timeRangeStartSec = 0;
  let timeRangeEndSec = -1; // -1 means "to end"
  let timeRangeCursorSec = -1; // -1 means "unset"
  let timeRangeMin = 0;
  let timeRangeMax = 10;
  let timeRangeStep = 0.01;
  let timeRangeDurationSec: number | null = null;
  let timeRangeBackdropUrl: string | null = null;
  let timeRangeSliderStart = 0;
  let timeRangeSliderEnd = 0;
  let timeRangeSliderCursor = 0;
  let timeRangeStartFrac = 0;
  let timeRangeEndFrac = 1;
  let timeRangeCursorFrac = 0;
  let timeRangeEffectiveEndSec: number | null = null;

  const secondsFormatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    useGrouping: false,
  });

  const formatSeconds = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '—';
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    const rounded = Math.round(num * 100) / 100;
    return secondsFormatter.format(rounded);
  };

  const buildAssetContentUrl = (serverUrl: string, assetId: string): string | null => {
    const trimmed = serverUrl.trim();
    const id = assetId.trim();
    if (!trimmed || !id) return null;
    try {
      const base = trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
      return new URL(`api/assets/${encodeURIComponent(id)}/content`, base).toString();
    } catch {
      return null;
    }
  };

  const buildLocalMediaContentUrl = (
    serverUrl: string,
    filePath: string,
    kind: LocalMediaKind
  ): string | null => {
    const trimmed = serverUrl.trim();
    const p = filePath.trim();
    if (!trimmed || !p) return null;
    try {
      const base = trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
      const url = new URL('api/local-media/content', base);
      url.searchParams.set('path', p);
      url.searchParams.set('kind', kind);
      const token = localStorage.getItem('shugu-asset-read-token') ?? '';
      if (token.trim()) url.searchParams.set('token', token.trim());
      return url.toString();
    } catch {
      return null;
    }
  };

  const resolveConnectedNumber = (nodeId: string, portId: string): number | null => {
    const conn = ($graphStateStore.connections ?? []).find(
      (c: Connection) => String(c.targetNodeId) === nodeId && String(c.targetPortId) === portId
    );
    if (!conn) return null;
    const src = nodeEngine.getNode(String(conn.sourceNodeId));
    const raw = src?.outputValues?.[String(conn.sourcePortId)];
    const num = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(num) ? num : null;
  };

  const isInputConnected = (nodeId: string, portId: string): boolean =>
    ($graphStateStore.connections ?? []).some(
      (c: Connection) => String(c.targetNodeId) === nodeId && String(c.targetPortId) === portId
    );

  const readLocalNumber = (node: NodeInstance | undefined, key: string): number | null => {
    const raw = node?.inputValues?.[key];
    const num = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(num) ? num : null;
  };

  const resolveConnectedBoolean = (nodeId: string, portId: string): boolean | null => {
    const conn = ($graphStateStore.connections ?? []).find(
      (c: Connection) => String(c.targetNodeId) === nodeId && String(c.targetPortId) === portId
    );
    if (!conn) return null;
    const src = nodeEngine.getNode(String(conn.sourceNodeId));
    const raw = src?.outputValues?.[String(conn.sourcePortId)];
    if (typeof raw === 'boolean') return raw;
    const num = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(num) ? num >= 0.5 : null;
  };

  const computeEffectiveRange = (
    nodeId: string
  ): { startSec: number; endSec: number; cursorSec: number } => {
    const node = nodeEngine.getNode(nodeId);
    const startRaw =
      resolveConnectedNumber(nodeId, 'startSec') ?? readLocalNumber(node, 'startSec') ?? 0;
    const endRaw =
      resolveConnectedNumber(nodeId, 'endSec') ?? readLocalNumber(node, 'endSec') ?? -1;
    const cursorRaw =
      resolveConnectedNumber(nodeId, 'cursorSec') ?? readLocalNumber(node, 'cursorSec') ?? -1;

    const startSec = Math.max(0, startRaw);
    const endSec = endRaw >= 0 ? Math.max(startSec, endRaw) : -1;
    const cursorSec = cursorRaw >= 0 ? Math.max(0, cursorRaw) : -1;
    return { startSec, endSec, cursorSec };
  };

  let timeRangeIsPlaying = false;
  let timeRangeLoopEnabled = false;
  let timeRangeReverseEnabled = false;
  let timeRangePlaybackRaf: number | null = null;
  let timeRangePlaybackCursorSec = 0;
  let timeRangePlaybackLastMs = 0;
  // For media nodes, the UI playhead should only advance after we receive a client "started" signal.
  let timeRangeLastPlayRequested: boolean | null = null;
  let timeRangeStartSeqBase: number | null = null;
  let timeRangeSignalNodeId = '';
  let timeRangePlayheadLastReportMs = 0;
  let timeRangeLastReportedCursorSec: number | null = null;

  const TIME_RANGE_PLAYHEAD_REPORT_INTERVAL_MS = 250;

  const reportTimeRangePlayhead = (cursorSec: number, nowMs: number) => {
    if (!timeRangeNodeId) return;
    if (
      timeRangeNodeType !== 'load-audio-from-assets' &&
      timeRangeNodeType !== 'load-video-from-assets' &&
      timeRangeNodeType !== 'load-audio-from-local' &&
      timeRangeNodeType !== 'load-video-from-local'
    ) {
      return;
    }
    if (!Number.isFinite(cursorSec) || cursorSec < 0) return;
    if (nowMs - timeRangePlayheadLastReportMs < TIME_RANGE_PLAYHEAD_REPORT_INTERVAL_MS) return;
    timeRangePlayheadLastReportMs = nowMs;

    // Round to avoid noisy updates while still keeping patch retargets in sync.
    const rounded = Math.round(cursorSec * 1000) / 1000;
    if (
      timeRangeLastReportedCursorSec !== null &&
      Math.abs(rounded - timeRangeLastReportedCursorSec) < 0.001
    ) {
      return;
    }
    timeRangeLastReportedCursorSec = rounded;
    nodeEngine.setTimeRangePlayheadSec(timeRangeNodeId, rounded);
  };

  const clearTimeRangePlayhead = () => {
    if (timeRangeNodeId) nodeEngine.setTimeRangePlayheadSec(timeRangeNodeId, null);
    timeRangePlayheadLastReportMs = 0;
    timeRangeLastReportedCursorSec = null;
  };

  const syncTimeRangeUi = (values: { startSec: number; endSec: number; cursorSec: number }) => {
    timeRangeStartSec = values.startSec;
    timeRangeEndSec = values.endSec;
    timeRangeCursorSec = values.cursorSec;

    const maxFromAsset = timeRangeDurationSec;
    const maxFromField = isFiniteNumber((data as AnyRecord).max) ? Number((data as AnyRecord).max) : null;
    const maxFallback = Math.max(
      10,
      timeRangeStartSec,
      timeRangeEndSec > 0 ? timeRangeEndSec : 0,
      timeRangeCursorSec > 0 ? timeRangeCursorSec : 0
    );
    timeRangeMax = Math.max(
      timeRangeMin + timeRangeStep,
      maxFromAsset ?? maxFromField ?? maxFallback
    );

    const clamp = (v: number) => Math.max(timeRangeMin, Math.min(timeRangeMax, v));
    timeRangeSliderStart = clamp(timeRangeStartSec);
    timeRangeEffectiveEndSec =
      timeRangeEndSec < 0 ? (timeRangeDurationSec ?? null) : timeRangeEndSec;
    timeRangeSliderEnd = timeRangeEndSec < 0 ? timeRangeMax : clamp(timeRangeEndSec);
    if (timeRangeSliderEnd < timeRangeSliderStart) timeRangeSliderEnd = timeRangeSliderStart;

    const cursorFallback = timeRangeCursorSec >= 0 ? timeRangeCursorSec : timeRangeStartSec;
    const nextCursor = clamp(cursorFallback);
    if (!timeRangeIsPlaying) {
      timeRangeSliderCursor = nextCursor;
      timeRangePlaybackCursorSec = nextCursor;
    }
    if (timeRangeSliderCursor < timeRangeSliderStart) timeRangeSliderCursor = timeRangeSliderStart;
    if (timeRangeSliderCursor > timeRangeSliderEnd) timeRangeSliderCursor = timeRangeSliderEnd;

    const span = timeRangeMax - timeRangeMin;
    timeRangeStartFrac = span > 0 ? (timeRangeSliderStart - timeRangeMin) / span : 0;
    timeRangeEndFrac = span > 0 ? (timeRangeSliderEnd - timeRangeMin) / span : 1;
    timeRangeCursorFrac = span > 0 ? (timeRangeSliderCursor - timeRangeMin) / span : 0;

  };

  function stopTimeRangePlayback(): void {
    if (timeRangePlaybackRaf !== null) {
      cancelAnimationFrame(timeRangePlaybackRaf);
      timeRangePlaybackRaf = null;
    }
    timeRangePlaybackLastMs = 0;
    clearTimeRangePlayhead();
  }

  function startTimeRangePlayback(): void {
    stopTimeRangePlayback();
    timeRangePlaybackCursorSec = timeRangeCursorSec >= 0 ? timeRangeCursorSec : timeRangeStartSec;
    timeRangePlaybackLastMs = performance.now();
    reportTimeRangePlayhead(timeRangePlaybackCursorSec, timeRangePlaybackLastMs);

    const frame = (nowMs: number) => {
      const dt = Math.max(0, nowMs - timeRangePlaybackLastMs);
      timeRangePlaybackLastMs = nowMs;

      const start = timeRangeStartSec;
      const endRaw =
        timeRangeEndSec < 0 ? (timeRangeEffectiveEndSec ?? timeRangeMax) : timeRangeEndSec;
      const end = Math.max(start, endRaw);
      const span = Math.max(0.0001, end - start);

      const dir = timeRangeReverseEnabled ? -1 : 1;
      timeRangePlaybackCursorSec += (dir * dt) / 1000;

      if (!timeRangeLoopEnabled) {
        timeRangePlaybackCursorSec = Math.max(start, Math.min(end, timeRangePlaybackCursorSec));
      } else {
        while (timeRangePlaybackCursorSec > end) timeRangePlaybackCursorSec -= span;
        while (timeRangePlaybackCursorSec < start) timeRangePlaybackCursorSec += span;
      }

      // UI-only playhead: do not write back to node inputs (avoid spamming overrides).
      timeRangeSliderCursor = Math.max(
        timeRangeSliderStart,
        Math.min(timeRangeSliderEnd, timeRangePlaybackCursorSec)
      );
      const fullSpan = timeRangeMax - timeRangeMin;
      timeRangeCursorFrac = fullSpan > 0 ? (timeRangeSliderCursor - timeRangeMin) / fullSpan : 0;
      reportTimeRangePlayhead(timeRangeSliderCursor, nowMs);

      if (timeRangeIsPlaying) {
        timeRangePlaybackRaf = requestAnimationFrame(frame);
      } else {
        stopTimeRangePlayback();
      }
    };

    timeRangePlaybackRaf = requestAnimationFrame(frame);
  }

  let lastTimelineAssetId = '';
  let lastTimelineUrl = '';
  let lastTimelineDisplayFileId: string | null = null;
  let lastTimelineDisplayFileUrl: string | null = null;

  onDestroy(() => {
    stopTimeRangePlayback();
    if (momentaryInputResetTimer) clearTimeout(momentaryInputResetTimer);
    if (momentaryBooleanResetTimer) clearTimeout(momentaryBooleanResetTimer);
    if (lastTimelineDisplayFileUrl) {
      try {
        URL.revokeObjectURL(lastTimelineDisplayFileUrl);
      } catch {
        // ignore
      }
      lastTimelineDisplayFileUrl = null;
      lastTimelineDisplayFileId = null;
    }
  });

  $: if (data?.controlType === 'time-range') {
    // Read tickTime so this block re-runs when node state changes (input edits, runtime ticks, etc.).
    // (We don't use the value; it's purely an invalidation dependency.)
    const _tick = $tickTimeStore;
    void _tick;

    // Also re-evaluate playhead state when the engine starts/stops.
    const isEngineRunning = $isRunningStore;
    void isEngineRunning;

    timeRangeNodeId = String(data?.nodeId ?? '');
    timeRangeNodeType = String(data?.nodeType ?? '');

    if (timeRangeNodeId !== timeRangeSignalNodeId) {
      timeRangeSignalNodeId = timeRangeNodeId;
      timeRangeLastPlayRequested = null;
      timeRangeStartSeqBase = null;
    }

    const { startSec, endSec, cursorSec } = computeEffectiveRange(timeRangeNodeId);

    timeRangeMin = isFiniteNumber((data as AnyRecord).min) ? Number((data as AnyRecord).min) : 0;
    timeRangeStep = isFiniteNumber((data as AnyRecord).step) ? Number((data as AnyRecord).step) : 0.01;

    const runtimeNode = timeRangeNodeId ? nodeEngine.getNode(timeRangeNodeId) : null;
    const assetIdRaw =
      typeof (runtimeNode as AnyRecord)?.config?.assetId === 'string'
        ? String((runtimeNode as AnyRecord).config.assetId)
        : '';
    const assetId = assetIdRaw.trim();

    const localAssetPathRaw =
      typeof (runtimeNode as AnyRecord)?.config?.assetPath === 'string'
        ? String((runtimeNode as AnyRecord).config.assetPath)
        : '';
    const localAssetPath = localAssetPathRaw.trim();

    // Refresh duration/backdrop when the asset changes.
    const timelineAssetKey =
      timeRangeNodeType === 'load-audio-from-assets' ||
      timeRangeNodeType === 'load-video-from-assets'
        ? assetId
        : localAssetPath;

    if (timelineAssetKey !== lastTimelineAssetId) {
      lastTimelineAssetId = timelineAssetKey;
      timeRangeDurationSec = null;
      timeRangeBackdropUrl = null;
      lastTimelineUrl = '';
      if (lastTimelineDisplayFileUrl) {
        try {
          URL.revokeObjectURL(lastTimelineDisplayFileUrl);
        } catch {
          // ignore
        }
        lastTimelineDisplayFileUrl = null;
        lastTimelineDisplayFileId = null;
      }
    }

    const serverUrl = localStorage.getItem('shugu-server-url') ?? '';
    const contentUrl = (() => {
      if (
        timeRangeNodeType === 'load-audio-from-assets' ||
        timeRangeNodeType === 'load-video-from-assets'
      ) {
        return assetId ? buildAssetContentUrl(serverUrl, assetId) : null;
      }
      const kind: LocalMediaKind | null =
        timeRangeNodeType === 'load-video-from-local'
          ? 'video'
          : timeRangeNodeType === 'load-audio-from-local'
            ? 'audio'
            : null;
      if (!kind) return null;
      if (!localAssetPath) return null;
      if (isDisplayFileRef(localAssetPath)) {
        const id = parseDisplayFileId(localAssetPath);
        if (!id) return null;
        const entry = localDisplayMediaStore.getFileById(id);
        if (!entry?.file) return null;
        if (lastTimelineDisplayFileId !== id || !lastTimelineDisplayFileUrl) {
          if (lastTimelineDisplayFileUrl) {
            try {
              URL.revokeObjectURL(lastTimelineDisplayFileUrl);
            } catch {
              // ignore
            }
          }
          lastTimelineDisplayFileId = id;
          lastTimelineDisplayFileUrl = URL.createObjectURL(entry.file);
        }
        return lastTimelineDisplayFileUrl;
      }
      return buildLocalMediaContentUrl(serverUrl, localAssetPath, kind);
    })();

    if (contentUrl && contentUrl !== lastTimelineUrl) {
      lastTimelineUrl = contentUrl;
      void (async () => {
        const kind: 'video' | 'audio' =
          timeRangeNodeType === 'load-video-from-assets' ||
          timeRangeNodeType === 'load-video-from-local'
            ? 'video'
            : 'audio';
        const duration = await getMediaDurationSec(contentUrl, kind);
        if (duration !== null && contentUrl === lastTimelineUrl) {
          timeRangeDurationSec = duration;

          // For video nodes, treat End=-1 as "media end" and hydrate it with the resolved duration
          // so manager-side Finish can reflect `Current == End` (without requiring a manual end slider).
          if (
            kind === 'video' &&
            timeRangeNodeId &&
            (timeRangeNodeType === 'load-video-from-assets' ||
              timeRangeNodeType === 'load-video-from-local') &&
            !isInputConnected(timeRangeNodeId, 'endSec')
          ) {
            const node = nodeEngine.getNode(timeRangeNodeId);
            const endStored = readLocalNumber(node, 'endSec') ?? -1;
            if (endStored < 0) {
              const rounded = Math.round(duration * 100) / 100;
              nodeEngine.updateNodeInputValue(timeRangeNodeId, 'endSec', rounded);
            }
          }
        }
        if (kind === 'audio') {
          const bg = await getAudioSpectrogramDataUrl(contentUrl, {
            width: 360,
            height: 84,
            fftSize: 1024,
          });
          if (bg && contentUrl === lastTimelineUrl) timeRangeBackdropUrl = bg;
        }
      })();
    }

    // UI playhead: detect play/loop/reverse from node inputs (or connected overrides).
    const playRaw =
      resolveConnectedBoolean(timeRangeNodeId, 'play') ??
      (() => {
        const raw = (runtimeNode as AnyRecord)?.inputValues?.play;
        if (typeof raw === 'boolean') return raw;
        const num = typeof raw === 'number' ? raw : Number(raw);
        return Number.isFinite(num) ? num >= 0.5 : false;
      })();
    const loopRaw =
      resolveConnectedBoolean(timeRangeNodeId, 'loop') ??
      (() => {
        const raw = (runtimeNode as AnyRecord)?.inputValues?.loop;
        if (typeof raw === 'boolean') return raw;
        const num = typeof raw === 'number' ? raw : Number(raw);
        return Number.isFinite(num) ? num >= 0.5 : false;
      })();
    const reverseRaw =
      resolveConnectedBoolean(timeRangeNodeId, 'reverse') ??
      (() => {
        const raw = (runtimeNode as AnyRecord)?.inputValues?.reverse;
        if (typeof raw === 'boolean') return raw;
        const num = typeof raw === 'number' ? raw : Number(raw);
        return Number.isFinite(num) ? num >= 0.5 : false;
      })();

    timeRangeIsPlaying = Boolean(playRaw);
    timeRangeLoopEnabled = Boolean(loopRaw);
    timeRangeReverseEnabled = Boolean(reverseRaw);
    if (
      timeRangeNodeType === 'load-audio-from-assets' ||
      timeRangeNodeType === 'load-video-from-assets' ||
      timeRangeNodeType === 'load-audio-from-local' ||
      timeRangeNodeType === 'load-video-from-local'
    ) {
      const inputHasAsset = ($graphStateStore.connections ?? []).some(
        (c: Connection) =>
          String(c.targetNodeId) === timeRangeNodeId && String(c.targetPortId) === 'asset'
      );
      const localInputValue =
        typeof (runtimeNode as AnyRecord)?.inputValues?.asset === 'string'
          ? String((runtimeNode as AnyRecord).inputValues.asset).trim()
          : '';

      const hasAsset =
        timeRangeNodeType === 'load-audio-from-assets' ||
        timeRangeNodeType === 'load-video-from-assets'
          ? Boolean(assetId)
          : Boolean(localAssetPath || localInputValue || inputHasAsset);
      // Require a client "started" signal so the cursor only advances when playback actually begins.
      const signal = $nodeMediaSignals.get(timeRangeNodeId);
      const startedSeq = typeof signal?.startedSeq === 'number' ? signal.startedSeq : 0;

      const playRequested = Boolean(playRaw);
      if (timeRangeLastPlayRequested === null) {
        timeRangeLastPlayRequested = playRequested;
        timeRangeStartSeqBase = playRequested ? 0 : null;
      } else if (!playRequested) {
        timeRangeLastPlayRequested = false;
        timeRangeStartSeqBase = null;
      } else if (playRequested && !timeRangeLastPlayRequested) {
        timeRangeLastPlayRequested = true;
        timeRangeStartSeqBase = startedSeq;
      }

      const needsStartedSeq = timeRangeStartSeqBase ?? 0;
      const hasStartedSignal = playRequested && startedSeq > needsStartedSeq;

      timeRangeIsPlaying =
        timeRangeIsPlaying && hasAsset && Boolean(isEngineRunning) && hasStartedSignal;
    }

    syncTimeRangeUi({ startSec, endSec, cursorSec });
  }

  $: if (data?.controlType === 'time-range') {
    if (timeRangeIsPlaying) {
      if (timeRangePlaybackRaf === null) startTimeRangePlayback();
    } else {
      stopTimeRangePlayback();
    }
  } else {
    stopTimeRangePlayback();
  }

  const setTimeRange = (startSec: number, endSec: number, cursorSec: number) => {
    if (data?.readonly) return;
    const start = Math.max(timeRangeMin, startSec);
    const end = endSec >= 0 ? Math.max(start, endSec) : -1;
    const cursor = cursorSec >= 0 ? Math.max(start, cursorSec) : -1;
    (data as AnyRecord)?.setValue?.({ startSec: start, endSec: end, cursorSec: cursor });
  };

  const handleTimeRangeStartSlider = (event: Event) => {
    const target = event.target as HTMLInputElement;
    const n = Number(target.value);
    if (!Number.isFinite(n)) return;
    const nextStart = Math.max(timeRangeMin, n);
    const nextEnd = timeRangeEndSec >= 0 ? Math.max(nextStart, timeRangeEndSec) : -1;
    const nextCursor =
      timeRangeCursorSec >= 0
        ? Math.max(nextStart, Math.min(timeRangeSliderEnd, timeRangeSliderCursor))
        : -1;
    syncTimeRangeUi({ startSec: nextStart, endSec: nextEnd, cursorSec: nextCursor });
    setTimeRange(nextStart, nextEnd, nextCursor);
  };

  const handleTimeRangeEndSlider = (event: Event) => {
    const target = event.target as HTMLInputElement;
    const n = Number(target.value);
    if (!Number.isFinite(n)) return;
    const nearEnd = Math.abs(n - timeRangeMax) <= timeRangeStep * 0.5;
    const nextEnd = nearEnd ? -1 : Math.max(timeRangeStartSec, Math.max(timeRangeMin, n));
    const nextCursor =
      timeRangeCursorSec >= 0
        ? Math.min(
            nextEnd >= 0 ? nextEnd : timeRangeMax,
            Math.max(timeRangeStartSec, timeRangeSliderCursor)
          )
        : -1;
    syncTimeRangeUi({ startSec: timeRangeStartSec, endSec: nextEnd, cursorSec: nextCursor });
    setTimeRange(timeRangeStartSec, nextEnd, nextCursor);
  };

  const handleTimeRangeCursorSlider = (event: Event) => {
    const target = event.target as HTMLInputElement;
    const n = Number(target.value);
    if (!Number.isFinite(n)) return;
    const next = Math.max(timeRangeStartSec, Math.min(timeRangeSliderEnd, n));
    timeRangePlaybackCursorSec = next;
    timeRangeSliderCursor = next;
    const span = timeRangeMax - timeRangeMin;
    timeRangeCursorFrac = span > 0 ? (timeRangeSliderCursor - timeRangeMin) / span : 0;
    setTimeRange(timeRangeStartSec, timeRangeEndSec, next);
  };
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
  <div class="control-field note-field {isInline ? 'inline' : ''}">
    {#if hasLabel}
      <div class="control-label">{data.label}</div>
    {/if}
    <div class="note-toolbar" on:pointerdown|stopPropagation>
      <button
        type="button"
        class="note-tab {noteViewMode === 'edit' ? 'active' : ''}"
        on:click|stopPropagation={() => setNoteViewMode('edit')}
      >
        Edit
      </button>
      <button
        type="button"
        class="note-tab {noteViewMode === 'preview' ? 'active' : ''}"
        on:click|stopPropagation={() => setNoteViewMode('preview')}
      >
        Preview
      </button>
      <button
        type="button"
        class="note-tab {noteViewMode === 'split' ? 'active' : ''}"
        on:click|stopPropagation={() => setNoteViewMode('split')}
      >
        Split
      </button>
    </div>

    {#if noteViewMode === 'preview'}
      <div class="note-preview" on:pointerdown|stopPropagation on:wheel|stopPropagation>
        {@html noteHtml}
      </div>
    {:else if noteViewMode === 'split'}
      <textarea
        class="control-input note-textarea {isInline ? 'inline' : ''}"
        value={data.value}
        placeholder={data.placeholder ?? ''}
        readonly={data.readonly}
        disabled={data.readonly}
        rows="6"
        on:pointerdown|stopPropagation
        on:input={changeNote}
      />
      <div class="note-preview" on:pointerdown|stopPropagation on:wheel|stopPropagation>
        {@html noteHtml}
      </div>
    {:else}
      <textarea
        class="control-input note-textarea {isInline ? 'inline' : ''}"
        value={data.value}
        placeholder={data.placeholder ?? ''}
        readonly={data.readonly}
        disabled={data.readonly}
        rows="6"
        on:pointerdown|stopPropagation
        on:input={changeNote}
      />
    {/if}
  </div>
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
  <div class="time-range {isInline ? 'inline' : ''}">
    {#if hasLabel}
      <div class="control-label">{data.label}</div>
    {/if}

    <div class="time-range-row">
      <div class="time-range-kv" aria-hidden="true">
        <div class="time-range-k">Start</div>
        <div class="time-range-v">{formatSeconds(timeRangeStartSec)}s</div>
      </div>

      <div class="time-range-kv" aria-hidden="true">
        <div class="time-range-k">End</div>
        <div class="time-range-v">
          {#if timeRangeEffectiveEndSec !== null}
            {formatSeconds(timeRangeEffectiveEndSec)}s
          {:else if timeRangeEndSec < 0}
            (end)
          {:else}
            {formatSeconds(timeRangeEndSec)}s
          {/if}
        </div>
      </div>

      <div class="time-range-kv" aria-hidden="true">
        <div class="time-range-k">Duration</div>
        <div class="time-range-v">
          {#if timeRangeDurationSec !== null}
            {formatSeconds(timeRangeDurationSec)}s
          {:else}
            —
          {/if}
        </div>
      </div>

      <div class="time-range-kv" aria-hidden="true">
        <div class="time-range-k">Current</div>
        <div class="time-range-v">{formatSeconds(timeRangeSliderCursor)}s</div>
      </div>
    </div>

    <div
      class="time-range-slider"
      on:pointerdown|stopPropagation
      style="background-image: {timeRangeBackdropUrl ? `url("${timeRangeBackdropUrl}")` : 'none'};"
    >
      <div
        class="time-range-highlight"
        style="left: calc(10px + (100% - 20px) * {timeRangeStartFrac}); width: calc((100% - 20px) * {Math.max(
          0,
          timeRangeEndFrac - timeRangeStartFrac
        )});"
      />
      <div
        class="time-range-cursor"
        style="left: calc(10px + (100% - 20px) * {timeRangeCursorFrac});"
        aria-hidden="true"
      />
      <input
        class="time-range-slider-input start"
        type="range"
        min={timeRangeMin}
        max={timeRangeMax}
        step={timeRangeStep}
        value={timeRangeSliderStart}
        disabled={data.readonly}
        on:input={handleTimeRangeStartSlider}
      />
      <input
        class="time-range-slider-input end"
        type="range"
        min={timeRangeMin}
        max={timeRangeMax}
        step={timeRangeStep}
        value={timeRangeSliderEnd}
        disabled={data.readonly}
        on:input={handleTimeRangeEndSlider}
      />
      <input
        class="time-range-slider-input cursor"
        type="range"
        min={timeRangeMin}
        max={timeRangeMax}
        step={timeRangeStep}
        value={timeRangeSliderCursor}
        disabled={data.readonly}
        on:input={handleTimeRangeCursorSlider}
      />
    </div>
  </div>
{:else if data?.controlType === 'file-picker'}
  <div class="file-picker {isInline ? 'inline' : ''}">
    {#if hasLabel}
      <div class="control-label">{data.label}</div>
    {/if}
    <div class="file-row">
      <button
        type="button"
        class="file-btn"
        disabled={data.readonly || fileIsUploading}
        on:pointerdown|stopPropagation
        on:click|stopPropagation={openFilePicker}
      >
        {data.buttonLabel || 'Choose file'}
      </button>
      <div class="file-name">{fileDisplayLabel}</div>
    </div>
    {#if fileUploadError}
      <div class="file-error">{fileUploadError}</div>
    {/if}
    <input
      class="file-input"
      type="file"
      accept={data.accept}
      bind:this={fileInput}
      disabled={data.readonly || fileIsUploading}
      on:pointerdown|stopPropagation
      on:change={handleFileChange}
    />
  </div>
{:else if data?.controlType === 'client-picker'}
  <div class="client-picker">
    {#if hasLabel}
      <div class="control-label">{data.label}</div>
    {/if}
    {#if ($audienceClients ?? []).length === 0}
      <div class="client-empty">No clients connected</div>
    {:else}
      <div class="client-grid {clientPickerInputLocked ? 'locked' : ''}">
        {#each clientPickerView as item (item.client.clientId)}
          <button
            type="button"
            class="client-dot-btn {item.primary ? 'primary' : ''} {item.selected ? 'selected' : ''}"
            title={clientLabel(item.client)}
            aria-label={clientLabel(item.client)}
            aria-pressed={item.selected}
            disabled={data.readonly || clientPickerInputLocked}
            on:pointerdown|stopPropagation
            on:click|stopPropagation={() => pickClient(item.client.clientId)}
          >
            <span class="client-dot {readinessClass(item.client.clientId, item.client.connected)}"></span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
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
  <div class="local-asset-picker {isInline ? 'inline' : ''}">
    {#if hasLabel}
      <div class="control-label">{data.label}</div>
    {/if}

    <div class="local-asset-source" on:pointerdown|stopPropagation>
      <button
        type="button"
        class="local-asset-source-btn {localAssetSource === 'display' ? 'active' : ''}"
        disabled={data.readonly}
        on:click|stopPropagation={() => switchLocalAssetSource('display')}
      >
        Display
      </button>
      <button
        type="button"
        class="local-asset-source-btn {localAssetSource === 'server' ? 'active' : ''}"
        disabled={data.readonly}
        on:click|stopPropagation={() => switchLocalAssetSource('server')}
      >
        Server
      </button>
    </div>

    {#if localAssetSource === 'display'}
      <div class="file-row">
        <button
          type="button"
          class="file-btn"
          disabled={data.readonly}
          on:pointerdown|stopPropagation
          on:click|stopPropagation={openDisplayLocalFilePicker}
        >
          Choose file
        </button>
        <div class="file-name">
          {#if isDisplayFileRef(data.value)}
            {displayLocalSelectedName(data.value) || String(data.value)}
          {:else}
            No file selected
          {/if}
        </div>
      </div>

      <input
        class="file-input"
        type="file"
        accept={acceptForLocalKind(localAssetPickerKind)}
        bind:this={displayLocalFileInput}
        disabled={data.readonly}
        on:pointerdown|stopPropagation
        on:change={onDisplayLocalFileChange}
      />

      <select
        class="control-input {isInline ? 'inline' : ''}"
        value={isDisplayFileRef(data.value) ? data.value : ''}
        disabled={data.readonly}
        on:pointerdown|stopPropagation
        on:change={changeDisplayLocalSelect}
      >
        <option value="">(picked files)</option>
        {#each buildDisplayLocalMediaOptions(data.assetKind) as opt (opt.value)}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>

      {#if !isLocalDisplayConnected}
        <div class="local-asset-hint">
          Display is not paired. If Display is open in the same browser (same origin), local files
          can still work; otherwise click Open Display.
        </div>
      {/if}
      <div class="local-asset-hint">
        Browser security: a deployed website cannot read arbitrary paths like <code>/Users/...</code
        >. Use the file picker.
      </div>
      {#if displayLocalError}
        <div class="local-asset-error">{displayLocalError}</div>
      {/if}
    {:else}
      <select
        class="control-input {isInline ? 'inline' : ''}"
        value={typeof data.value === 'string' && !isDisplayFileRef(data.value) ? data.value : ''}
        disabled={data.readonly || localAssetValidating}
        on:pointerdown|stopPropagation
        on:change={changeLocalAssetSelect}
      >
        <option value="">(select server-local file)</option>
        {#each buildLocalMediaOptions(data.assetKind) as opt (opt.value)}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>

      <div class="local-asset-path-row">
        <input
          class="control-input local-asset-path"
          value={localAssetDraft}
          placeholder="/Users/.../file.mp4"
          disabled={data.readonly || localAssetValidating}
          on:pointerdown|stopPropagation
          on:input={onLocalAssetDraftInput}
          on:keydown={onLocalAssetDraftKeyDown}
          on:blur={onLocalAssetDraftBlur}
        />
        <button
          type="button"
          class="local-asset-btn"
          disabled={data.readonly || localAssetValidating}
          on:pointerdown|stopPropagation
          on:click|stopPropagation={() => validateLocalAssetDraft()}
        >
          {localAssetValidating ? 'Checking…' : 'Check'}
        </button>
      </div>

      {#if $localMediaStore?.status === 'error' && $localMediaStore?.error}
        <div class="local-asset-hint">Local media list error: {$localMediaStore.error}</div>
      {/if}
      {#if localAssetError}
        <div class="local-asset-error">{localAssetError}</div>
      {/if}
    {/if}
  </div>
{:else if data?.controlType === 'client-sensor-value'}
  <div class="sensor-inline-value">{sensorValueText}</div>
{:else if data?.controlType === 'midi-learn'}
  <div class="midi-learn">
    {#if hasLabel}
      <div class="control-label">{data.label}</div>
    {/if}
    <div class="midi-row">
      <div class="midi-binding">{formatMidiSource(midiSource)}</div>
      <button
        type="button"
        class="midi-btn {midiIsLearning ? 'active' : ''}"
        disabled={!$midiSupportedStore}
        on:pointerdown|stopPropagation
        on:click|stopPropagation={() => toggleMidiLearn(midiNodeId)}
      >
        {midiIsLearning ? 'Listening…' : 'Learn'}
      </button>
    </div>
    {#if midiIsLearning}
      <div class="midi-hint">
        Move a MIDI control… (input: {$midiSelectedInputStore || 'auto'})
      </div>
      <div class="midi-last">{formatMidiEvent($midiLastMessageStore)}</div>
    {/if}
    {#if midiSource}
      <button
        type="button"
        class="midi-clear"
        on:pointerdown|stopPropagation
        on:click|stopPropagation={() => clearMidiBinding(midiNodeId)}
      >
        Clear binding
      </button>
    {/if}
  </div>
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

  .local-asset-picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 6px 10px 10px;
  }

  .local-asset-source {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .local-asset-source-btn {
    flex: 1;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 6, 23, 0.35);
    color: rgba(255, 255, 255, 0.78);
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
  }

  .local-asset-source-btn.active {
    background: rgba(99, 102, 241, 0.18);
    border-color: rgba(99, 102, 241, 0.5);
    color: rgba(255, 255, 255, 0.92);
  }

  .local-asset-source-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .local-asset-path-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .local-asset-path {
    flex: 1;
    min-width: 0;
  }

  .local-asset-btn {
    border-radius: 10px;
    padding: 6px 10px;
    background: rgba(2, 6, 23, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.85);
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }

  .local-asset-btn:hover:not(:disabled) {
    border-color: rgba(99, 102, 241, 0.7);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
  }

  .local-asset-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .local-asset-error,
  .local-asset-hint {
    font-size: 11px;
    line-height: 1.3;
    color: rgba(248, 113, 113, 0.92);
    overflow-wrap: anywhere;
  }

  .local-asset-hint {
    color: rgba(148, 163, 184, 0.8);
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

  .note-field {
    padding-bottom: 10px;
  }

  .note-textarea {
    min-height: 110px;
    resize: vertical;
    font-family: inherit;
    line-height: 1.4;
    white-space: pre-wrap;
  }

  .note-toolbar {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }

  .note-tab {
    border-radius: 999px;
    padding: 6px 10px;
    background: rgba(2, 6, 23, 0.32);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.78);
    font-size: 11px;
    cursor: pointer;
  }

  .note-tab:hover {
    border-color: rgba(99, 102, 241, 0.7);
  }

  .note-tab.active {
    background: rgba(99, 102, 241, 0.18);
    border-color: rgba(99, 102, 241, 0.35);
    color: rgba(255, 255, 255, 0.92);
  }

  .note-preview {
    width: 100%;
    box-sizing: border-box;
    border-radius: 10px;
    padding: 8px 10px;
    background: rgba(2, 6, 23, 0.28);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.9);
    font-size: 12px;
    overflow: auto;
    max-height: 260px;
  }

  .note-preview :global(p) {
    margin: 0 0 10px;
  }

  .note-preview :global(p:last-child) {
    margin-bottom: 0;
  }

  .note-preview :global(h1) {
    font-size: 16px;
    margin: 10px 0 8px;
  }

  .note-preview :global(h2) {
    font-size: 14px;
    margin: 10px 0 8px;
  }

  .note-preview :global(h3),
  .note-preview :global(h4),
  .note-preview :global(h5),
  .note-preview :global(h6) {
    font-size: 13px;
    margin: 10px 0 8px;
  }

  .note-preview :global(ul),
  .note-preview :global(ol) {
    margin: 0 0 10px;
    padding-left: 18px;
  }

  .note-preview :global(li) {
    margin: 4px 0;
  }

  .note-preview :global(a) {
    color: rgba(129, 140, 248, 0.95);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .note-preview :global(code) {
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
      monospace;
    font-size: 11px;
    background: rgba(2, 6, 23, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.12);
    padding: 1px 6px;
    border-radius: 8px;
  }

  .note-preview :global(pre) {
    margin: 0 0 10px;
    padding: 10px;
    background: rgba(2, 6, 23, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    overflow: auto;
  }

  .note-preview :global(pre code) {
    background: transparent;
    border: none;
    padding: 0;
    white-space: pre;
    display: block;
  }

  .note-preview :global(blockquote) {
    margin: 0 0 10px;
    padding-left: 10px;
    border-left: 2px solid rgba(99, 102, 241, 0.55);
    color: rgba(255, 255, 255, 0.82);
  }

  .note-preview :global(hr) {
    border: none;
    height: 1px;
    background: rgba(255, 255, 255, 0.14);
    margin: 10px 0;
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

  .time-range {
    padding: 6px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .time-range-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    align-items: end;
  }

  .time-range-kv {
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(2, 6, 23, 0.25);
    border-radius: 10px;
    padding: 6px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .time-range-k {
    font-size: 10px;
    letter-spacing: 0.2px;
    color: rgba(255, 255, 255, 0.55);
  }

  .time-range-v {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 650;
    color: rgba(255, 255, 255, 0.9);
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .time-range-slider {
    position: relative;
    height: 84px;
    padding: 0 2px;
    border-radius: 10px;
    background-color: rgba(2, 6, 23, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    overflow: hidden;
    background-size: cover;
    background-position: center;
  }

  .time-range-highlight {
    position: absolute;
    height: 6px;
    border-radius: 999px;
    background: rgba(14, 165, 233, 0.7);
    bottom: 10px;
    pointer-events: none;
  }

  .time-range-cursor {
    position: absolute;
    top: 8px;
    bottom: 8px;
    width: 2px;
    background: rgba(255, 255, 255, 0.85);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }

  .time-range-slider-input {
    -webkit-appearance: none;
    appearance: none;
    position: absolute;
    left: 10px;
    right: 10px;
    width: calc(100% - 20px);
    height: 84px;
    background: transparent;
    pointer-events: none;
  }

  .time-range-slider-input::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    pointer-events: auto;
    width: 16px;
    height: 16px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.92);
    border: 2px solid rgba(14, 165, 233, 0.95);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  }

  .time-range-slider-input::-moz-range-thumb {
    pointer-events: auto;
    width: 16px;
    height: 16px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.92);
    border: 2px solid rgba(14, 165, 233, 0.95);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  }

  .time-range-slider-input::-webkit-slider-runnable-track {
    height: 6px;
    background: rgba(255, 255, 255, 0.12);
    border-radius: 999px;
  }

  .time-range-slider-input::-moz-range-track {
    height: 6px;
    background: rgba(255, 255, 255, 0.12);
    border-radius: 999px;
  }

  .time-range-slider-input.cursor::-webkit-slider-thumb {
    width: 10px;
    height: 18px;
    border-radius: 6px;
    border-color: rgba(255, 255, 255, 0.9);
    background: rgba(255, 255, 255, 0.9);
  }

  .time-range-slider-input.cursor::-moz-range-thumb {
    width: 10px;
    height: 18px;
    border-radius: 6px;
    border-color: rgba(255, 255, 255, 0.9);
    background: rgba(255, 255, 255, 0.9);
  }

  .client-picker {
    padding: 6px 8px 10px;
  }

  .file-picker {
    padding: 6px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .file-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .file-btn {
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 6, 23, 0.5);
    color: rgba(255, 255, 255, 0.88);
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
  }

  .file-btn:hover {
    border-color: rgba(99, 102, 241, 0.5);
  }

  .file-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .file-name {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.62);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .file-input {
    display: none;
  }

  .file-error {
    font-size: 11px;
    color: rgba(239, 68, 68, 0.9);
    line-height: 1.35;
    word-break: break-word;
  }

  .client-empty {
    padding: 10px 8px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
  }

  .client-list {
    display: flex;
    gap: 6px;
    max-height: 160px;
    overflow: auto;
    padding-right: 2px;
  }

  .client-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    max-height: 160px;
    overflow: auto;
    padding-right: 2px;
  }

  .client-grid.locked {
    opacity: 0.75;
  }

  .client-dot-btn {
    width: 18px;
    height: 18px;
    padding: 0;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(2, 6, 23, 0.35);
    color: rgba(255, 255, 255, 0.88);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .client-dot-btn:hover {
    border-color: rgba(99, 102, 241, 0.35);
    background: rgba(2, 6, 23, 0.45);
  }

  .client-dot-btn:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .client-dot-btn.selected {
    border-color: rgba(99, 102, 241, 0.65);
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
  }

  .client-dot-btn.primary {
    border-color: rgba(99, 102, 241, 0.85);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.18);
  }

  .client-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: rgba(250, 204, 21, 0.92);
    box-shadow: 0 0 0 2px rgba(250, 204, 21, 0.18);
    flex: 0 0 auto;
  }

  .client-dot.disconnected {
    background: rgba(148, 163, 184, 0.9);
    box-shadow: none;
  }

  .client-dot.error {
    background: rgba(239, 68, 68, 0.92);
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.18);
  }

  .client-dot.connected {
    background: rgba(250, 204, 21, 0.92);
    box-shadow: 0 0 0 2px rgba(250, 204, 21, 0.18);
  }

  .client-dot.loading {
    background: rgba(250, 204, 21, 0.92);
    box-shadow: 0 0 0 2px rgba(250, 204, 21, 0.18);
  }

  .client-dot.ready {
    background: rgba(34, 197, 94, 0.9);
    box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.16);
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

  .midi-learn {
    padding: 6px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .midi-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .midi-binding {
    flex: 1;
    min-width: 0;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.76);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(2, 6, 23, 0.32);
    border-radius: 10px;
    padding: 6px 10px;
  }

  .midi-btn {
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(2, 6, 23, 0.38);
    color: rgba(255, 255, 255, 0.9);
    border-radius: 10px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
    flex: 0 0 auto;
  }

  .midi-btn:hover {
    border-color: rgba(99, 102, 241, 0.45);
    background: rgba(2, 6, 23, 0.5);
  }

  .midi-btn.active {
    border-color: rgba(99, 102, 241, 0.75);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
  }

  .midi-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .midi-hint {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.62);
  }

  .midi-last {
    font-family: var(--font-mono);
    font-size: 11px;
    color: rgba(20, 184, 166, 0.92);
  }

  .midi-clear {
    align-self: flex-start;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(2, 6, 23, 0.35);
    color: rgba(255, 255, 255, 0.84);
    border-radius: 10px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
  }

  .midi-clear:hover {
    border-color: rgba(239, 68, 68, 0.45);
    background: rgba(2, 6, 23, 0.5);
  }
</style>
