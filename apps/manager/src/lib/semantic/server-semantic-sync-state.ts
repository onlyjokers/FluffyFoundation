// Purpose: Shared Manager-side state for suppressing local semantic echoes and protecting pending edits.
import type { SemanticCommand } from '@shugu/node-core';

type PendingSemanticCommand = {
  requestId: string;
  command: SemanticCommand;
};

const pendingCommands: PendingSemanticCommand[] = [];

export const serverSemanticSyncState = {
  isApplyingSnapshot: false,

  trackPendingCommand(requestId: string, command: SemanticCommand): void {
    if (!requestId) return;
    pendingCommands.push({ requestId, command });
  },

  settlePendingCommand(requestId: string): void {
    const index = pendingCommands.findIndex((entry) => entry.requestId === requestId);
    if (index >= 0) pendingCommands.splice(index, 1);
  },

  getPendingCommands(): SemanticCommand[] {
    return pendingCommands.map((entry) => entry.command);
  },

  clearPendingCommands(): void {
    pendingCommands.length = 0;
  },
};
