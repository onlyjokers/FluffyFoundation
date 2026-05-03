/**
 * Purpose: Runtime schema validation for control protocol messages and payloads.
 */
import type { ControlPayload } from '../types.js';
import { CONTROL_ACTIONS, MEDIA_TYPES } from './constants.js';
import {
  addReason,
  fieldCode,
  hasOwn,
  isNumber,
  isOneOf,
  isRecord,
  optionalBoolean,
  optionalNumber,
  requireNonEmptyString,
  requireNumber,
  type MutableValidationContext,
  type ObjectRecord,
} from './reasons.js';
import { validateTarget } from './target.js';

export function validateControlMessage(input: ObjectRecord, ctx: MutableValidationContext): void {
  if (!isOneOf(input.from, ['manager', 'server'] as const)) {
    addReason(ctx, fieldCode(input, 'from'), 'message.control.from', 'from', 'from must be manager or server');
  }
  validateTarget(input.target, ctx, 'message.control.target', 'target');
  if (!isOneOf(input.action, CONTROL_ACTIONS)) {
    addReason(ctx, fieldCode(input, 'action'), 'message.control.action', 'action', 'action is unsupported');
  }
  if (hasOwn(input, 'executeAt') && !isNumber(input.executeAt)) {
    addReason(ctx, 'protocol.field.invalid', 'message.control.executeAt', 'executeAt', 'executeAt must be a number');
  }
  if (!hasOwn(input, 'payload')) {
    addReason(ctx, 'protocol.field.required', 'message.control.payload', 'payload', 'payload is required');
    return;
  }
  validateControlPayload(input.action, input.payload, ctx, 'payload');
}

function validateControlPayload(action: unknown, payload: unknown, ctx: MutableValidationContext, path: string): asserts payload is ControlPayload {
  if (!isRecord(payload)) {
    addReason(ctx, 'protocol.field.invalid', 'message.control.payload', path, `${path} must be an object`);
    return;
  }
  if (payload.kind === 'control-batch') {
    validateControlBatch(payload, ctx, path);
    return;
  }

  switch (action) {
    case 'flashlight':
      if (!isOneOf(payload.mode, ['off', 'on', 'blink'] as const)) {
        addReason(ctx, fieldCode(payload, 'mode'), 'message.control.payload.mode', `${path}.mode`, `${path}.mode is unsupported`);
      }
      optionalNumber(payload, ctx, 'frequency', `${path}.frequency`, 'message.control.payload.frequency');
      optionalNumber(payload, ctx, 'dutyCycle', `${path}.dutyCycle`, 'message.control.payload.dutyCycle');
      break;
    case 'vibrate':
      if (!Array.isArray(payload.pattern) || payload.pattern.some((item) => !isNumber(item))) {
        addReason(ctx, fieldCode(payload, 'pattern'), 'message.control.payload.pattern', `${path}.pattern`, `${path}.pattern must be a number array`);
      }
      optionalNumber(payload, ctx, 'repeat', `${path}.repeat`, 'message.control.payload.repeat');
      break;
    case 'playSound':
    case 'playMedia':
    case 'showImage':
      validateMediaControlPayload(payload, ctx, path);
      break;
    case 'visualScenes':
      validateVisualScenes(payload, ctx, path);
      break;
    case 'visualEffects':
      validateVisualEffects(payload, ctx, path);
      break;
    case 'clientControlTransfer':
      validateClientControlTransferPayload(payload, ctx, path);
      break;
  }
}

function validateClientControlTransferPayload(payload: ObjectRecord, ctx: MutableValidationContext, path: string): void {
  if (payload.kind !== 'client-control-transfer-status') {
    addReason(ctx, fieldCode(payload, 'kind'), 'message.control.payload.kind', `${path}.kind`, `${path}.kind is unsupported`);
  }
  requireNonEmptyString(payload, ctx, 'transferId', 'message.control.payload.transferId', `${path}.transferId`);
  requireNonEmptyString(payload, ctx, 'groupId', 'message.control.payload.groupId', `${path}.groupId`);
  requireNonEmptyString(payload, ctx, 'targetClientId', 'message.control.payload.targetClientId', `${path}.targetClientId`);
  requireNumber(payload, ctx, 'offeredAt', 'message.control.payload.offeredAt', `${path}.offeredAt`);
  requireNumber(payload, ctx, 'expiresAt', 'message.control.payload.expiresAt', `${path}.expiresAt`);
  if (!isOneOf(payload.status, ['pending', 'accepted', 'denied', 'expired', 'revoked', 'control-lost'] as const)) {
    addReason(ctx, fieldCode(payload, 'status'), 'message.control.payload.status', `${path}.status`, `${path}.status is unsupported`);
  }
  if (!isRecord(payload.capability)) {
    addReason(ctx, fieldCode(payload, 'capability'), 'message.control.payload.capability', `${path}.capability`, `${path}.capability must be an object`);
  }
}

function validateControlBatch(payload: ObjectRecord, ctx: MutableValidationContext, path: string): void {
  optionalNumber(payload, ctx, 'executeAt', `${path}.executeAt`, 'message.control.payload.executeAt');
  if (!Array.isArray(payload.items)) {
    addReason(ctx, fieldCode(payload, 'items'), 'message.control.payload.items', `${path}.items`, `${path}.items must be an array`);
    return;
  }
  payload.items.forEach((item, index) => {
    if (!isRecord(item)) {
      addReason(ctx, 'protocol.field.invalid', 'message.control.payload.items', `${path}.items[${index}]`, `${path}.items[${index}] must be an object`);
      return;
    }
    if (!isOneOf(item.action, CONTROL_ACTIONS)) {
      addReason(ctx, fieldCode(item, 'action'), 'message.control.payload.items.action', `${path}.items[${index}].action`, `${path}.items[${index}].action is unsupported`);
    }
    if (hasOwn(item, 'executeAt') && !isNumber(item.executeAt)) {
      addReason(ctx, 'protocol.field.invalid', 'message.control.payload.items.executeAt', `${path}.items[${index}].executeAt`, `${path}.items[${index}].executeAt must be a number`);
    }
    if (!hasOwn(item, 'payload')) {
      addReason(ctx, 'protocol.field.required', 'message.control.payload.items.payload', `${path}.items[${index}].payload`, `${path}.items[${index}].payload is required`);
      return;
    }
    validateControlPayload(item.action, item.payload, ctx, `${path}.items[${index}].payload`);
  });
}

function validateMediaControlPayload(payload: ObjectRecord, ctx: MutableValidationContext, path: string): void {
  requireNonEmptyString(payload, ctx, 'url', 'message.control.payload.url', `${path}.url`);
  optionalNumber(payload, ctx, 'volume', `${path}.volume`, 'message.control.payload.volume');
  optionalBoolean(payload, ctx, 'loop', `${path}.loop`, 'message.control.payload.loop');
  optionalNumber(payload, ctx, 'fadeIn', `${path}.fadeIn`, 'message.control.payload.fadeIn');
  optionalNumber(payload, ctx, 'duration', `${path}.duration`, 'message.control.payload.duration');
  optionalBoolean(payload, ctx, 'muted', `${path}.muted`, 'message.control.payload.muted');
  if (hasOwn(payload, 'mediaType') && !isOneOf(payload.mediaType, MEDIA_TYPES)) {
    addReason(ctx, 'protocol.field.invalid', 'message.control.payload.mediaType', `${path}.mediaType`, `${path}.mediaType must be audio or video`);
  }
}

function validateVisualScenes(payload: ObjectRecord, ctx: MutableValidationContext, path: string): void {
  if (!Array.isArray(payload.scenes)) {
    addReason(ctx, fieldCode(payload, 'scenes'), 'message.control.payload.scenes', `${path}.scenes`, `${path}.scenes must be an array`);
    return;
  }
  payload.scenes.forEach((scene, index) => {
    if (!isRecord(scene) || !isOneOf(scene.type, ['box', 'mel', 'frontCamera', 'backCamera'] as const)) {
      addReason(ctx, 'protocol.field.invalid', 'message.control.payload.scenes', `${path}.scenes[${index}].type`, `${path}.scenes[${index}].type is unsupported`);
    }
  });
}

function validateVisualEffects(payload: ObjectRecord, ctx: MutableValidationContext, path: string): void {
  if (!Array.isArray(payload.effects)) {
    addReason(ctx, fieldCode(payload, 'effects'), 'message.control.payload.effects', `${path}.effects`, `${path}.effects must be an array`);
    return;
  }
  payload.effects.forEach((effect, index) => validateVisualEffect(effect, ctx, `${path}.effects[${index}]`));
}

function validateVisualEffect(effect: unknown, ctx: MutableValidationContext, path: string): void {
  if (!isRecord(effect)) {
    addReason(ctx, 'protocol.field.invalid', 'message.control.payload.effects', path, `${path} must be an object`);
    return;
  }
  if (effect.type === 'ascii') {
    requireNumber(effect, ctx, 'cellSize', 'message.control.payload.effects.cellSize', `${path}.cellSize`);
    return;
  }
  if (effect.type === 'convolution') {
    optionalNumber(effect, ctx, 'mix', `${path}.mix`, 'message.control.payload.effects.mix');
    optionalNumber(effect, ctx, 'bias', `${path}.bias`, 'message.control.payload.effects.bias');
    optionalNumber(effect, ctx, 'scale', `${path}.scale`, 'message.control.payload.effects.scale');
    optionalBoolean(effect, ctx, 'normalize', `${path}.normalize`, 'message.control.payload.effects.normalize');
    if (hasOwn(effect, 'kernel') && (!Array.isArray(effect.kernel) || effect.kernel.length !== 9 || effect.kernel.some((item) => !isNumber(item)))) {
      addReason(ctx, 'protocol.field.invalid', 'message.control.payload.effects.kernel', `${path}.kernel`, `${path}.kernel must be a 9-number array`);
    }
    return;
  }
  addReason(ctx, fieldCode(effect, 'type'), 'message.control.payload.effects.type', `${path}.type`, `${path}.type is unsupported`);
}
