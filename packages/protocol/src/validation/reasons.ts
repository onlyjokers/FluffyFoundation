/**
 * Purpose: Shared helpers for protocol validation and server policy rejection metadata.
 */
import {
  type MessageType,
} from '../types.js';
import type { ValidationRejectCode, ValidationRejectReason } from './types.js';

export type ObjectRecord = Record<string, unknown>;

export type MutableValidationContext = {
  actor: string;
  type: MessageType | 'unknown';
  reasons: ValidationRejectReason[];
};

export function addReason(
  ctx: MutableValidationContext,
  code: ValidationRejectCode,
  scope: string,
  path: string,
  message: string
): void {
  ctx.reasons.push({
    code,
    actor: ctx.actor,
    scope,
    type: ctx.type,
    path,
    decision: 'reject',
    message,
  });
}

export function createPolicyRejectReason(input: {
  actor: string;
  scope: string;
  type: MessageType | 'unknown';
  path: string;
  code?: ValidationRejectCode;
  message: string;
}): ValidationRejectReason {
  return {
    code: input.code ?? 'server.policy.unauthorized',
    actor: input.actor,
    scope: input.scope,
    type: input.type,
    path: input.path,
    decision: 'reject',
    message: input.message,
  };
}

export function fieldCode(input: ObjectRecord, key: string): ValidationRejectCode {
  return hasOwn(input, key) ? 'protocol.field.invalid' : 'protocol.field.required';
}

export function hasOwn(input: ObjectRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

export function isRecord(value: unknown): value is ObjectRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isOneOf<const T extends readonly unknown[]>(value: unknown, allowed: T): value is T[number] {
  return allowed.includes(value);
}

export function requireNonEmptyString(
  input: ObjectRecord,
  ctx: MutableValidationContext,
  key: string,
  scope: string,
  path = key
): void {
  if (!isNonEmptyString(input[key])) {
    addReason(ctx, fieldCode(input, key), scope, path, `${path} must be a non-empty string`);
  }
}

export function optionalNonEmptyString(
  input: ObjectRecord,
  ctx: MutableValidationContext,
  key: string,
  path: string,
  scope: string
): void {
  if (hasOwn(input, key) && !isNonEmptyString(input[key])) {
    addReason(ctx, 'protocol.field.invalid', scope, path, `${path} must be a non-empty string`);
  }
}

export function requireNumber(
  input: ObjectRecord,
  ctx: MutableValidationContext,
  key: string,
  scope: string,
  path = key
): void {
  if (!isNumber(input[key])) {
    addReason(ctx, fieldCode(input, key), scope, path, `${path} must be a number`);
  }
}

export function optionalNumber(
  input: ObjectRecord,
  ctx: MutableValidationContext,
  key: string,
  path: string,
  scope: string
): void {
  if (hasOwn(input, key) && !isNumber(input[key])) {
    addReason(ctx, 'protocol.field.invalid', scope, path, `${path} must be a number`);
  }
}

export function optionalBoolean(
  input: ObjectRecord,
  ctx: MutableValidationContext,
  key: string,
  path: string,
  scope: string
): void {
  if (hasOwn(input, key) && typeof input[key] !== 'boolean') {
    addReason(ctx, 'protocol.field.invalid', scope, path, `${path} must be a boolean`);
  }
}
