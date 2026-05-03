/**
 * Purpose: Create scoped command envelopes for accepted client-as-controller transfers.
 */
import {
  createCommandEnvelope,
  createControlMessage,
  SOCKET_EVENTS,
  type ClientControlCapability,
  type CommandEnvelope,
  type ControlAction,
  type ControlPayload,
  type TargetSelector,
} from '@shugu/protocol';

type ClientControllerSocket = {
  connected: boolean;
  emit: (event: string, message: unknown) => void;
};

export type ClientControllerEnvelope = CommandEnvelope & { transferId: string };

export function createClientControllerEnvelope(input: {
  clientId: string;
  capability: ClientControlCapability;
}): ClientControllerEnvelope {
  return {
    ...createCommandEnvelope({
      actor: input.clientId,
      role: 'client',
      scopeGroupId: input.capability.scopeGroupId,
      transferId: input.capability.transferId,
    }),
    transferId: input.capability.transferId,
  };
}

export function emitClientControlCommand(input: {
  socket: ClientControllerSocket | null;
  clientId: string | null;
  capability: ClientControlCapability;
  action: ControlAction;
  payload: ControlPayload;
  target?: TargetSelector;
  executeAt?: number;
}): void {
  if (!input.socket?.connected || !input.clientId) return;
  const envelope = createClientControllerEnvelope({
    clientId: input.clientId,
    capability: input.capability,
  });
  input.socket.emit(
    SOCKET_EVENTS.MSG,
    createControlMessage(
      envelope,
      input.target ?? { mode: 'group', groupId: input.capability.scopeGroupId },
      input.action,
      input.payload,
      input.executeAt
    )
  );
}
