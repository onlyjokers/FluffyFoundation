/**
 * Purpose: Schema-backed entrypoint for runtime validation of all socket protocol messages.
 */
import {
  PROTOCOL_VERSION,
  SYSTEM_SCOPE_GROUP_ID,
  type MessageType,
  type MessageWithoutServerTimestamp,
} from './types.js';
import type { MessageValidationResult } from './validation/types.js';
import { CONTROL_ACTIONS, MESSAGE_TYPES } from './validation/constants.js';
import { validateControlMessage } from './validation/control.js';
import { validateSensorDataMessage } from './validation/data.js';
import {
  validateMediaMetaMessage,
  validatePluginControlMessage,
  validateSystemMessage,
} from './validation/other-messages.js';
import {
  addReason,
  hasOwn,
  isNumber,
  isOneOf,
  isRecord,
  type MutableValidationContext,
} from './validation/reasons.js';
export { createPolicyRejectReason } from './validation/reasons.js';

export function validateMessage(input: unknown): MessageValidationResult {
  const ctx: MutableValidationContext = {
    actor: inferActor(input),
    type: inferMessageType(input),
    reasons: [],
  };

  if (!isRecord(input)) {
    addReason(ctx, 'protocol.message.invalid', 'message', 'message', 'message must be an object');
    return { ok: false, reasons: ctx.reasons };
  }

  if (!isOneOf(input.type, MESSAGE_TYPES)) {
    addReason(ctx, 'protocol.type.unsupported', 'message.type', 'type', 'type is unsupported');
    return { ok: false, reasons: ctx.reasons };
  }

  ctx.type = input.type;
  ctx.actor = inferActor(input);
  validateCommonEnvelope(input, ctx);
  validateCommandEnvelope(input, ctx);

  switch (input.type) {
    case 'control':
      validateControlMessage(input, ctx);
      break;
    case 'data':
      validateSensorDataMessage(input, ctx);
      break;
    case 'media':
      validateMediaMetaMessage(input, ctx);
      break;
    case 'plugin':
      validatePluginControlMessage(input, ctx);
      break;
    case 'system':
      validateSystemMessage(input, ctx);
      break;
  }

  if (ctx.reasons.length > 0) {
    return { ok: false, reasons: ctx.reasons };
  }
  return { ok: true, message: input as MessageWithoutServerTimestamp };
}

function validateCommandEnvelope(input: Record<string, unknown>, ctx: MutableValidationContext): void {
  if (input.type !== 'control' && input.type !== 'plugin' && input.type !== 'media') return;
  if (input.from === 'server' && input.scopeGroupId === SYSTEM_SCOPE_GROUP_ID) return;

  requireEnvelopeString(input, ctx, 'scopeGroupId', 'message.command.scopeGroupId');
  requireEnvelopeString(input, ctx, 'actor', 'message.command.actor');
  requireEnvelopeString(input, ctx, 'role', 'message.command.role');
  requireEnvelopeString(input, ctx, 'correlationId', 'message.command.correlationId');
  requireEnvelopeString(input, ctx, 'idempotencyKey', 'message.command.idempotencyKey');

  if (isRecord(input.scope) && typeof input.scope.scopeGroupId === 'string' && input.scope.scopeGroupId !== input.scopeGroupId) {
    addReason(
      ctx,
      'protocol.scope.ambiguous',
      'message.command.scopeGroupId',
      'scope.scopeGroupId',
      'scope.scopeGroupId conflicts with scopeGroupId'
    );
  }
}

function requireEnvelopeString(
  input: Record<string, unknown>,
  ctx: MutableValidationContext,
  key: string,
  scope: string
): void {
  if (typeof input[key] !== 'string' || !input[key].trim()) {
    addReason(ctx, hasOwn(input, key) ? 'protocol.field.invalid' : 'protocol.field.required', scope, key, `${key} is required`);
  }
}

function validateCommonEnvelope(input: Record<string, unknown>, ctx: MutableValidationContext): void {
  if (!hasOwn(input, 'version')) {
    addReason(ctx, 'protocol.field.required', 'protocol.version', 'version', 'version is required');
  } else if (input.version !== PROTOCOL_VERSION) {
    addReason(ctx, 'protocol.version.unsupported', 'protocol.version', 'version', `version must be ${PROTOCOL_VERSION}`);
  }

  if (hasOwn(input, 'clientTimestamp') && !isNumber(input.clientTimestamp)) {
    addReason(ctx, 'protocol.field.invalid', `message.${input.type}.clientTimestamp`, 'clientTimestamp', 'clientTimestamp must be a number');
  }
}

function inferActor(input: unknown): string {
  if (isRecord(input) && typeof input.from === 'string') return input.from;
  if (isRecord(input) && input.type === 'system') return 'system';
  return 'unknown';
}

function inferMessageType(input: unknown): MessageType | 'unknown' {
  return isRecord(input) && isOneOf(input.type, MESSAGE_TYPES) ? input.type : 'unknown';
}

export function isKnownControlAction(value: unknown): value is (typeof CONTROL_ACTIONS)[number] {
  return isOneOf(value, CONTROL_ACTIONS);
}
