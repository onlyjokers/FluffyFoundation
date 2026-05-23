/**
 * Purpose: Client selection, routing, and sensor processing node definitions.
 */
import type { ClientPermissionName, ClientPermissions, ControlAction, ControlPayload } from '@shugu/protocol';

import type { NodeDefinition } from '../../types.js';
import type {
  ClientObject,
  ClientObjectDeps,
  ClientSensorMessage,
  ClientUiLayerItem,
  NodeCommand,
} from '../types.js';
import { selectClientIdsForNode } from '../client-selection.js';
import {
  asRecord,
  getArrayValue,
  getBooleanValue,
  getNumberValue,
  getStringValue,
} from './node-definition-utils.js';

function resolveConfiguredClientId(configured: string, available: string[]): string {
  const clientId = configured.trim();
  if (!clientId) return '';
  if (available.length > 0 && !available.includes(clientId)) return '';
  return clientId;
}

function resolveClientSelection(
  nodeId: string,
  available: string[],
  loadedIds: string[],
  inputs: Record<string, unknown>,
  configured: string
): { index: number; selectedIds: string[] } {
  const configuredClientId = resolveConfiguredClientId(configured, available);
  if (configuredClientId) return { index: 1, selectedIds: [configuredClientId] };
  if (loadedIds.length > 0) return { index: 1, selectedIds: loadedIds };
  return selectClientIdsForNode(nodeId, available, {
    index: inputs.index,
    range: inputs.range,
    random: inputs.random,
  });
}

const permissionConfigKeys: ClientPermissionName[] = ['microphone', 'motion', 'camera', 'wakeLock', 'geolocation'];

function selectedPermissionKeys(config: Record<string, unknown>): ClientPermissionName[] {
  return permissionConfigKeys.filter((key) => config[key] === true);
}

function hasGrantedPermission(permissions: ClientPermissions | null | undefined, key: ClientPermissionName): boolean {
  return permissions?.[key] === 'granted';
}

function coerceUiChain(raw: unknown): ClientUiLayerItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ClientUiLayerItem[] = [];
  for (const item of raw) {
    const record = asRecord(item);
    if (!record) continue;
    const nodeId = getStringValue(record.nodeId);
    if (!nodeId) continue;
    const type = getStringValue(record.type);
    if (type === 'button') out.push({ type: 'button', nodeId });
    if (type === 'input') out.push({ type: 'input', nodeId });
  }
  return out;
}

function createClientObjectForSelection(
  primaryClientId: string,
  selectedIds: string[],
  deps: ClientObjectDeps
): ClientObject {
  const latest = primaryClientId
    ? (deps.getSensorForClientId?.(primaryClientId) ?? deps.getLatestSensor?.() ?? null)
    : (deps.getLatestSensor?.() ?? null);
  const sensors: ClientSensorMessage | null = latest
    ? {
        sensorType: latest.sensorType,
        payload: latest.payload,
        serverTimestamp: latest.serverTimestamp,
        clientTimestamp: latest.clientTimestamp,
      }
    : null;
  return { clientId: primaryClientId, clientIds: selectedIds, sensors };
}

function resolveTargetsFromClientInput(raw: unknown): string[] {
  const record = asRecord(raw);
  if (!record) return [];
  const idsRaw = record.clientIds;
  const ids = Array.isArray(idsRaw) ? idsRaw.map(String).filter(Boolean) : [];
  if (ids.length > 0) return ids;
  const clientId = getStringValue(record.clientId);
  return clientId ? [clientId] : [];
}

function commandFromUnknown(raw: unknown): NodeCommand | null {
  const record = asRecord(raw);
  if (!record) return null;
  const action = getStringValue(record.action) as ControlAction | undefined;
  if (!action) return null;
  return {
    action,
    payload: (record.payload ?? {}) as ControlPayload,
    executeAt: getNumberValue(record.executeAt) ?? undefined,
  };
}

export function createClientCountNode(deps: ClientObjectDeps): NodeDefinition {
  return {
    type: 'client-count',
    label: 'Client Count',
    category: 'Objects',
    inputs: [],
    outputs: [
      { id: 'allIndexs', label: 'All Indexs', type: 'array' },
      { id: 'number', label: 'Number', type: 'number' },
    ],
    configSchema: [],
    process: () => {
      const clients = deps.getAllClientIds?.() ?? [];
      return { allIndexs: clients, number: clients.length };
    },
  };
}

export function createClientPermissionFilterNode(deps: ClientObjectDeps): NodeDefinition {
  return {
    type: 'client-permission-filter',
    label: 'Client Filter for Permissions',
    category: 'Objects',
    inputs: [{ id: 'loadIndexs', label: 'Load Indexs', type: 'array' }],
    outputs: [
      { id: 'indexs', label: 'Indexs', type: 'array' },
      { id: 'number', label: 'Number', type: 'number' },
      { id: 'rejectedIndexs', label: 'Rejected Indexs', type: 'array' },
    ],
    configSchema: [
      {
        key: 'matchMode',
        label: 'Match Mode',
        type: 'select',
        defaultValue: 'all',
        options: [
          { value: 'all', label: 'All' },
          { value: 'any', label: 'Any' },
        ],
      },
      { key: 'microphone', label: 'Microphone', type: 'boolean', defaultValue: false },
      { key: 'motion', label: 'Motion', type: 'boolean', defaultValue: false },
      { key: 'camera', label: 'Camera', type: 'boolean', defaultValue: false },
      { key: 'wakeLock', label: 'Wake Lock', type: 'boolean', defaultValue: false },
      { key: 'geolocation', label: 'Geolocation', type: 'boolean', defaultValue: false },
    ],
    process: (inputs, config) => {
      const allClients = deps.getAllClientIds?.() ?? [];
      const audienceClients = deps.isAudienceClient
        ? allClients.filter((clientId) => deps.isAudienceClient?.(clientId) !== false)
        : allClients;
      const loaded = getArrayValue(inputs.loadIndexs);
      const candidates = loaded
        ? loaded.map(String).filter((clientId) => audienceClients.includes(clientId))
        : audienceClients;
      const required = selectedPermissionKeys(config);

      if (required.length === 0) {
        return { indexs: candidates, number: candidates.length, rejectedIndexs: [] };
      }

      const matchAny = config.matchMode === 'any';
      const indexs: string[] = [];
      const rejectedIndexs: string[] = [];

      for (const clientId of candidates) {
        const permissions = deps.getClientPermissions?.(clientId) ?? null;
        const granted = required.map((key) => hasGrantedPermission(permissions, key));
        const accepted = matchAny ? granted.some(Boolean) : granted.every(Boolean);
        if (accepted) indexs.push(clientId);
        else rejectedIndexs.push(clientId);
      }

      return { indexs, number: indexs.length, rejectedIndexs };
    },
  };
}

export function createClientButtonNode(deps: ClientObjectDeps): NodeDefinition {
  return {
    type: 'client-button',
    label: 'Client Button',
    category: 'ClientUI',
    metadata: {
      version: '1.0.0',
      platformTargets: ['client'],
      sideEffectClass: 'local-state',
      permissions: [],
      description: 'Renders a button on the Client and emits a one-tick pressed pulse.',
      compatibility: [
        {
          target: 'client runtime',
          rule: 'Only renders when deployed to a Client node-executor graph.',
          repairHint: 'Connect the ClientUI node into a deployed patch subgraph.',
        },
      ],
      examples: [
        {
          title: 'Trigger logic from Client',
          summary: 'Connect Pressed to boolean logic that controls a Client patch.',
        },
      ],
      risks: [],
      repairHints: ['Verify the Display input is true if the button is not visible.'],
    },
    inputs: [
      { id: 'in', label: 'In', type: 'ui' },
      { id: 'display', label: 'Display', type: 'boolean', defaultValue: true },
    ],
    outputs: [
      { id: 'out', label: 'Out', type: 'ui' },
      { id: 'pressed', label: 'Pressed', type: 'boolean' },
    ],
    configSchema: [],
    process: (inputs, _config, context) => {
      const display = getBooleanValue(inputs.display) ?? true;
      const chain = coerceUiChain(inputs.in);
      if (!display) return { out: chain, pressed: false };
      return {
        out: [...chain, { type: 'button', nodeId: context.nodeId }],
        pressed: deps.clientUi?.consumeClientButtonPressed?.(context.nodeId) ?? false,
      };
    },
    onDisable: (_inputs, _config, context) => {
      deps.clientUi?.clearClientUiNode?.(context.nodeId);
    },
  };
}

export function createClientInputBoxNode(deps: ClientObjectDeps): NodeDefinition {
  return {
    type: 'client-input-box',
    label: 'Client Input Box',
    category: 'ClientUI',
    metadata: {
      version: '1.0.0',
      platformTargets: ['client'],
      sideEffectClass: 'local-state',
      permissions: [],
      description: 'Renders a submit-style text input on the Client and outputs submitted text.',
      compatibility: [
        {
          target: 'client runtime',
          rule: 'Input Content updates only when the Client submits text.',
          repairHint: 'Submit from the Client input box before expecting output text.',
        },
      ],
      examples: [
        {
          title: 'Use Client text in a patch',
          summary: 'Connect Input Content to string-processing nodes after a Client submits text.',
        },
      ],
      risks: [],
      repairHints: ['Verify the Display input is true if the input box is not visible.'],
    },
    inputs: [
      { id: 'in', label: 'In', type: 'ui' },
      { id: 'display', label: 'Display', type: 'boolean', defaultValue: true },
    ],
    outputs: [
      { id: 'out', label: 'Out', type: 'ui' },
      { id: 'inputContent', label: 'Input Content', type: 'string' },
      { id: 'firstInputed', label: 'First Inputed', type: 'boolean' },
    ],
    configSchema: [],
    process: (inputs, _config, context) => {
      const display = getBooleanValue(inputs.display) ?? true;
      const chain = coerceUiChain(inputs.in);
      if (!display) return { out: chain, inputContent: '', firstInputed: false };
      const state = deps.clientUi?.getClientUiState?.(context.nodeId) ?? null;
      return {
        out: [...chain, { type: 'input', nodeId: context.nodeId }],
        inputContent: typeof state?.inputContent === 'string' ? state.inputContent : '',
        firstInputed: Boolean(state?.firstInputed),
      };
    },
    onDisable: (_inputs, _config, context) => {
      deps.clientUi?.clearClientUiNode?.(context.nodeId);
    },
  };
}

export function createClientLoaderNode(deps: ClientObjectDeps): NodeDefinition {
  return {
    type: 'client-loader',
    label: 'Client Loader',
    category: 'Objects',
    inputs: [
      { id: 'loadIndexs', label: 'Load Indexs', type: 'array' },
      { id: 'index', label: 'Index', type: 'number', defaultValue: 1, min: 1, step: 1 },
      { id: 'range', label: 'Range', type: 'number', defaultValue: 1, min: 1, step: 1 },
      { id: 'random', label: 'Random', type: 'boolean', defaultValue: false },
    ],
    outputs: [
      { id: 'client', label: 'Client', type: 'client' },
      { id: 'indexs', label: 'Indexs', type: 'array' },
      { id: 'number', label: 'Number', type: 'number' },
    ],
    configSchema: [{ key: 'clientId', label: 'Clients', type: 'client-picker', defaultValue: '' }],
    process: (inputs, config, context) => {
      const configured = typeof config.clientId === 'string' ? String(config.clientId) : '';

      const available = deps.getAllClientIds?.() ?? [];
      const loadInds = inputs.loadIndexs;
      const loadedIds = Array.isArray(loadInds)
        ? loadInds.map(String).filter((id) => available.includes(id))
        : [];

      const selection = resolveClientSelection(context.nodeId, available, loadedIds, inputs, configured);

      const fallbackSelected = deps.getSelectedClientIds?.() ?? [];
      const primaryClientId =
        selection.selectedIds[0] ?? fallbackSelected[0] ?? deps.getClientId() ?? configured;

      const client = createClientObjectForSelection(primaryClientId, selection.selectedIds, deps);

      return { client, indexs: selection.selectedIds, number: selection.selectedIds.length };
    },
  };
}

export function createClientExecutorNode(deps: ClientObjectDeps): NodeDefinition {
  const resolveTargets = (inputs: Record<string, unknown>): string[] => {
    const targets = resolveTargetsFromClientInput(inputs.client);
    if (targets.length > 0) return targets;
    const fallbackSelected = deps.getSelectedClientIds?.() ?? [];
    if (fallbackSelected.length > 0) return fallbackSelected;
    const fallbackSingle = deps.getClientId();
    return fallbackSingle ? [fallbackSingle] : [];
  };

  const send = (clientId: string, cmd: NodeCommand) => {
    if (!clientId) return;
    if (deps.executeCommandForClientId) deps.executeCommandForClientId(clientId, cmd);
    else deps.executeCommand(cmd);
  };

  return {
    type: 'client-executor',
    label: 'Client Executor',
    category: 'Objects',
    inputs: [
      { id: 'client', label: 'Client', type: 'client' },
      { id: 'in', label: 'In', type: 'command', kind: 'sink' },
    ],
    outputs: [{ id: 'imageOut', label: 'Image Out', type: 'image' }],
    configSchema: [],
    process: (inputs) => {
      const primaryClientId = resolveTargetsFromClientInput(inputs.client)[0] ?? '';
      const imageOut =
        typeof deps.getImageForClientId === 'function' && primaryClientId
          ? deps.getImageForClientId(primaryClientId)
          : null;
      return { imageOut };
    },
    onSink: (inputs) => {
      const targets = resolveTargets(inputs);
      if (targets.length === 0) return;

      const raw = inputs.in;
      const commands = (Array.isArray(raw) ? raw : [raw]) as unknown[];
      for (const rawCommand of commands) {
        const next = commandFromUnknown(rawCommand);
        if (!next) continue;
        for (const clientId of targets) send(clientId, next);
      }
    },
    onDisable: (inputs) => {
      const targets = resolveTargets(inputs);
      if (targets.length === 0) return;

      const cleanupCommands: NodeCommand[] = [
        { action: 'stopSound', payload: {} },
        { action: 'stopMedia', payload: {} },
        { action: 'hideImage', payload: {} },
        { action: 'flashlight', payload: { mode: 'off' } },
        { action: 'screenColor', payload: { color: '#000000', opacity: 0, mode: 'solid' } },
      ];

      for (const clientId of targets) {
        for (const cmd of cleanupCommands) send(clientId, cmd);
      }
    },
  };
}

export function createDisplayObjectNode(): NodeDefinition {
  return {
    type: 'display-object',
    label: 'Display',
    category: 'Objects',
    metadata: {
      version: '2.0.0',
      platformTargets: ['manager', 'display'],
      sideEffectClass: 'remote-control',
      permissions: ['display:control', 'control:send'],
      description:
        'Routes command messages to selected Display endpoints without exposing UI layout details.',
      compatibility: [
        {
          target: 'command outputs',
          rule: 'Accepts command sink inputs from media, image, visual, and processor nodes.',
          repairHint: 'Connect command-producing nodes to Display when output is not visible.',
        },
      ],
      examples: [
        {
          title: 'Show media on Display',
          summary: 'Connect play-media cmd output to Display input to route playback commands.',
        },
      ],
      risks: ['Can change the live Display surface immediately.'],
      repairHints: ['Verify the target Display is connected before assuming a command failed.'],
    },
    inputs: [
      { id: 'index', label: 'Index', type: 'number', min: 1, step: 1 },
      { id: 'range', label: 'Range', type: 'number', min: 1, step: 1 },
      { id: 'random', label: 'Random', type: 'boolean' },
      { id: 'in', label: 'In', type: 'command', kind: 'sink' },
    ],
    outputs: [],
    configSchema: [
      { key: 'displayId', label: 'Displays', type: 'client-picker', defaultValue: '' },
    ],
    process: () => ({}),
  };
}

export function createCmdAggregatorNode(): NodeDefinition {
  const maxInputs = 8;
  const inputs = Array.from({ length: maxInputs }, (_, idx) => {
    const n = idx + 1;
    return { id: `in${n}`, label: `In ${n}`, type: 'command' } as const;
  });

  const flattenCommands = (value: unknown, out: unknown[]) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      for (const item of value) flattenCommands(item, out);
      return;
    }
    out.push(value);
  };

  return {
    type: 'cmd-aggregator',
    label: 'Cmd Aggregator',
    category: 'Objects',
    inputs: [...inputs],
    outputs: [{ id: 'cmd', label: 'Cmd', type: 'command' }],
    configSchema: [],
    process: (nodeInputs) => {
      const cmds: unknown[] = [];
      for (const port of inputs) {
        flattenCommands(nodeInputs[port.id], cmds);
      }
      return { cmd: cmds.length > 0 ? cmds : null };
    },
  };
}

export function createClientSensorsProcessorNode(): NodeDefinition {
  const toFiniteNumber = (value: unknown, fallback = 0): number => {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  return {
    type: 'proc-client-sensors',
    label: 'Client Sensors',
    category: 'Processors',
    inputs: [{ id: 'client', label: 'Client', type: 'client' }],
    outputs: [
      { id: 'accelX', label: 'Accel X', type: 'number' },
      { id: 'accelY', label: 'Accel Y', type: 'number' },
      { id: 'accelZ', label: 'Accel Z', type: 'number' },
      { id: 'gyroA', label: 'Gyro α', type: 'number' },
      { id: 'gyroB', label: 'Gyro β', type: 'number' },
      { id: 'gyroG', label: 'Gyro γ', type: 'number' },
      { id: 'micVol', label: 'Mic Vol', type: 'number' },
      { id: 'micLow', label: 'Mic Low', type: 'number' },
      { id: 'micHigh', label: 'Mic High', type: 'number' },
      { id: 'micBpm', label: 'Mic BPM', type: 'number' },
    ],
    configSchema: [],
    process: (inputs) => {
      const client = asRecord(inputs.client);
      const msg = client ? asRecord(client.sensors) : null;

      const out = {
        accelX: 0,
        accelY: 0,
        accelZ: 0,
        gyroA: 0,
        gyroB: 0,
        gyroG: 0,
        micVol: 0,
        micLow: 0,
        micHigh: 0,
        micBpm: 0,
      };

      if (!msg || typeof msg !== 'object') return out;

      const payload = asRecord(msg.payload) ?? {};
      switch (msg.sensorType) {
        case 'accel':
          out.accelX = toFiniteNumber(payload.x);
          out.accelY = toFiniteNumber(payload.y);
          out.accelZ = toFiniteNumber(payload.z);
          break;
        case 'gyro':
        case 'orientation':
          out.gyroA = toFiniteNumber(payload.alpha);
          out.gyroB = toFiniteNumber(payload.beta);
          out.gyroG = toFiniteNumber(payload.gamma);
          break;
        case 'mic':
          out.micVol = toFiniteNumber(payload.volume);
          out.micLow = toFiniteNumber(payload.lowEnergy);
          out.micHigh = toFiniteNumber(payload.highEnergy);
          out.micBpm = toFiniteNumber(payload.bpm);
          break;
      }

      return out;
    },
  };
}
