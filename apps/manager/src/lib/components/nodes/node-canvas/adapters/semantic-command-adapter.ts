/**
 * Purpose: Canvas adapters for semantic command dispatch.
 */

import {
  type SemanticActor,
  type SemanticCommand,
  type SemanticCommandBus,
} from '@shugu/node-core';
import type { SemanticCommandPayload } from '@shugu/protocol';
import type { ManagerSDK } from '@shugu/sdk-manager';
import type { Connection as EngineConnection, NodeInstance } from '$lib/nodes/types';

export type CanvasSemanticCommandAdapter = {
  addNode: (node: NodeInstance) => boolean;
  connect: (connection: EngineConnection) => boolean;
  removeNode: (nodeId: string) => boolean;
  setNodeParams: (nodeId: string, params: Record<string, unknown>) => boolean;
  dispatchForFixture: (command: SemanticCommand) => boolean;
};

export function createCanvasSemanticCommandAdapter(opts: {
  commandBus: SemanticCommandBus | (() => SemanticCommandBus);
  actor?: SemanticActor;
  onCommand?: (command: SemanticCommand) => void;
  onError?: (message: string) => void;
}): CanvasSemanticCommandAdapter {
  const actor = opts.actor ?? { id: 'canvas', role: 'operator' };

  const dispatch = (command: SemanticCommand): boolean => {
    const commandBus = typeof opts.commandBus === 'function' ? opts.commandBus() : opts.commandBus;
    const result = commandBus.dispatch({ actor, command });
    if (!result.ok) {
      opts.onError?.(result.message);
      return false;
    }
    opts.onCommand?.(result.command);
    return true;
  };

  return {
    addNode: (node) => dispatch({ type: 'node.add', node }),
    connect: (connection) => dispatch({ type: 'node.connect', connection }),
    removeNode: (nodeId) => dispatch({ type: 'node.remove', nodeId }),
    setNodeParams: (nodeId, params) => dispatch({ type: 'node.params.update', nodeId, params }),
    dispatchForFixture: dispatch,
  };
}

type CanvasSemanticSdk = Pick<ManagerSDK, 'sendSemanticCommand'>;

function semanticPayloadFromCommand(command: SemanticCommand): SemanticCommandPayload {
  const { type, ...rest } = command;
  return { kind: type, ...rest };
}

function canvasRequestId(command: SemanticCommand): string {
  if (command.type === 'node.add') return `canvas:node.add:${command.node.id}`;
  if (command.type === 'node.connect') return `canvas:node.connect:${command.connection.id}`;
  if (command.type === 'node.remove') return `canvas:node.remove:${command.nodeId}`;
  if (command.type === 'node.params.update') return `canvas:node.params.update:${command.nodeId}`;
  return `canvas:${command.type}`;
}

export function createNodeCanvasSemanticCommands(input: {
  getSDK: () => CanvasSemanticSdk | null;
  onError?: (message: string) => void;
}): CanvasSemanticCommandAdapter {
  const dispatch = (command: SemanticCommand): boolean => {
    const sdk = input.getSDK();
    if (!sdk) {
      input.onError?.('Manager SDK is not connected');
      return false;
    }
    sdk.sendSemanticCommand({
      requestId: canvasRequestId(command),
      command: semanticPayloadFromCommand(command),
    });
    return true;
  };

  return {
    addNode: (node) => dispatch({ type: 'node.add', node }),
    connect: (connection) => dispatch({ type: 'node.connect', connection }),
    removeNode: (nodeId) => dispatch({ type: 'node.remove', nodeId }),
    setNodeParams: (nodeId, params) => dispatch({ type: 'node.params.update', nodeId, params }),
    dispatchForFixture: dispatch,
  };
}
