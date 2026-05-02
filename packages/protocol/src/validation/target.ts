/**
 * Purpose: Runtime schema validation for protocol target selectors.
 */
import type { TargetSelector } from '../types.js';
import {
  addReason,
  fieldCode,
  isNonEmptyString,
  isRecord,
  type MutableValidationContext,
} from './reasons.js';

export function validateTarget(
  value: unknown,
  ctx: MutableValidationContext,
  scope: string,
  path: string
): asserts value is TargetSelector {
  if (!isRecord(value)) {
    addReason(ctx, value === undefined ? 'protocol.field.required' : 'protocol.field.invalid', scope, path, `${path} must be an object`);
    return;
  }

  if (value.mode === 'all') return;

  if (value.mode === 'clientIds') {
    if (!Array.isArray(value.ids)) {
      addReason(ctx, fieldCode(value, 'ids'), scope, `${path}.ids`, `${path}.ids must be an array`);
      return;
    }
    value.ids.forEach((id, index) => {
      if (!isNonEmptyString(id)) {
        addReason(ctx, 'protocol.field.invalid', scope, `${path}.ids[${index}]`, `${path}.ids[${index}] must be a non-empty string`);
      }
    });
    return;
  }

  if (value.mode === 'group') {
    if (!isNonEmptyString(value.groupId)) {
      addReason(ctx, fieldCode(value, 'groupId'), scope, `${path}.groupId`, `${path}.groupId must be a non-empty string`);
    }
    return;
  }

  addReason(ctx, fieldCode(value, 'mode'), scope, `${path}.mode`, `${path}.mode is unsupported`);
}
