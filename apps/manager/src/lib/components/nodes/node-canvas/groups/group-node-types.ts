/**
 * Purpose: Centralize group-related node type checks for group/controller logic.
 */
import { isGroupPortNodeType } from '../utils/group-port-utils';

export const GROUP_FRAME_NODE_TYPE = 'group-frame';

const GROUP_STATE_NODE_TYPES = new Set([
  'independent-variable-name',
  'set-boolean-variable',
  'get-boolean-variable',
  'boolean-variable',
  'number-variable',
  'string-variable',
]);

export const isGroupDecorationNodeType = (type: string) =>
  isGroupPortNodeType(type) || type === GROUP_FRAME_NODE_TYPE;

export const isGroupGateExemptNodeType = (type: string) =>
  isGroupDecorationNodeType(type) || GROUP_STATE_NODE_TYPES.has(String(type ?? ''));
