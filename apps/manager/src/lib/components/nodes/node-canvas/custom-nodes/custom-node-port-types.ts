// Purpose: Shared Custom Node port type normalization.
import type { PortType } from '$lib/nodes/types';

const validPortTypes = new Set([
  'number',
  'boolean',
  'pulse',
  'string',
  'asset',
  'color',
  'audio',
  'image',
  'video',
  'scene',
  'effect',
  'client',
  'command',
  'fuzzy',
  'array',
  'any',
]);

export function normalizeCustomNodePortType(value: unknown): PortType {
  const raw = typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
  return validPortTypes.has(raw) ? (raw as PortType) : 'any';
}
