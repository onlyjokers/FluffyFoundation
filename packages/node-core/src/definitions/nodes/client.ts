/**
 * Purpose: Client selection, routing, and sensor processing node definitions.
 */
import type { ControlAction, ControlPayload } from '@shugu/protocol';

import type { NodeDefinition } from '../../types.js';
import type { ClientObject, ClientObjectDeps, ClientSensorMessage, NodeCommand } from '../types.js';
import { selectClientIdsForNode } from '../client-selection.js';
import { asRecord, getArrayValue, getNumberValue, getStringValue } from './node-definition-utils.js';

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

export function createClientObjectNode(deps: ClientObjectDeps): NodeDefinition {
  return {
    type: 'client-object',
    label: 'Client',
    category: 'Objects',
    inputs: [
      { id: 'loadIndexs', label: 'Load Indexs', type: 'array' },
      { id: 'index', label: 'Index', type: 'number', defaultValue: 1, min: 1, step: 1 },
      { id: 'range', label: 'Range', type: 'number', defaultValue: 1, min: 1, step: 1 },
      { id: 'random', label: 'Random', type: 'boolean', defaultValue: false },
      { id: 'in', label: 'In', type: 'command', kind: 'sink' },
    ],
    outputs: [
      { id: 'out', label: 'Out', type: 'client' },
      { id: 'indexOut', label: 'Index Out', type: 'number' },
      { id: 'indexs', label: 'Indexs', type: 'array' },
      { id: 'imageOut', label: 'Image Out', type: 'image' },
    ],
    configSchema: [{ key: 'clientId', label: 'Clients', type: 'client-picker', defaultValue: '' }],
    process: (inputs, config, context) => {
      const configured = typeof config.clientId === 'string' ? String(config.clientId) : '';

      const available = deps.getAllClientIds?.() ?? [];
      const loadInds = inputs.loadIndexs;
      const loadedIds = Array.isArray(loadInds)
        ? loadInds.map(String).filter((id) => available.includes(id))
        : [];

      const selection =
        loadedIds.length > 0
          ? { index: 1, selectedIds: loadedIds }
          : selectClientIdsForNode(context.nodeId, available, {
              index: inputs.index,
              range: inputs.range,
              random: inputs.random,
            });

      const fallbackSelected = deps.getSelectedClientIds?.() ?? [];
      const primaryClientId =
        selection.selectedIds[0] ?? fallbackSelected[0] ?? deps.getClientId() ?? configured;

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
      const out: ClientObject = { clientId: primaryClientId, sensors };

      const imageOut =
        typeof deps.getImageForClientId === 'function' && primaryClientId
          ? deps.getImageForClientId(primaryClientId)
          : null;
      return { out, indexOut: selection.index, indexs: selection.selectedIds, imageOut };
    },
    onSink: (inputs, config, context) => {
      const configured = typeof config.clientId === 'string' ? String(config.clientId) : '';

      const available = deps.getAllClientIds?.() ?? [];
      const loadInds = getArrayValue(inputs.loadIndexs);
      const loadedIds = loadInds ? loadInds.map(String).filter((id) => available.includes(id)) : [];

      const selection =
        loadedIds.length > 0
          ? { index: 1, selectedIds: loadedIds }
          : selectClientIdsForNode(context.nodeId, available, {
              index: inputs.index,
              range: inputs.range,
              random: inputs.random,
            });

      const fallbackSelected = deps.getSelectedClientIds?.() ?? [];
      const fallbackSingle = deps.getClientId() ?? configured;
      const targets =
        selection.selectedIds.length > 0
          ? selection.selectedIds
          : fallbackSelected.length > 0
            ? fallbackSelected
            : fallbackSingle
              ? [fallbackSingle]
              : [];
      if (targets.length === 0) return;

      const raw = inputs.in;
      const commands = (Array.isArray(raw) ? raw : [raw]) as unknown[];
      for (const cmd of commands) {
        const record = asRecord(cmd);
        if (!record) continue;
        const action = getStringValue(record.action) as ControlAction | undefined;
        if (!action) continue;
        const next: NodeCommand = {
          action,
          payload: (record.payload ?? {}) as ControlPayload,
          executeAt: getNumberValue(record.executeAt) ?? undefined,
        };

        for (const clientId of targets) {
          if (!clientId) continue;
          if (deps.executeCommandForClientId) deps.executeCommandForClientId(clientId, next);
          else deps.executeCommand(next);
        }
      }
    },
    onDisable: (inputs, config, context) => {
      const configured = typeof config.clientId === 'string' ? String(config.clientId) : '';

      const available = deps.getAllClientIds?.() ?? [];
      const loadInds = getArrayValue(inputs.loadIndexs);
      const loadedIds = loadInds ? loadInds.map(String).filter((id) => available.includes(id)) : [];

      const selection =
        loadedIds.length > 0
          ? { index: 1, selectedIds: loadedIds }
          : selectClientIdsForNode(context.nodeId, available, {
              index: inputs.index,
              range: inputs.range,
              random: inputs.random,
            });

      const fallbackSelected = deps.getSelectedClientIds?.() ?? [];
      const fallbackSingle = deps.getClientId() ?? configured;
      const targets =
        selection.selectedIds.length > 0
          ? selection.selectedIds
          : fallbackSelected.length > 0
            ? fallbackSelected
            : fallbackSingle
              ? [fallbackSingle]
              : [];
      if (targets.length === 0) return;

      const send = (clientId: string, cmd: NodeCommand) => {
        if (!clientId) return;
        if (deps.executeCommandForClientId) deps.executeCommandForClientId(clientId, cmd);
        else deps.executeCommand(cmd);
      };

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
