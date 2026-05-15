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

export function validateSemanticMessage(input: ObjectRecord, ctx: MutableValidationContext): void {
  validateSemanticTarget(input.target, ctx);
  requireNonEmptyString(input, ctx, 'actor', 'message.semantic.actor');
  if (input.role !== 'manager' && input.role !== 'system') {
    addReason(ctx, fieldCode(input, 'role'), 'message.semantic.role', 'role', 'role must be manager or system');
  }
  if (!isRecord(input.command)) {
    addReason(ctx, fieldCode(input, 'command'), 'message.semantic.command', 'command', 'command must be an object');
  } else {
    requireNonEmptyString(input.command, ctx, 'kind', 'message.semantic.command.kind', 'command.kind');
  }
  optionalBoolean(input, ctx, 'dryRun', 'dryRun', 'message.semantic.dryRun');
  requireNonEmptyString(input, ctx, 'requestId', 'message.semantic.requestId');
}

export function validateSemanticResultMessage(input: ObjectRecord, ctx: MutableValidationContext): void {
  requireNonEmptyString(input, ctx, 'requestId', 'message.semantic-result.requestId');
  if (typeof input.ok !== 'boolean') {
    addReason(ctx, fieldCode(input, 'ok'), 'message.semantic-result.ok', 'ok', 'ok must be a boolean');
    return;
  }

  if (input.ok) {
    if (!isRecord(input.result)) {
      addReason(ctx, fieldCode(input, 'result'), 'message.semantic-result.result', 'result', 'result must be an object');
    }
  } else {
    validateSemanticError(input.error, ctx);
  }

  if (input.warnings !== undefined) validateSemanticWarnings(input.warnings, ctx);
  optionalNumber(input, ctx, 'snapshotRevision', 'snapshotRevision', 'message.semantic-result.snapshotRevision');
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
  validateStateStrategy(input.payload.stateStrategy, ctx);
  validateControlPlaneSnapshot(input.payload.controlPlane, ctx);
  validateSemanticSnapshotPayload(input.payload.semanticSnapshot, ctx);
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

function validateSemanticTarget(target: unknown, ctx: MutableValidationContext): void {
  if (!isRecord(target)) {
    addReason(ctx, 'protocol.field.invalid', 'message.semantic.target', 'target', 'target must be an object');
    return;
  }
  if (target.mode === 'server' || target.mode === 'manager') return;
  if (target.mode === 'managerId') {
    requireNonEmptyString(target, ctx, 'managerId', 'message.semantic.target.managerId', 'target.managerId');
    return;
  }
  addReason(ctx, fieldCode(target, 'mode'), 'message.semantic.target.mode', 'target.mode', 'target.mode must be server, manager, or managerId');
}

function validateSemanticSnapshotPayload(value: unknown, ctx: MutableValidationContext): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    addReason(ctx, 'protocol.field.invalid', 'message.system.payload.semanticSnapshot', 'payload.semanticSnapshot', 'payload.semanticSnapshot must be an object');
    return;
  }
  requireNumber(value, ctx, 'revision', 'message.system.payload.semanticSnapshot.revision', 'payload.semanticSnapshot.revision');
  for (const field of ['nodes', 'definitions', 'connections', 'groups', 'partitions', 'deviceCapabilities', 'errors', 'permissions']) {
    if (!Array.isArray(value[field])) {
      addReason(ctx, 'protocol.field.invalid', `message.system.payload.semanticSnapshot.${field}`, `payload.semanticSnapshot.${field}`, `payload.semanticSnapshot.${field} must be an array`);
    }
  }
  if (!isRecord(value.runtimeStatus)) {
    addReason(ctx, 'protocol.field.invalid', 'message.system.payload.semanticSnapshot.runtimeStatus', 'payload.semanticSnapshot.runtimeStatus', 'payload.semanticSnapshot.runtimeStatus must be an object');
  }
}

function validateSemanticWarnings(warnings: unknown, ctx: MutableValidationContext): void {
  if (!Array.isArray(warnings)) {
    addReason(ctx, 'protocol.field.invalid', 'message.semantic-result.warnings', 'warnings', 'warnings must be an array');
    return;
  }
  warnings.forEach((warning, index) => {
    const path = `warnings[${index}]`;
    if (!isRecord(warning)) {
      addReason(ctx, 'protocol.field.invalid', 'message.semantic-result.warnings', path, `${path} must be an object`);
      return;
    }
    requireNonEmptyString(warning, ctx, 'code', 'message.semantic-result.warnings.code', `${path}.code`);
    requireNonEmptyString(warning, ctx, 'path', 'message.semantic-result.warnings.path', `${path}.path`);
    requireNonEmptyString(warning, ctx, 'message', 'message.semantic-result.warnings.message', `${path}.message`);
  });
}

function validateSemanticError(error: unknown, ctx: MutableValidationContext): void {
  if (!isRecord(error)) {
    addReason(ctx, 'protocol.field.required', 'message.semantic-result.error', 'error', 'error is required when ok is false');
    return;
  }
  requireNonEmptyString(error, ctx, 'code', 'message.semantic-result.error.code', 'error.code');
  requireNonEmptyString(error, ctx, 'message', 'message.semantic-result.error.message', 'error.message');
  optionalNonEmptyString(error, ctx, 'path', 'error.path', 'message.semantic-result.error.path');
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

function validateStateStrategy(value: unknown, ctx: MutableValidationContext): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    addReason(ctx, 'protocol.field.invalid', 'message.system.payload.stateStrategy', 'payload.stateStrategy', 'payload.stateStrategy must be an object');
    return;
  }
  if (value.mode !== 'single-server') {
    addReason(ctx, fieldCode(value, 'mode'), 'message.system.payload.stateStrategy.mode', 'payload.stateStrategy.mode', 'payload.stateStrategy.mode must be single-server');
  }
}

function validateControlPlaneSnapshot(value: unknown, ctx: MutableValidationContext): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    addReason(ctx, 'protocol.field.invalid', 'message.system.payload.controlPlane', 'payload.controlPlane', 'payload.controlPlane must be an object');
    return;
  }

  if (value.strategy !== 'single-server') {
    addReason(ctx, fieldCode(value, 'strategy'), 'message.system.payload.controlPlane.strategy', 'payload.controlPlane.strategy', 'payload.controlPlane.strategy must be single-server');
  }

  const selection = value.selection;
  if (!isRecord(selection)) {
    addReason(ctx, 'protocol.field.invalid', 'message.system.payload.controlPlane.selection', 'payload.controlPlane.selection', 'payload.controlPlane.selection must be an object');
  } else {
    if (!Array.isArray(selection.selectedClientIds) || selection.selectedClientIds.some((id) => typeof id !== 'string' || id.trim() === '')) {
      addReason(ctx, 'protocol.field.invalid', 'message.system.payload.controlPlane.selection.selectedClientIds', 'payload.controlPlane.selection.selectedClientIds', 'payload.controlPlane.selection.selectedClientIds must be a string array');
    }
    requireNumber(selection, ctx, 'revision', 'message.system.payload.controlPlane.selection.revision', 'payload.controlPlane.selection.revision');
  }

  if (value.ownership !== undefined && !isRecord(value.ownership)) {
    addReason(ctx, 'protocol.field.invalid', 'message.system.payload.controlPlane.ownership', 'payload.controlPlane.ownership', 'payload.controlPlane.ownership must be an object');
  } else if (isRecord(value.ownership)) {
    Object.entries(value.ownership).forEach(([groupId, entry]) => {
      validateControlPlaneOwnershipEntry(entry, ctx, `payload.controlPlane.ownership.${groupId}`);
    });
  }
}

function validateControlPlaneOwnershipEntry(
  entry: unknown,
  ctx: MutableValidationContext,
  path: string
): void {
  if (!isRecord(entry)) {
    addReason(ctx, 'protocol.field.invalid', 'message.system.payload.controlPlane.ownership', path, `${path} must be an object`);
    return;
  }
  if (!isRecord(entry.owner) && entry.owner !== 'server-process') {
    addReason(ctx, 'protocol.field.invalid', 'message.system.payload.controlPlane.ownership.owner', `${path}.owner`, `${path}.owner must be an object`);
  }
  if (entry.ownerStack !== undefined && !Array.isArray(entry.ownerStack)) {
    addReason(ctx, 'protocol.field.invalid', 'message.system.payload.controlPlane.ownership.ownerStack', `${path}.ownerStack`, `${path}.ownerStack must be an array`);
  }
  if (entry.transferable !== undefined && typeof entry.transferable !== 'boolean') {
    addReason(ctx, 'protocol.field.invalid', 'message.system.payload.controlPlane.ownership.transferable', `${path}.transferable`, `${path}.transferable must be a boolean`);
  }
  if (entry.surface !== undefined && !isOneOf(entry.surface, ['public', 'internal'] as const)) {
    addReason(ctx, 'protocol.field.invalid', 'message.system.payload.controlPlane.ownership.surface', `${path}.surface`, `${path}.surface must be public or internal`);
  }
  if (entry.selectedClientIds !== undefined && (!Array.isArray(entry.selectedClientIds) || entry.selectedClientIds.some((id) => typeof id !== 'string'))) {
    addReason(ctx, 'protocol.field.invalid', 'message.system.payload.controlPlane.ownership.selectedClientIds', `${path}.selectedClientIds`, `${path}.selectedClientIds must be a string array`);
  }
}
