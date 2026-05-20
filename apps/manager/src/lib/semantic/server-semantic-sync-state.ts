// Purpose: Shared Manager-side state for suppressing local semantic echoes and protecting pending edits.
import type { SemanticCommand } from '@shugu/node-core';

type PendingSemanticCommand = {
  requestId: string;
  command: SemanticCommand;
  createdAt: number;
};

type ServerSemanticSyncStateOptions = {
  ttlMs?: number;
  now?: () => number;
};

const DEFAULT_PENDING_TTL_MS = 5_000;

const cloneCommand = (command: SemanticCommand): SemanticCommand =>
  JSON.parse(JSON.stringify(command)) as SemanticCommand;

const commandPendingKey = (command: SemanticCommand): string => {
  if (command.type === 'node.params.update') return `node.params.update:${command.nodeId}`;
  if (command.type === 'node.inputs.update') return `node.inputs.update:${command.nodeId}`;
  return '';
};

const mergePendingCommand = (
  current: SemanticCommand,
  next: SemanticCommand
): SemanticCommand => {
  if (current.type === 'node.params.update' && next.type === 'node.params.update') {
    return {
      ...next,
      params: { ...(current.params ?? {}), ...(next.params ?? {}) },
    };
  }
  if (current.type === 'node.inputs.update' && next.type === 'node.inputs.update') {
    return {
      ...next,
      inputValues: { ...(current.inputValues ?? {}), ...(next.inputValues ?? {}) },
    };
  }
  return next;
};

export function createServerSemanticSyncState(options: ServerSemanticSyncStateOptions = {}) {
  const pendingCommands: PendingSemanticCommand[] = [];
  const pendingTtlMs = options.ttlMs ?? DEFAULT_PENDING_TTL_MS;
  const now = options.now ?? (() => Date.now());

  const pruneExpired = () => {
    const cutoff = now() - pendingTtlMs;
    for (let index = pendingCommands.length - 1; index >= 0; index -= 1) {
      if (pendingCommands[index].createdAt < cutoff) pendingCommands.splice(index, 1);
    }
  };

  return {
    isApplyingSnapshot: false,

    trackPendingCommand(requestId: string, command: SemanticCommand): void {
      if (!requestId) return;
      pruneExpired();
      const pendingKey = commandPendingKey(command);
      if (pendingKey) {
        const existing = pendingCommands.find(
          (entry) => commandPendingKey(entry.command) === pendingKey
        );
        if (existing) {
          existing.requestId = requestId;
          existing.command = mergePendingCommand(existing.command, cloneCommand(command));
          existing.createdAt = now();
          return;
        }
      }
      pendingCommands.push({ requestId, command: cloneCommand(command), createdAt: now() });
    },

    settlePendingCommand(requestId: string): void {
      pruneExpired();
      const index = pendingCommands.findIndex((entry) => entry.requestId === requestId);
      if (index >= 0) pendingCommands.splice(index, 1);
    },

    getPendingCommands(): SemanticCommand[] {
      pruneExpired();
      return pendingCommands.map((entry) => cloneCommand(entry.command));
    },

    clearPendingCommands(): void {
      pendingCommands.length = 0;
    },
  };
}

export const serverSemanticSyncState = createServerSemanticSyncState();
