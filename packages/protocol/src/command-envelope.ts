/**
 * Purpose: Define and create command envelope metadata for scoped mutating commands.
 */
import {
  SYSTEM_SCOPE_GROUP_ID,
  type ConnectionRole,
  type MessageWithoutServerTimestamp,
  type NonSystemMutatingCommandMessage,
} from './types.js';
import type { ControlPlaneActorRole } from './control-plane.js';
import { now } from './helpers.js';

export interface CommandEnvelope {
  actor: string;
  role: ConnectionRole | ControlPlaneActorRole | 'system';
  scopeGroupId: string;
  correlationId: string;
  idempotencyKey: string;
}

export type CommandEnvelopeInput = Partial<CommandEnvelope> & {
  actorId?: string;
  actorRole?: CommandEnvelope['role'];
};

export function createCommandEnvelope(input: CommandEnvelopeInput): CommandEnvelope {
  return {
    actor: normalizeRequiredString(input.actor ?? input.actorId, 'actor'),
    role: normalizeRequiredString(input.role ?? input.actorRole, 'role') as CommandEnvelope['role'],
    scopeGroupId: normalizeRequiredString(input.scopeGroupId, 'scopeGroupId'),
    correlationId: normalizeOptionalString(input.correlationId) ?? createProtocolId('corr'),
    idempotencyKey: normalizeOptionalString(input.idempotencyKey) ?? createProtocolId('idem'),
  };
}

export function createSystemCommandEnvelope(): CommandEnvelope {
  return createCommandEnvelope({
    actor: 'server',
    role: 'system',
    scopeGroupId: SYSTEM_SCOPE_GROUP_ID,
    correlationId: `server-${now()}`,
    idempotencyKey: `server-${now()}`,
  });
}

export function isNonSystemMutatingCommandMessage(
  message: MessageWithoutServerTimestamp
): message is MessageWithoutServerTimestamp & Omit<NonSystemMutatingCommandMessage, 'serverTimestamp'> {
  if (message.type !== 'control' && message.type !== 'media' && message.type !== 'plugin') return false;
  if (message.type === 'control' && message.from === 'server') return false;
  const record = message as Record<string, unknown>;
  return (
    isNonEmptyString(record.actor) &&
    isNonEmptyString(record.role) &&
    isNonEmptyString(record.scopeGroupId) &&
    isNonEmptyString(record.correlationId) &&
    isNonEmptyString(record.idempotencyKey)
  );
}

function createProtocolId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function normalizeRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
