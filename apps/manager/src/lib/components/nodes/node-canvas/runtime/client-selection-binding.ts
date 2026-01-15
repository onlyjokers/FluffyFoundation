/**
 * Purpose: Sync `client-object` node UI + config based on index/range/random selection and picker clicks.
 */

import { get } from 'svelte/store';
import type { Readable } from 'svelte/store';
import type { Connection, GraphState, NodeInstance } from '$lib/nodes/types';
import { buildStableRandomOrder, clampInt, coerceBoolean, toFiniteNumber } from './client-utils';

type AnyAreaPlugin = { update(kind: 'node', nodeId: string): Promise<void> } | null;

type NodeEngineLike = {
  getNode(nodeId: string): NodeInstance | undefined;
  getLastComputedInputs(nodeId: string): Record<string, unknown> | null;
  updateNodeConfig(nodeId: string, patch: Record<string, unknown>): void;
  updateNodeInputValue(nodeId: string, portId: string, value: unknown): void;
  tickTime: { set(value: number): void };
};

type ManagerStateLike = { clients?: unknown[] };

type AnyRecord = Record<string, unknown>;
type InputControlLike = { min?: number; max?: number; step?: number; value?: number };

const asRecord = (value: unknown): AnyRecord | null =>
  value && typeof value === 'object' ? (value as AnyRecord) : null;

export type ClientNodeSelectionPatch = {
  index?: number;
  range?: number;
  clientId?: string;
  random?: boolean;
};

export type SendNodeOverrideFn = (
  nodeId: string,
  kind: 'input' | 'config',
  portId: string,
  value: unknown
) => void;

export interface ClientSelectionBinding {
  applyClientNodeSelection(nodeId: string, next: ClientNodeSelectionPatch): Promise<void>;
  syncClientNodesFromInputs(): void;
}

export interface CreateClientSelectionBindingOptions {
  nodeEngine: NodeEngineLike;
  graphStateStore: Readable<GraphState>;
  getGraphState: () => GraphState;
  managerState: Readable<ManagerStateLike>;
  sensorData: Readable<Map<string, AnyRecord>>;
  getAreaPlugin: () => AnyAreaPlugin;
  getNodeMap: () => Map<string, AnyRecord>;
  sendNodeOverride: SendNodeOverrideFn;
}

export function createClientSelectionBinding(opts: CreateClientSelectionBindingOptions): ClientSelectionBinding {
  const {
    nodeEngine,
    graphStateStore,
    getGraphState,
    managerState,
    sensorData,
    getAreaPlugin,
    getNodeMap,
    sendNodeOverride,
  } = opts;

  const audienceClientIdsInOrder = () =>
    (get(managerState).clients ?? [])
      .filter((client) => {
        const record = asRecord(client);
        return record?.connected !== false;
      })
      .filter((client) => {
        const record = asRecord(client);
        return String(record?.group ?? '') !== 'display';
      })
      .map((client) => {
        const record = asRecord(client);
        return record ? String(record.clientId ?? '') : '';
      })
      .filter(Boolean);

  const isInputConnected = (nodeId: string, portId: string) =>
    (getGraphState().connections ?? []).some(
      (c: Connection) =>
        String(c.targetNodeId) === String(nodeId) && String(c.targetPortId) === String(portId)
    );

  const computeClientSlice = (nodeId: string, indexRaw: number, rangeRaw: number, randomRaw: unknown) => {
    const clients = audienceClientIdsInOrder();
    if (clients.length === 0) return null;

    const total = clients.length;
    const range = clampInt(rangeRaw, 1, total);
    const index = clampInt(indexRaw, 1, total);
    const random = coerceBoolean(randomRaw, false);

    const ids: string[] = [];
    const ordered = random ? buildStableRandomOrder(nodeId, clients) : clients;
    const start = index - 1;
    for (let i = 0; i < range; i += 1) {
      ids.push(ordered[(start + i) % total]);
    }

    const firstId = ids[0] ?? '';
    return { index, range, total, maxIndex: total, ids, firstId, random };
  };

  const syncClientNodeUi = async (
    nodeId: string,
    slice: ReturnType<typeof computeClientSlice>,
    opts?: { updateInputs?: boolean; updateControls?: boolean; updateConfig?: boolean }
  ) => {
    if (!slice) return;
    const node = nodeEngine.getNode(nodeId);
    if (!node || node.type !== 'client-object') return;
    const updateInputs = opts?.updateInputs !== false;
    const updateControls = opts?.updateControls !== false;
    const updateConfig = opts?.updateConfig !== false;

    // Keep node config in sync so labels + loop deploy use the selected client.
    const config = asRecord(node.config);
    const currentClientId = typeof config?.clientId === 'string' ? String(config.clientId) : '';
    if (updateConfig) {
      if (slice.firstId && slice.firstId !== currentClientId) {
        nodeEngine.updateNodeConfig(nodeId, { clientId: slice.firstId });
      } else if (!slice.firstId && currentClientId) {
        nodeEngine.updateNodeConfig(nodeId, { clientId: '' });
      }
    }

    // Clamp + persist unconnected inputs (connected inputs are driven by upstream nodes).
    if (updateInputs) {
      if (!isInputConnected(nodeId, 'index')) nodeEngine.updateNodeInputValue(nodeId, 'index', slice.index);
      if (!isInputConnected(nodeId, 'range')) nodeEngine.updateNodeInputValue(nodeId, 'range', slice.range);
    }

    // Keep live display outputs usable even when the engine is stopped.
    const outputValues = (node.outputValues as AnyRecord) ?? {};
    outputValues.indexOut = slice.index;
    outputValues.out = {
      clientId: slice.firstId,
      sensors: (() => {
        const latest = slice.firstId ? get(sensorData)?.get?.(slice.firstId) ?? null : null;
        if (!latest) return null;
        const record = asRecord(latest);
        return record
          ? {
              sensorType: record.sensorType,
              payload: record.payload,
              serverTimestamp: record.serverTimestamp,
              clientTimestamp: record.clientTimestamp,
            }
          : null;
      })(),
    };
    node.outputValues = outputValues;
    nodeEngine.tickTime.set(Date.now());

    const areaPlugin = getAreaPlugin();
    const reteNode = getNodeMap().get(String(nodeId));
    if (!reteNode || !areaPlugin) return;

    const indexCtrl = asRecord((reteNode as AnyRecord)?.inputs?.index?.control) as InputControlLike | null;
    const rangeCtrl = asRecord((reteNode as AnyRecord)?.inputs?.range?.control) as InputControlLike | null;

    if (indexCtrl && updateControls) {
      indexCtrl.min = 1;
      indexCtrl.max = slice.maxIndex;
      indexCtrl.step = 1;
      indexCtrl.value = slice.index;
    }
    if (rangeCtrl && updateControls) {
      rangeCtrl.min = 1;
      rangeCtrl.max = slice.total;
      rangeCtrl.step = 1;
      rangeCtrl.value = slice.range;
    }

    await areaPlugin.update('node', String(nodeId));
  };

  const applyClientNodeSelection = async (nodeId: string, next: ClientNodeSelectionPatch) => {
    const clients = audienceClientIdsInOrder();
    if (clients.length === 0) return;

    const node = nodeEngine.getNode(nodeId);
    if (!node || node.type !== 'client-object') return;

    const computed = nodeEngine.getLastComputedInputs(nodeId);
    const getEffectiveInput = (portId: 'index' | 'range' | 'random'): unknown => {
      const connected = isInputConnected(nodeId, portId);
      if (connected && computed && Object.prototype.hasOwnProperty.call(computed, portId)) {
        return computed[portId];
      }
      const inputValues = node.inputValues as Record<string, unknown> | undefined;
      return inputValues?.[portId];
    };

    const currentIndexRaw = toFiniteNumber(getEffectiveInput('index'), 1);
    const currentRangeRaw = toFiniteNumber(getEffectiveInput('range'), 1);
    const currentRandomRaw = getEffectiveInput('random');

    const desiredRandom = typeof next.random === 'boolean' ? next.random : coerceBoolean(currentRandomRaw, false);

    let desiredIndex =
      typeof next.index === 'number' && Number.isFinite(next.index) ? next.index : currentIndexRaw;
    let desiredRange =
      typeof next.range === 'number' && Number.isFinite(next.range) ? next.range : currentRangeRaw;

    // Client picker binding: treat clicks as "toggle this client in the range selection" and translate them to
    // index/range updates (single source of truth per node). If index/range are externally connected, the picker
    // becomes display-only.
    if (
      typeof next.clientId === 'string' &&
      next.clientId &&
      !(typeof next.index === 'number') &&
      !(typeof next.range === 'number')
    ) {
      if (isInputConnected(nodeId, 'index') || isInputConnected(nodeId, 'range')) return;

      const total = clients.length;
      const ordered = desiredRandom ? buildStableRandomOrder(nodeId, clients) : clients;
      const clickedPos = ordered.indexOf(next.clientId);
      if (clickedPos >= 0 && total > 0) {
        const dist = (from: number, to: number) => (to - from + total) % total;
        const currentIndex = clampInt(currentIndexRaw, 1, total);
        const currentRange = clampInt(currentRangeRaw, 1, total);
        const startPos = currentIndex - 1;
        const endPos = (startPos + currentRange - 1) % total;

        const offset = dist(startPos, clickedPos);
        const isSelected = offset < currentRange;

        if (!isSelected) {
          const extendRange = offset + 1; // include clicked by extending end forward
          const shiftRange = dist(clickedPos, endPos) + 1; // include clicked by shifting start back
          if (shiftRange < extendRange) {
            desiredIndex = clickedPos + 1;
            desiredRange = shiftRange;
          } else {
            desiredIndex = currentIndex;
            desiredRange = extendRange;
          }
        } else {
          const prefixLen = offset; // clients before clicked in current selection
          const suffixLen = dist(clickedPos, endPos); // clients after clicked in current selection

          if (prefixLen === 0 && suffixLen === 0) {
            // Can't represent an empty selection; move the window forward so the clicked client is no longer selected
            // while keeping range=1.
            desiredIndex = ((startPos + 1) % total) + 1;
            desiredRange = 1;
          } else if (suffixLen > prefixLen) {
            desiredIndex = ((clickedPos + 1) % total) + 1;
            desiredRange = suffixLen;
          } else {
            desiredIndex = currentIndex;
            desiredRange = prefixLen;
          }
        }
      }
    }

    const slice = computeClientSlice(nodeId, desiredIndex, desiredRange, desiredRandom);
    if (!slice) return;

    // When the picker drives index/range, also forward overrides to any deployed loop/patch runtime.
    // (Input controls already do this via their own change handlers.)
    const pickerOnlyChange =
      typeof next.clientId === 'string' &&
      next.clientId &&
      typeof next.index !== 'number' &&
      typeof next.range !== 'number' &&
      typeof next.random !== 'boolean';
    if (pickerOnlyChange) {
      sendNodeOverride(nodeId, 'input', 'index', slice.index);
      sendNodeOverride(nodeId, 'input', 'range', slice.range);
    }

    await syncClientNodeUi(nodeId, slice);
  };

  const syncClientNodesFromInputs = () => {
    const clients = audienceClientIdsInOrder();
    const engineState = get(graphStateStore);
    for (const node of engineState.nodes ?? []) {
      if (String(node.type ?? '') !== 'client-object') continue;
      const nodeId = String(node.id ?? '');
      const nodeInstance = nodeEngine.getNode(nodeId);
      if (!nodeInstance) continue;

      if (clients.length === 0) {
        const config = asRecord(nodeInstance?.config);
        const configuredClientId =
          typeof config?.clientId === 'string' ? String(config.clientId) : '';
        if (configuredClientId) {
          nodeEngine.updateNodeConfig(nodeId, { clientId: '' });
        }
        if (nodeInstance?.outputValues) {
          const outputValues = (nodeInstance.outputValues as AnyRecord) ?? {};
          outputValues.out = { clientId: '', sensors: null };
          nodeInstance.outputValues = outputValues;
          nodeEngine.tickTime.set(Date.now());
        }
        continue;
      }
      const computed = nodeEngine.getLastComputedInputs(nodeId);
      const useComputedIndex = isInputConnected(nodeId, 'index');
      const useComputedRange = isInputConnected(nodeId, 'range');
      const useComputedRandom = isInputConnected(nodeId, 'random');
      const indexRaw = toFiniteNumber(
        useComputedIndex && computed && Object.prototype.hasOwnProperty.call(computed, 'index')
          ? computed.index
          : (nodeInstance?.inputValues as Record<string, unknown> | undefined)?.index,
        1
      );
      const rangeRaw = toFiniteNumber(
        useComputedRange && computed && Object.prototype.hasOwnProperty.call(computed, 'range')
          ? computed.range
          : (nodeInstance?.inputValues as Record<string, unknown> | undefined)?.range,
        1
      );
      const randomRaw =
        useComputedRandom && computed && Object.prototype.hasOwnProperty.call(computed, 'random')
          ? computed.random
          : (nodeInstance?.inputValues as Record<string, unknown> | undefined)?.random;
      const slice = computeClientSlice(nodeId, indexRaw, rangeRaw, randomRaw);
      if (!slice) continue;
      void syncClientNodeUi(nodeId, slice);
    }
  };

  return { applyClientNodeSelection, syncClientNodesFromInputs };
}
