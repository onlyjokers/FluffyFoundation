/**
 * Purpose: Runtime schema validation for sensor data protocol messages.
 */
import type { SensorType } from '../types.js';
import { SENSOR_TYPES } from './constants.js';
import {
  addReason,
  fieldCode,
  hasOwn,
  isNumber,
  isOneOf,
  isRecord,
  optionalNumber,
  requireNonEmptyString,
  requireNumber,
  type MutableValidationContext,
  type ObjectRecord,
} from './reasons.js';

export function validateSensorDataMessage(input: ObjectRecord, ctx: MutableValidationContext): void {
  if (input.from !== 'client') {
    addReason(ctx, fieldCode(input, 'from'), 'message.data.from', 'from', 'from must be client');
  }
  requireNonEmptyString(input, ctx, 'clientId', 'message.data.clientId');
  if (!isOneOf(input.sensorType, SENSOR_TYPES)) {
    addReason(ctx, fieldCode(input, 'sensorType'), 'message.data.sensorType', 'sensorType', 'sensorType is unsupported');
    return;
  }
  if (!hasOwn(input, 'payload')) {
    addReason(ctx, 'protocol.field.required', 'message.data.payload', 'payload', 'payload is required');
    return;
  }
  validateSensorPayload(input.sensorType, input.payload, ctx);
}

function validateSensorPayload(sensorType: SensorType, payload: unknown, ctx: MutableValidationContext): void {
  if (!isRecord(payload)) {
    addReason(ctx, 'protocol.field.invalid', 'message.data.payload', 'payload', 'payload must be an object');
    return;
  }

  switch (sensorType) {
    case 'gyro':
      requireNumber(payload, ctx, 'alpha', 'message.data.payload.alpha', 'payload.alpha');
      requireNumber(payload, ctx, 'beta', 'message.data.payload.beta', 'payload.beta');
      requireNumber(payload, ctx, 'gamma', 'message.data.payload.gamma', 'payload.gamma');
      break;
    case 'accel':
      requireNumber(payload, ctx, 'x', 'message.data.payload.x', 'payload.x');
      requireNumber(payload, ctx, 'y', 'message.data.payload.y', 'payload.y');
      requireNumber(payload, ctx, 'z', 'message.data.payload.z', 'payload.z');
      requireBoolean(payload, ctx, 'includesGravity');
      break;
    case 'orientation':
      requireNullableNumber(payload, ctx, 'alpha');
      requireNullableNumber(payload, ctx, 'beta');
      requireNullableNumber(payload, ctx, 'gamma');
      requireBoolean(payload, ctx, 'absolute');
      break;
    case 'mic':
      requireNumber(payload, ctx, 'volume', 'message.data.payload.volume', 'payload.volume');
      optionalNumber(payload, ctx, 'lowEnergy', 'payload.lowEnergy', 'message.data.payload.lowEnergy');
      optionalNumber(payload, ctx, 'highEnergy', 'payload.highEnergy', 'message.data.payload.highEnergy');
      optionalNumber(payload, ctx, 'bpm', 'payload.bpm', 'message.data.payload.bpm');
      if (hasOwn(payload, 'melSpectrogram')) {
        validateNumberArray(payload.melSpectrogram, ctx, 'payload.melSpectrogram');
      }
      break;
    case 'camera':
    case 'custom':
      break;
  }
}

function requireBoolean(input: ObjectRecord, ctx: MutableValidationContext, key: string): void {
  if (typeof input[key] !== 'boolean') {
    addReason(ctx, fieldCode(input, key), `message.data.payload.${key}`, `payload.${key}`, `payload.${key} must be a boolean`);
  }
}

function requireNullableNumber(input: ObjectRecord, ctx: MutableValidationContext, key: string): void {
  if (!hasOwn(input, key) || (!isNumber(input[key]) && input[key] !== null)) {
    addReason(ctx, fieldCode(input, key), `message.data.payload.${key}`, `payload.${key}`, `payload.${key} must be a number or null`);
  }
}

function validateNumberArray(value: unknown, ctx: MutableValidationContext, path: string): void {
  if (!Array.isArray(value) || value.some((item) => !isNumber(item))) {
    addReason(ctx, 'protocol.field.invalid', 'message.data.payload.melSpectrogram', path, `${path} must be a number array`);
  }
}
