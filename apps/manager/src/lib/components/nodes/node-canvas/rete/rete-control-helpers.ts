/**
 * Purpose: Pure value helpers used by ReteControl.svelte.
 */
import { ClassicPreset } from 'rete';
import type { ClientInfo } from '@shugu/protocol';
import type { MidiEvent } from '$lib/features/midi/midi-service';
import type { GraphState, NodeInstance } from '$lib/nodes/types';
import type { nodeRegistry as nodeRegistryValue } from '$lib/nodes';

export type AnyRecord = Record<string, unknown>;
export type NumberBounds = { min?: number; max?: number; step?: number };
export type ClientPickerItem = {
  client: ClientInfo;
  selected: boolean;
  primary: boolean;
};

const asRecord = (value: unknown): AnyRecord =>
  value && typeof value === 'object' ? (value as unknown as AnyRecord) : {};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const resolveNumberBounds = (
  ctrl: unknown,
  registry: typeof nodeRegistryValue
): NumberBounds => {
  if (!(ctrl instanceof ClassicPreset.InputControl)) return {};
  const record = asRecord(ctrl);
  if (record.type !== 'number') return {};

  const fromControl: NumberBounds = {
    min: isFiniteNumber(record.min) ? record.min : undefined,
    max: isFiniteNumber(record.max) ? record.max : undefined,
    step: isFiniteNumber(record.step) ? record.step : undefined,
  };
  if (
    fromControl.min !== undefined ||
    fromControl.max !== undefined ||
    fromControl.step !== undefined
  ) {
    return fromControl;
  }

  const nodeType =
    typeof record.nodeType === 'string' ? String(record.nodeType) : '';
  const portId = typeof record.portId === 'string' ? String(record.portId) : '';
  const configKey =
    typeof record.configKey === 'string' ? String(record.configKey) : '';
  const key = portId || configKey;
  if (!nodeType || !key) return {};

  const def = registry.get(nodeType);
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

export const clampNumberToBounds = (value: number, bounds: NumberBounds): number => {
  let next = value;
  if (typeof bounds.min === 'number' && Number.isFinite(bounds.min)) {
    next = Math.max(bounds.min, next);
  }
  if (typeof bounds.max === 'number' && Number.isFinite(bounds.max)) {
    next = Math.min(bounds.max, next);
  }
  return next;
};

export const buildAssetOptions = (
  assets: AnyRecord[],
  kind: string
): { value: string; label: string }[] => {
  const k = kind && typeof kind === 'string' ? kind : 'any';
  const filtered = k === 'any' ? assets : assets.filter((a) => String(a?.kind ?? '') === k);
  return filtered.map((a) => ({
    value: `asset:${String(a?.id ?? '')}`,
    label: `${String(a?.originalName ?? a?.id ?? '')}`,
  }));
};

export const normalizeAssetIdForContentUrl = (assetRefOrId: string): string => {
  const trimmed = assetRefOrId.trim();
  const assetPrefix = 'asset:';
  const withoutPrefix = trimmed.startsWith(assetPrefix)
    ? trimmed.slice(assetPrefix.length).trim()
    : trimmed;
  return withoutPrefix.split(/[?#]/)[0]?.trim() ?? '';
};

export const buildAssetContentUrl = (serverUrl: string, assetRefOrId: string): string | null => {
  const trimmed = serverUrl.trim();
  const id = normalizeAssetIdForContentUrl(assetRefOrId);
  if (!trimmed || !id) return null;
  try {
    const base = trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
    return new URL(`api/assets/${encodeURIComponent(id)}/content`, base).toString();
  } catch {
    return null;
  }
};

export const clientLabel = (c: ClientInfo): string => String(asRecord(c).clientId ?? '');

export const readinessClass = (
  readinessByClient: Map<string, AnyRecord>,
  clientId: string,
  connected?: boolean
): string => {
  if (connected === false) return 'disconnected';
  const info = readinessByClient.get(clientId);
  if (!info) return 'connected';
  if (info.status === 'assets-ready') return 'ready';
  if (info.status === 'assets-error') return 'error';
  if (info.status === 'assets-loading') return 'loading';
  return 'connected';
};

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

export const buildClientPickerView = (args: {
  data: AnyRecord | null | undefined;
  graphState: GraphState;
  audienceClients: AnyRecord[];
  getNode: (nodeId: string) => NodeInstance | undefined;
  getLastComputedInputs: (nodeId: string) => Record<string, unknown> | null;
}): ClientPickerItem[] => {
  if (args.data?.controlType !== 'client-picker') return [];

  const nodeId = String(args.data?.nodeId ?? '');
  if (!nodeId) return [];

  const clients = args.audienceClients.map((c) => String(c?.clientId ?? '')).filter(Boolean);
  if (clients.length === 0) return [];

  const clientById = new Map<string, ClientInfo>();
  for (const c of args.audienceClients) {
    const id = String(asRecord(c).clientId ?? '');
    if (!id) continue;
    clientById.set(id, c as unknown as ClientInfo);
  }

  const node = args.getNode(nodeId);
  if (!node) {
    const orderedClients = clients
      .map((id) => clientById.get(id))
      .filter(Boolean) as ClientInfo[];
    return orderedClients.map((c) => ({ client: c, selected: false, primary: false }));
  }

  const computed = args.getLastComputedInputs(nodeId);
  const isPortConnected = (portId: string) =>
    (args.graphState?.connections ?? []).some(
      (c) => String(c.targetNodeId) === nodeId && String(c.targetPortId) === String(portId)
    );
  const inputValues = asRecord(node.inputValues);
  const hasRoutingInput = (['index', 'range', 'random'] as const).some(
    (portId) =>
      isPortConnected(portId) ||
      (computed && Object.prototype.hasOwnProperty.call(computed, portId)) ||
      Object.prototype.hasOwnProperty.call(inputValues, portId)
  );
  const config = asRecord(node.config);
  const configuredId =
    typeof config.displayId === 'string' ? String(config.displayId).trim() : '';
  if (!hasRoutingInput && configuredId && clientById.has(configuredId)) {
    const orderedClients = clients
      .map((id) => clientById.get(id))
      .filter(Boolean) as ClientInfo[];
    return orderedClients.map((c) => {
      const clientId = String(asRecord(c).clientId ?? '');
      const selected = clientId === configuredId;
      return { client: c, selected, primary: selected };
    });
  }
  const getEffectiveInput = (portId: 'index' | 'range' | 'random'): unknown => {
    const connected = isPortConnected(portId);
    if (connected && computed && Object.prototype.hasOwnProperty.call(computed, portId)) {
      return (computed as AnyRecord)[portId];
    }
    return inputValues[portId];
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
    selected: selectedIdSet.has(String(asRecord(c).clientId ?? '')),
    primary: String(asRecord(c).clientId ?? '') === selectedFirstId,
  }));
};

const clientPickerSignature = (items: ClientPickerItem[]): string =>
  items
    .map(
      (item) =>
        `${String(item.client?.clientId ?? '')}:${item.selected ? 1 : 0}:${item.primary ? 1 : 0}`
    )
    .join('|');

export const shouldUpdateClientPickerView = (
  previous: ClientPickerItem[],
  next: ClientPickerItem[]
): boolean => clientPickerSignature(previous) !== clientPickerSignature(next);

export const formatValue = (val: unknown): string => {
  if (val === null || val === undefined) return '0.00';
  const num = Number(val);
  if (!Number.isFinite(num)) return '0.00';
  return num.toFixed(2);
};

export const formatBpm = (val: unknown): string => {
  if (val === null || val === undefined) return '0';
  const num = Number(val);
  if (!Number.isFinite(num)) return '0';
  return String(Math.round(num));
};

export const computeSensorValue = (
  portId: string,
  msg: AnyRecord | null,
  payload: AnyRecord
): string => {
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
};

export const inferAssetKind = (mimeType: string): 'audio' | 'image' | 'video' | 'model' | null => {
  const t = mimeType.toLowerCase();
  if (t.startsWith('audio/')) return 'audio';
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('model/')) return 'model';
  return null;
};

export const buildAssetUploadUrl = (serverUrl: string): string | null => {
  const trimmed = serverUrl.trim();
  if (!trimmed) return null;
  try {
    const base = trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
    return new URL('api/assets', base).toString();
  } catch {
    return null;
  }
};

export const formatMidiEvent = (event: MidiEvent | null): string => {
  if (!event) return '—';
  const channel = `ch${event.channel + 1}`;
  if (event.type === 'pitchbend')
    return `pitchbend • ${channel} • ${event.normalized.toFixed(3)}`;
  const num = event.number ?? 0;
  const suffix = event.type === 'note' ? (event.isPress ? 'on' : 'off') : `${event.rawValue}`;
  return `${event.type} ${num} • ${channel} • ${suffix}`;
};
