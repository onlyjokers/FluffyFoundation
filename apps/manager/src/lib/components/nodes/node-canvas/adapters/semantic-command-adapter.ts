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
import type { Connection as EngineConnection, GraphState, NodeInstance } from '$lib/nodes/types';
import { patchNodeGraphLayoutPosition } from '$lib/project/nodeGraphLayout';

export type CanvasSemanticCommandAdapter = {
  addNode: (node: NodeInstance) => boolean;
  connect: (connection: EngineConnection) => boolean;
  disconnect: (connectionId: string) => boolean;
  removeNode: (nodeId: string) => boolean;
  setNodeParams: (nodeId: string, params: Record<string, unknown>) => boolean;
  setNodeInputs: (nodeId: string, inputValues: Record<string, unknown>) => boolean;
  replaceGraph: (graph: GraphState) => boolean;
  dispatch: (command: SemanticCommand) => boolean;
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
    disconnect: (connectionId) => dispatch({ type: 'node.disconnect', connectionId }),
    removeNode: (nodeId) => dispatch({ type: 'node.remove', nodeId }),
    setNodeParams: (nodeId, params) => dispatch({ type: 'node.params.update', nodeId, params }),
    setNodeInputs: (nodeId, inputValues) =>
      dispatch({ type: 'node.inputs.update', nodeId, inputValues } as SemanticCommand),
    replaceGraph: (graph) => dispatch({ type: 'graph.replace', graph }),
    dispatch,
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
  if (command.type === 'node.disconnect') return `canvas:node.disconnect:${command.connectionId}`;
  if (command.type === 'node.remove') return `canvas:node.remove:${command.nodeId}`;
  if (command.type === 'node.params.update') return `canvas:node.params.update:${command.nodeId}`;
  if (command.type === 'node.inputs.update') return `canvas:node.inputs.update:${command.nodeId}`;
  if (command.type === 'graph.replace') return `canvas:graph.replace:${Date.now()}`;
  return `canvas:${command.type}`;
}

export function createNodeCanvasSemanticCommands(input: {
  getSDK: () => CanvasSemanticSdk | null;
  onError?: (message: string) => void;
  onLocalCommand?: (command: SemanticCommand, requestId: string) => boolean | void;
  onPendingCommand?: (command: SemanticCommand, requestId: string) => void;
}): CanvasSemanticCommandAdapter {
  const shouldApplyLocally = (command: SemanticCommand): boolean =>
    command.type === 'node.add' ||
    command.type === 'node.connect' ||
    command.type === 'node.disconnect' ||
    command.type === 'node.remove' ||
    command.type === 'graph.replace';

  const dispatch = (command: SemanticCommand): boolean => {
    const sdk = input.getSDK();
    if (!sdk) {
      input.onError?.('Manager SDK is not connected');
      return false;
    }
    const requestId = canvasRequestId(command);
    if (shouldApplyLocally(command)) {
      const locallyAccepted = input.onLocalCommand?.(command, requestId);
      if (locallyAccepted === false) return false;
    }
    sdk.sendSemanticCommand({
      requestId,
      command: semanticPayloadFromCommand(command),
    });
    input.onPendingCommand?.(command, requestId);
    return true;
  };

  return {
    addNode: (node) => {
      patchNodeGraphLayoutPosition(String(node.id), node.position);
      return dispatch({ type: 'node.add', node });
    },
    connect: (connection) => dispatch({ type: 'node.connect', connection }),
    disconnect: (connectionId) => dispatch({ type: 'node.disconnect', connectionId }),
    removeNode: (nodeId) => dispatch({ type: 'node.remove', nodeId }),
    setNodeParams: (nodeId, params) => dispatch({ type: 'node.params.update', nodeId, params }),
    setNodeInputs: (nodeId, inputValues) =>
      dispatch({ type: 'node.inputs.update', nodeId, inputValues } as SemanticCommand),
    replaceGraph: (graph) => dispatch({ type: 'graph.replace', graph }),
    dispatch,
    dispatchForFixture: dispatch,
  };
}
