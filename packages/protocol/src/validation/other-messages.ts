/**
 * Purpose: Runtime schema validation for media, plugin, and system protocol messages.
 */
import { MEDIA_TYPES, PLUGIN_COMMANDS, SYSTEM_ACTIONS } from './constants.js';
import {
  addReason,
  fieldCode,
  hasOwn,
  isOneOf,
  isRecord,
  optionalBoolean,
  optionalNonEmptyString,
  optionalNumber,
  requireNonEmptyString,
  requireNumber,
  type MutableValidationContext,
  type ObjectRecord,
} from './reasons.js';
import { validateTarget } from './target.js';

export function validateMediaMetaMessage(input: ObjectRecord, ctx: MutableValidationContext): void {
  if (input.from !== 'manager') {
    addReason(ctx, fieldCode(input, 'from'), 'message.media.from', 'from', 'from must be manager');
  }
  validateTarget(input.target, ctx, 'message.media.target', 'target');
  if (!isOneOf(input.mediaType, MEDIA_TYPES)) {
    addReason(ctx, fieldCode(input, 'mediaType'), 'message.media.mediaType', 'mediaType', 'mediaType must be audio or video');
  }
  requireNonEmptyString(input, ctx, 'url', 'message.media.url');
  requireNumber(input, ctx, 'executeAt', 'message.media.executeAt');
  if (hasOwn(input, 'options')) validateMediaOptions(input.options, ctx);
}

export function validatePluginControlMessage(input: ObjectRecord, ctx: MutableValidationContext): void {
  if (input.from !== 'manager') {
    addReason(ctx, fieldCode(input, 'from'), 'message.plugin.from', 'from', 'from must be manager');
  }
  validateTarget(input.target, ctx, 'message.plugin.target', 'target');
  requireNonEmptyString(input, ctx, 'pluginId', 'message.plugin.pluginId');
  if (!isOneOf(input.command, PLUGIN_COMMANDS)) {
    addReason(ctx, fieldCode(input, 'command'), 'message.plugin.command', 'command', 'command is unsupported');
  }
  if (hasOwn(input, 'payload') && !isRecord(input.payload)) {
    addReason(ctx, 'protocol.field.invalid', 'message.plugin.payload', 'payload', 'payload must be an object');
  }
}

export function validateSystemMessage(input: ObjectRecord, ctx: MutableValidationContext): void {
  if (!isOneOf(input.action, SYSTEM_ACTIONS)) {
    addReason(ctx, fieldCode(input, 'action'), 'message.system.action', 'action', 'action is unsupported');
  }
  if (!isRecord(input.payload)) {
    addReason(ctx, fieldCode(input, 'payload'), 'message.system.payload', 'payload', 'payload must be an object');
    return;
  }
  optionalNonEmptyString(input.payload, ctx, 'clientId', 'payload.clientId', 'message.system.payload.clientId');
  optionalNonEmptyString(input.payload, ctx, 'error', 'payload.error', 'message.system.payload.error');
  optionalNumber(input.payload, ctx, 'serverTimestamp', 'payload.serverTimestamp', 'message.system.payload.serverTimestamp');
  optionalNumber(input.payload, ctx, 'clientTimestamp', 'payload.clientTimestamp', 'message.system.payload.clientTimestamp');
  validateClientListPayload(input.payload, ctx);
}

function validateMediaOptions(options: unknown, ctx: MutableValidationContext): void {
  if (!isRecord(options)) {
    addReason(ctx, 'protocol.field.invalid', 'message.media.options', 'options', 'options must be an object');
    return;
  }
  optionalBoolean(options, ctx, 'loop', 'options.loop', 'message.media.options.loop');
  optionalNumber(options, ctx, 'volume', 'options.volume', 'message.media.options.volume');
  optionalBoolean(options, ctx, 'autoplay', 'options.autoplay', 'message.media.options.autoplay');
}

function validateClientListPayload(payload: ObjectRecord, ctx: MutableValidationContext): void {
  if (!hasOwn(payload, 'clients')) return;
  if (!Array.isArray(payload.clients)) {
    addReason(ctx, 'protocol.field.invalid', 'message.system.payload.clients', 'payload.clients', 'payload.clients must be an array');
    return;
  }
  payload.clients.forEach((client, index) => validateClientInfo(client, ctx, `payload.clients[${index}]`));
}

function validateClientInfo(client: unknown, ctx: MutableValidationContext, path: string): void {
  if (!isRecord(client)) {
    addReason(ctx, 'protocol.field.invalid', 'message.system.payload.clients', path, `${path} must be an object`);
    return;
  }
  requireNonEmptyString(client, ctx, 'clientId', 'message.system.payload.clients.clientId', `${path}.clientId`);
  requireNumber(client, ctx, 'connectedAt', 'message.system.payload.clients.connectedAt', `${path}.connectedAt`);
  optionalNonEmptyString(client, ctx, 'userAgent', `${path}.userAgent`, 'message.system.payload.clients.userAgent');
  optionalNonEmptyString(client, ctx, 'group', `${path}.group`, 'message.system.payload.clients.group');
  optionalBoolean(client, ctx, 'selected', `${path}.selected`, 'message.system.payload.clients.selected');
  optionalBoolean(client, ctx, 'connected', `${path}.connected`, 'message.system.payload.clients.connected');
  optionalNumber(client, ctx, 'lastSeenAt', `${path}.lastSeenAt`, 'message.system.payload.clients.lastSeenAt');
}
