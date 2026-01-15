/**
 * Purpose: Merge control payloads for batch updates without using `any`.
 */
import type { BaseControlPayload } from '@shugu/protocol';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export function mergeControlPayload(prev: BaseControlPayload, next: BaseControlPayload): BaseControlPayload {
  if (isObject(prev) && isObject(next)) {
    return { ...prev, ...next };
  }
  return next;
}
