/**
 * Purpose: Manager-owned semantic command bridge shared by Canvas, CLI, and future AI operators.
 */

import {
  createSemanticCommandBus,
  type NodeRegistry,
  type SemanticActor,
  type SemanticCommand,
  type SemanticCommandBus,
  type SemanticCommandResult,
  type SemanticPartition,
} from '@shugu/node-core';
import type { Connection as EngineConnection, NodeInstance } from '$lib/nodes/types';
import type { Readable } from 'svelte/store';
import { get } from 'svelte/store';

export type ManagerSemanticBridgeRuntime = {
  nodeEngine: {
    exportGraph: () => { nodes: NodeInstance[]; connections: EngineConnection[] };
    addNode: (node: NodeInstance) => void;
    addConnection: (connection: EngineConnection) => void | boolean;
    removeConnection: (connectionId: string) => void;
    removeNode: (nodeId: string) => void;
    updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
    updateNodeInputValue: (nodeId: string, portId: string, value: unknown) => void;
    replaceNodeInputValues?: (nodeId: string, inputValues: Record<string, unknown>) => void;
    lastError?: { set?: (message: string | null) => void };
  };
  nodeRegistry: NodeRegistry;
  getGroups: () => Array<Record<string, unknown>>;
  getPartitions: () => SemanticPartition[];
  isRunningStore: Readable<boolean>;
  lastErrorStore: Readable<string | null>;
};

export type ManagerSemanticBridge = {
  addNode: (node: NodeInstance, actor?: SemanticActor) => SemanticCommandResult;
  connect: (connection: EngineConnection, actor?: SemanticActor) => SemanticCommandResult;
  disconnect: (connectionId: string, actor?: SemanticActor) => SemanticCommandResult;
  removeNode: (nodeId: string, actor?: SemanticActor) => SemanticCommandResult;
  setNodeParams: (
    nodeId: string,
    params: Record<string, unknown>,
    actor?: SemanticActor
  ) => SemanticCommandResult;
  setNodeInputs: (
    nodeId: string,
    inputValues: Record<string, unknown>,
    actor?: SemanticActor
  ) => SemanticCommandResult;
  dispatch: (input: {
    actor: SemanticActor;
    command: SemanticCommand;
    dryRun?: boolean;
  }) => SemanticCommandResult;
  getSnapshot: () => ReturnType<SemanticCommandBus['getSnapshot']>;
};

const defaultCanvasActor: SemanticActor = { id: 'canvas', role: 'operator' };

const runtimeStatusFor = (runtime: ManagerSemanticBridgeRuntime) => {
  const partitions = runtime.getPartitions();
  return {
    running: get(runtime.isRunningStore),
    deployedPartitionIds: partitions
      .filter((partition) => partition.status === 'deployed')
      .map((partition) => partition.id),
  };
};

export function createManagerSemanticBridge(
  runtime: ManagerSemanticBridgeRuntime
): ManagerSemanticBridge {
  let semanticRevision = 0;

  const createBus = () =>
    createSemanticCommandBus({
      graph: runtime.nodeEngine.exportGraph(),
      definitions: runtime.nodeRegistry.list(),
      groups: runtime.getGroups(),
      partitions: runtime.getPartitions(),
      runtimeStatus: runtimeStatusFor(runtime),
      errors: get(runtime.lastErrorStore)
        ? [{ code: 'last-error', message: String(get(runtime.lastErrorStore)) }]
        : [],
      permissions: [
        {
          actorId: 'canvas',
          operations: ['node.add', 'node.connect', 'node.disconnect', 'node.params.update', 'node.inputs.update', 'node.remove'],
        },
        {
          actorId: 'cli',
          operations: ['node.add', 'node.connect', 'node.disconnect', 'node.params.update', 'node.inputs.update', 'node.remove'],
        },
      ],
      revision: semanticRevision,
    });

  const applyAcceptedCommand = (command: SemanticCommand) => {
    semanticRevision += 1;
    if (command.type === 'node.add') runtime.nodeEngine.addNode(command.node);
    if (command.type === 'node.connect') runtime.nodeEngine.addConnection(command.connection);
    if (command.type === 'node.disconnect') runtime.nodeEngine.removeConnection(command.connectionId);
    if (command.type === 'node.remove') runtime.nodeEngine.removeNode(command.nodeId);
    if (command.type === 'node.params.update') runtime.nodeEngine.updateNodeConfig(command.nodeId, command.params);
    if (command.type === 'node.inputs.update') {
      for (const [portId, value] of Object.entries(command.inputValues)) {
        runtime.nodeEngine.updateNodeInputValue(command.nodeId, portId, value);
      }
    }
  };

  const dispatch: ManagerSemanticBridge['dispatch'] = ({ actor, command, dryRun = false }) => {
    const result = createBus().dispatch({ actor, command, dryRun });
    if (!result.ok) {
      runtime.nodeEngine.lastError?.set?.(result.message);
      return result;
    }
    if (!dryRun) applyAcceptedCommand(result.command);
    return result;
  };

  return {
    addNode: (node, actor = defaultCanvasActor) =>
      dispatch({ actor, command: { type: 'node.add', node } }),
    connect: (connection, actor = defaultCanvasActor) =>
      dispatch({ actor, command: { type: 'node.connect', connection } }),
    disconnect: (connectionId, actor = defaultCanvasActor) =>
      dispatch({ actor, command: { type: 'node.disconnect', connectionId } }),
    removeNode: (nodeId, actor = defaultCanvasActor) =>
      dispatch({ actor, command: { type: 'node.remove', nodeId } }),
    setNodeParams: (nodeId, params, actor = defaultCanvasActor) =>
      dispatch({ actor, command: { type: 'node.params.update', nodeId, params } }),
    setNodeInputs: (nodeId, inputValues, actor = defaultCanvasActor) =>
      dispatch({ actor, command: { type: 'node.inputs.update', nodeId, inputValues } }),
    dispatch,
    getSnapshot: () => createBus().getSnapshot(),
  };
}
