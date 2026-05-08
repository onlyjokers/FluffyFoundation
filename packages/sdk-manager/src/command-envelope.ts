/**
 * Purpose: Own ManagerSDK command envelope defaults and per-command metadata refresh.
 */
import {
  createCommandEnvelope,
  type CommandEnvelope,
  type CommandEnvelopeInput,
} from '@shugu/protocol';

export const DEFAULT_MANAGER_COMMAND_ENVELOPE: CommandEnvelopeInput = {
  actor: 'manager',
  role: 'manager',
  scopeGroupId: 'manager-default',
};

export function normalizeManagerCommandEnvelope(input?: CommandEnvelopeInput): CommandEnvelope {
  return createCommandEnvelope(input ?? DEFAULT_MANAGER_COMMAND_ENVELOPE);
}

export function nextManagerCommandEnvelope(envelope: CommandEnvelope): CommandEnvelope {
  return createCommandEnvelope(envelope);
}

export function nextManagerCommandEnvelopeForTarget(
  envelope: CommandEnvelope,
  target?: { mode?: string; groupId?: string }
): CommandEnvelope {
  if (target?.mode === 'group' && typeof target.groupId === 'string' && target.groupId.trim()) {
    return createCommandEnvelope({ ...envelope, scopeGroupId: target.groupId.trim() });
  }
  return nextManagerCommandEnvelope(envelope);
}

export type { CommandEnvelope, CommandEnvelopeInput };
