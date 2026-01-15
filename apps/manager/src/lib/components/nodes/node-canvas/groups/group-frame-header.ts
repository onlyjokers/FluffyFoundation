/**
 * Purpose: Group frame header interaction handlers (selection + drag).
 */
import { get, type Writable } from 'svelte/store';
import type { GroupController } from '../controllers/group-controller';
import type { FrameDragController } from '../controllers/frame-drag-controller';

type GroupFrameHeaderOptions = {
  selectedGroupId: Writable<string | null>;
  groupSelectionNodeIds: Writable<Set<string>>;
  groupSelectionBounds: Writable<{ left: number; top: number; width: number; height: number } | null>;
  groupController: GroupController;
  frameDragController: FrameDragController;
  setSelectedNode: (nodeId: string) => void;
};

export const createGroupFrameHeaderHandlers = (opts: GroupFrameHeaderOptions) => {
  const handleGroupHeaderPointerDown = (groupId: string, event: PointerEvent) => {
    const id = String(groupId ?? '');
    if (id) opts.selectedGroupId.set(id);

    if (get(opts.groupSelectionNodeIds).size > 0) {
      opts.groupSelectionNodeIds.set(new Set());
      opts.groupSelectionBounds.set(null);
      opts.groupController.scheduleHighlight();
    }

    opts.setSelectedNode('');
    opts.frameDragController.startGroupHeaderDrag(id, event);
  };

  return { handleGroupHeaderPointerDown };
};
