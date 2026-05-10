/**
 * Purpose: Keep retired client-as-controller helpers as no-op compatibility shims.
 */
import {
  createCommandEnvelope,
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
  void input;
}
