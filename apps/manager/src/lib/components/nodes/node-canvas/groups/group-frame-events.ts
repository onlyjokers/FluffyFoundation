/**
 * Purpose: Wire group frame event listeners to the group controller.
 */
import type { GroupController } from '../controllers/group-controller';
import { bindGroupEvents } from './group-events';

type GroupFrameEventsOptions = {
  groupController: GroupController;
  windowRef?: Window;
};

export const bindGroupFrameEvents = (opts: GroupFrameEventsOptions) => {
  return bindGroupEvents({
    onToggleMinimized: (groupId) => opts.groupController.toggleGroupMinimized(groupId),
    onToggleDisabled: (groupId) => opts.groupController.toggleGroupDisabled(groupId),
    windowRef: opts.windowRef,
  });
};
