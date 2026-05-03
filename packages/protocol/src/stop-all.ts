/**
 * Purpose: FF-16 protocol helper for root stop-all cleanup payloads.
 */

import type { ControlPayload } from './types.js';

export type StopAllPayload = ControlPayload & {
  kind: 'stop-all';
  reason: 'root-stop-all';
  clears: ['media', 'sound', 'color', 'visual-scenes', 'node-executors'];
};

export function createStopAllPayload(): StopAllPayload {
  return {
    kind: 'stop-all',
    reason: 'root-stop-all',
    clears: ['media', 'sound', 'color', 'visual-scenes', 'node-executors'],
  };
}
