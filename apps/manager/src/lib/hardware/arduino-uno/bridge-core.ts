/**
 * Purpose: Pure Arduino UNO bridge planning from Manager node graph state to serial commands.
 */
import {
  ARDUINO_UNO_OBJECT_NODE_TYPE,
  ARDUINO_UNO_DIGITAL_NODE_TYPE,
  ARDUINO_UNO_PWM_NODE_TYPE,
  STATIC_SERIAL_PLAYER_NODE_TYPE,
  buildArduinoUnoDigitalPayload,
  buildArduinoUnoPwmPayload,
  commandForPayload,
  resetCommandForPreviousPin,
  type ArduinoUnoPayload,
} from '@shugu/arduino-uno-plugin';

import type { Connection, GraphState, NodeInstance } from '$lib/nodes/types';

export type ArduinoUnoBridgeActive = {
  action: ArduinoUnoPayload['action'];
  pin: number;
  signature: string;
};

export type ArduinoUnoBridgeCommand = {
  nodeId: string;
  command: string;
  reason: 'write' | 'reset';
};

export type ArduinoUnoBridgeError = {
  nodeId: string;
  message: string;
};

export type ArduinoUnoSerialRoute = {
  arduinoId: string;
  payload: ArduinoUnoPayload;
};

export type CollectArduinoUnoPayloadsInput = {
  graph: Pick<GraphState, 'nodes'>;
  getComputedInputs: (nodeId: string) => Record<string, unknown> | null | undefined;
};

export type ResolveArduinoUnoDeviceTargetsInput = {
  graph: Pick<GraphState, 'nodes' | 'connections'>;
  nodeId: string;
  arduinoIdsInOrder: () => string[];
  getComputedInputs: (nodeId: string) => Record<string, unknown> | null | undefined;
};

export type CollectArduinoUnoSerialRoutesInput = {
  graph: Pick<GraphState, 'nodes' | 'connections'>;
  getComputedInputs: (nodeId: string) => Record<string, unknown> | null | undefined;
  arduinoIdsInOrder: () => string[];
};

function payloadSignature(payload: ArduinoUnoPayload): string {
  const value = payload.action === 'pwm' ? payload.value.toFixed(3) : String(payload.value);
  return `${payload.action}:${payload.pin}:${value}`;
}

function nodeInputs(node: NodeInstance, computed: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return { ...(node.inputValues ?? {}), ...(computed ?? {}) };
}

const hasOwn = (record: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key);

function hashStringDjb2(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'string' ? Number(value) : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const next = Math.floor(n);
  return Math.max(min, Math.min(max, next));
}

function coerceBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value >= 0.5 : false;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (!s) return false;
    if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true;
    if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false;
    return true;
  }
  return false;
}

function buildStableArduinoOrder(nodeId: string, ids: string[]): string[] {
  const keyed = ids.map((id) => ({ id, score: hashStringDjb2(`${nodeId}|${id}`) }));
  keyed.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
  return keyed.map((entry) => entry.id);
}

function nodeById(graph: Pick<GraphState, 'nodes'>): Map<string, NodeInstance> {
  return new Map((graph.nodes ?? []).map((node) => [String(node.id), node]));
}

function incomingTo(graph: Pick<GraphState, 'connections'>, nodeId: string, portId: string): Connection[] {
  return (graph.connections ?? []).filter(
    (connection) =>
      String(connection.targetNodeId ?? '') === nodeId &&
      String(connection.targetPortId ?? '') === portId
  );
}

function outgoingFrom(graph: Pick<GraphState, 'connections'>, nodeId: string, portId: string): Connection[] {
  return (graph.connections ?? []).filter(
    (connection) =>
      String(connection.sourceNodeId ?? '') === nodeId &&
      String(connection.sourcePortId ?? '') === portId
  );
}

function hasInputValue(node: NodeInstance, portId: 'index' | 'range' | 'random'): boolean {
  return hasOwn(node.inputValues ?? {}, portId);
}

function buildPayloadFromNode(
  node: NodeInstance,
  getComputedInputs: CollectArduinoUnoPayloadsInput['getComputedInputs']
): ArduinoUnoPayload {
  const values = nodeInputs(node, getComputedInputs(String(node.id)));
  return node.type === ARDUINO_UNO_PWM_NODE_TYPE
    ? buildArduinoUnoPwmPayload({
        nodeId: node.id,
        value: values.value,
        pin: values.pin,
      })
    : buildArduinoUnoDigitalPayload({
        nodeId: node.id,
        value: values.value,
        pin: values.pin,
      });
}

export function collectArduinoUnoPayloads(input: CollectArduinoUnoPayloadsInput): {
  payloads: ArduinoUnoPayload[];
  errors: ArduinoUnoBridgeError[];
} {
  const payloads: ArduinoUnoPayload[] = [];
  const errors: ArduinoUnoBridgeError[] = [];

  for (const node of input.graph.nodes ?? []) {
    if (node.type !== ARDUINO_UNO_PWM_NODE_TYPE && node.type !== ARDUINO_UNO_DIGITAL_NODE_TYPE) continue;

    try {
      payloads.push(buildPayloadFromNode(node, input.getComputedInputs));
    } catch (error) {
      errors.push({
        nodeId: String(node.id),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { payloads, errors };
}

export function resolveArduinoUnoDeviceTargets(
  input: ResolveArduinoUnoDeviceTargetsInput
): { explicit: boolean; ids: string[] } {
  const arduinoIds = input.arduinoIdsInOrder().map(String).filter(Boolean);
  if (arduinoIds.length === 0) return { explicit: false, ids: [] };

  const node = nodeById(input.graph).get(input.nodeId);
  if (!node || node.type !== ARDUINO_UNO_OBJECT_NODE_TYPE) {
    return { explicit: false, ids: arduinoIds };
  }

  const computed = input.getComputedInputs(input.nodeId) ?? null;
  const isPortConnected = (portId: 'index' | 'range' | 'random'): boolean =>
    incomingTo(input.graph, input.nodeId, portId).length > 0;
  const hasComputedInput = (portId: 'index' | 'range' | 'random'): boolean =>
    Boolean(computed && hasOwn(computed, portId));
  const hasExplicitRoutingInput = (['index', 'range', 'random'] as const).some(
    (portId) => isPortConnected(portId) || hasComputedInput(portId) || hasInputValue(node, portId)
  );

  if (!hasExplicitRoutingInput) return { explicit: false, ids: arduinoIds };

  const getEffectiveInput = (portId: 'index' | 'range' | 'random'): unknown => {
    if (isPortConnected(portId) && computed && hasOwn(computed, portId)) return computed[portId];
    return node.inputValues?.[portId];
  };

  const total = arduinoIds.length;
  const random = coerceBoolean(getEffectiveInput('random'));
  const ordered = random ? buildStableArduinoOrder(input.nodeId, arduinoIds) : arduinoIds;
  const index = clampInt(getEffectiveInput('index'), 1, 1, total);
  const range = clampInt(getEffectiveInput('range'), 1, 1, total);
  const ids: string[] = [];
  const start = index - 1;
  for (let i = 0; i < range; i += 1) ids.push(ordered[(start + i) % total]);
  return { explicit: true, ids };
}

export function collectArduinoUnoSerialRoutes(input: CollectArduinoUnoSerialRoutesInput): {
  routes: ArduinoUnoSerialRoute[];
  errors: ArduinoUnoBridgeError[];
} {
  const nodesById = nodeById(input.graph);
  const routes: ArduinoUnoSerialRoute[] = [];
  const errors: ArduinoUnoBridgeError[] = [];

  for (const player of input.graph.nodes ?? []) {
    if (player.type !== STATIC_SERIAL_PLAYER_NODE_TYPE) continue;

    const arduinoTargets = outgoingFrom(input.graph, String(player.id), 'cmd')
      .filter((connection) => String(connection.targetPortId ?? '') === 'in')
      .map((connection) => nodesById.get(String(connection.targetNodeId ?? '')))
      .filter((node): node is NodeInstance => Boolean(node) && node?.type === ARDUINO_UNO_OBJECT_NODE_TYPE);

    if (arduinoTargets.length === 0) continue;

    const payloads: ArduinoUnoPayload[] = [];
    for (const connection of incomingTo(input.graph, String(player.id), 'in')) {
      const source = nodesById.get(String(connection.sourceNodeId ?? ''));
      if (!source || (source.type !== ARDUINO_UNO_PWM_NODE_TYPE && source.type !== ARDUINO_UNO_DIGITAL_NODE_TYPE)) {
        continue;
      }
      try {
        payloads.push(buildPayloadFromNode(source, input.getComputedInputs));
      } catch (error) {
        errors.push({
          nodeId: String(source.id),
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    for (const arduino of arduinoTargets) {
      const resolved = resolveArduinoUnoDeviceTargets({
        graph: input.graph,
        nodeId: String(arduino.id),
        arduinoIdsInOrder: input.arduinoIdsInOrder,
        getComputedInputs: input.getComputedInputs,
      });

      for (const arduinoId of resolved.ids) {
        for (const payload of payloads) routes.push({ arduinoId, payload });
      }
    }
  }

  for (const arduino of input.graph.nodes ?? []) {
    if (arduino.type !== ARDUINO_UNO_OBJECT_NODE_TYPE) continue;

    const payloads: ArduinoUnoPayload[] = [];
    for (const connection of incomingTo(input.graph, String(arduino.id), 'in')) {
      const source = nodesById.get(String(connection.sourceNodeId ?? ''));
      if (!source || (source.type !== ARDUINO_UNO_PWM_NODE_TYPE && source.type !== ARDUINO_UNO_DIGITAL_NODE_TYPE)) {
        continue;
      }
      try {
        payloads.push(buildPayloadFromNode(source, input.getComputedInputs));
      } catch (error) {
        errors.push({
          nodeId: String(source.id),
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (payloads.length === 0) continue;

    const resolved = resolveArduinoUnoDeviceTargets({
      graph: input.graph,
      nodeId: String(arduino.id),
      arduinoIdsInOrder: input.arduinoIdsInOrder,
      getComputedInputs: input.getComputedInputs,
    });

    for (const arduinoId of resolved.ids) {
      for (const payload of payloads) routes.push({ arduinoId, payload });
    }
  }

  return { routes, errors };
}

export function diffArduinoUnoBridgeCommands(
  previousActive: ReadonlyMap<string, ArduinoUnoBridgeActive>,
  nextPayloads: ArduinoUnoPayload[]
): { commands: ArduinoUnoBridgeCommand[]; nextActive: Map<string, ArduinoUnoBridgeActive> } {
  const commands: ArduinoUnoBridgeCommand[] = [];
  const nextActive = new Map<string, ArduinoUnoBridgeActive>();

  for (const payload of nextPayloads) {
    const nodeId = String(payload.nodeId);
    const signature = payloadSignature(payload);
    const previous = previousActive.get(nodeId);
    nextActive.set(nodeId, {
      action: payload.action,
      pin: payload.pin,
      signature,
    });

    if (previous && previous.pin !== payload.pin) {
      commands.push({
        nodeId,
        command: resetCommandForPreviousPin({ mode: previous.action, pin: previous.pin }),
        reason: 'reset',
      });
    }

    if (!previous || previous.signature !== signature) {
      commands.push({
        nodeId,
        command: commandForPayload(payload),
        reason: 'write',
      });
    }
  }

  for (const [nodeId, previous] of previousActive) {
    if (nextActive.has(nodeId)) continue;
    commands.push({
      nodeId,
      command: resetCommandForPreviousPin({ mode: previous.action, pin: previous.pin }),
      reason: 'reset',
    });
  }

  return { commands, nextActive };
}
