/**
 * Purpose: Pure Arduino UNO bridge planning from Manager node graph state to serial commands.
 */
import {
  ARDUINO_UNO_DIGITAL_NODE_TYPE,
  ARDUINO_UNO_PWM_NODE_TYPE,
  buildArduinoUnoDigitalPayload,
  buildArduinoUnoPwmPayload,
  commandForPayload,
  resetCommandForPreviousPin,
  type ArduinoUnoPayload,
} from '@shugu/arduino-uno-plugin';

import type { GraphState, NodeInstance } from '$lib/nodes/types';

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

export type CollectArduinoUnoPayloadsInput = {
  graph: Pick<GraphState, 'nodes'>;
  getComputedInputs: (nodeId: string) => Record<string, unknown> | null | undefined;
};

function payloadSignature(payload: ArduinoUnoPayload): string {
  const value = payload.action === 'pwm' ? payload.value.toFixed(3) : String(payload.value);
  return `${payload.action}:${payload.pin}:${value}`;
}

function nodeInputs(node: NodeInstance, computed: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return { ...(node.inputValues ?? {}), ...(computed ?? {}) };
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
      const values = nodeInputs(node, input.getComputedInputs(String(node.id)));
      const payload =
        node.type === ARDUINO_UNO_PWM_NODE_TYPE
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
      payloads.push(payload);
    } catch (error) {
      errors.push({
        nodeId: String(node.id),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { payloads, errors };
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
