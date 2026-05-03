/**
 * Purpose: Translate Canvas semantic gestures into FF-09 command-bus commands.
 */

import {
  createSemanticCommandBus,
  type NodeRegistry,
  type SemanticActor,
  type SemanticCommand,
  type SemanticCommandBus,
  type SemanticPartition,
} from '@shugu/node-core';
import type { Connection as EngineConnection, NodeInstance } from '$lib/nodes/types';
import type { Readable } from 'svelte/store';
import { get } from 'svelte/store';

export type CanvasSemanticCommandAdapter = {
  addNode: (node: NodeInstance) => boolean;
  connect: (connection: EngineConnection) => boolean;
  dispatchForFixture: (command: SemanticCommand) => boolean;
};

export type CanvasSemanticCommandRuntime = {
  nodeEngine: {
    exportGraph: () => { nodes: NodeInstance[]; connections: EngineConnection[] };
    addNode: (node: NodeInstance) => void;
    addConnection: (connection: EngineConnection) => void;
    lastError?: { set?: (message: string | null) => void };
  };
  nodeRegistry: NodeRegistry;
  getGroups: () => Array<Record<string, unknown>>;
  getPartitions: () => SemanticPartition[];
  isRunningStore: Readable<boolean>;
  lastErrorStore: Readable<string | null>;
};

const runtimeStatusFor = (runtime: CanvasSemanticCommandRuntime) => {
  const partitions = runtime.getPartitions();
  return {
    running: get(runtime.isRunningStore),
    deployedPartitionIds: partitions
      .filter((partition) => partition.status === 'deployed')
      .map((partition) => partition.id),
  };
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
    dispatchForFixture: dispatch,
  };
}

export function createNodeCanvasSemanticCommands(
  runtime: CanvasSemanticCommandRuntime
): CanvasSemanticCommandAdapter {
  let semanticRevision = 0;

  return createCanvasSemanticCommandAdapter({
    commandBus: () =>
      createSemanticCommandBus({
        graph: runtime.nodeEngine.exportGraph(),
        definitions: runtime.nodeRegistry.list(),
        groups: runtime.getGroups(),
        partitions: runtime.getPartitions(),
        runtimeStatus: runtimeStatusFor(runtime),
        errors: get(runtime.lastErrorStore)
          ? [{ code: 'last-error', message: String(get(runtime.lastErrorStore)) }]
          : [],
        permissions: [{ actorId: 'canvas', operations: ['node.add', 'node.connect'] }],
        revision: semanticRevision,
      }),
    onCommand: (command) => {
      semanticRevision += 1;
      if (command.type === 'node.add') runtime.nodeEngine.addNode(command.node);
      if (command.type === 'node.connect') runtime.nodeEngine.addConnection(command.connection);
    },
    onError: (message) => runtime.nodeEngine.lastError?.set?.(message),
  });
}
