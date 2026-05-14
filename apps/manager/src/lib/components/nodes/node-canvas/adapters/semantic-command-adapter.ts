/**
 * Purpose: Thin Canvas adapter over the Manager-owned semantic command bridge.
 */

import {
  type SemanticActor,
  type SemanticCommand,
  type SemanticCommandBus,
} from '@shugu/node-core';
import type { Connection as EngineConnection, NodeInstance } from '$lib/nodes/types';
import {
  createManagerSemanticBridge,
  type ManagerSemanticBridgeRuntime,
} from '../../../../semantic/manager-semantic-bridge';

export type CanvasSemanticCommandAdapter = {
  addNode: (node: NodeInstance) => boolean;
  connect: (connection: EngineConnection) => boolean;
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
    setNodeParams: (nodeId, params) => dispatch({ type: 'node.params.update', nodeId, params }),
    dispatchForFixture: dispatch,
  };
}

export function createNodeCanvasSemanticCommands(
  runtime: ManagerSemanticBridgeRuntime
): CanvasSemanticCommandAdapter {
  const bridge = createManagerSemanticBridge(runtime);

  return {
    addNode: (node) => bridge.addNode(node).ok,
    connect: (connection) => bridge.connect(connection).ok,
    setNodeParams: (nodeId, params) => bridge.setNodeParams(nodeId, params).ok,
    dispatchForFixture: (command) => bridge.dispatch({ actor: { id: 'canvas', role: 'operator' }, command }).ok,
  };
}
