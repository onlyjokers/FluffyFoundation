/**
 * Purpose: Public result and rejection metadata types for runtime protocol validation.
 */
import type { MessageType, MessageWithoutServerTimestamp } from '../types.js';

export type ValidationRejectCode =
  | 'protocol.message.invalid'
  | 'protocol.type.unsupported'
  | 'protocol.version.unsupported'
  | 'protocol.field.required'
  | 'protocol.field.invalid'
  | 'protocol.scope.ambiguous'
  | 'server.policy.scope_mismatch'
  | 'server.policy.ownership_denied'
  | 'server.policy.client_transfer_required'
  | 'server.policy.capability_denied'
  | 'control-plane.capability_required'
  | 'partition.capability.missing'
  | 'partition.revision_mismatch'
  | 'partition.target.invalid'
  | 'server.policy.unauthorized';

export interface ValidationRejectReason {
  code: ValidationRejectCode;
  actor: string;
  scope: string;
  type: MessageType | 'unknown';
  path: string;
  decision: 'reject';
  message: string;
}

export type MessageValidationResult =
  | { ok: true; message: MessageWithoutServerTimestamp }
  | { ok: false; reasons: ValidationRejectReason[] };
