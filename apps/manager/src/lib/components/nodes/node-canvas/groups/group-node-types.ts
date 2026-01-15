/**
 * Purpose: Centralize group-related node type checks for group/controller logic.
 */
import { isGroupPortNodeType } from '../utils/group-port-utils';

export const GROUP_FRAME_NODE_TYPE = 'group-frame';

export const isGroupDecorationNodeType = (type: string) =>
  isGroupPortNodeType(type) || type === GROUP_FRAME_NODE_TYPE;
