// Keyboard shortcuts for NodeCanvas selection, clipboard, and deletion.
import { get } from 'svelte/store';
import type { Readable } from 'svelte/store';

type CanvasKeyboardOptions = {
  windowRef: Window;
  isToolbarMenuOpen: () => boolean;
  closeToolbarMenu: () => void;
  isPickerOpen: Readable<boolean>;
  closePicker: () => void;
  groupSelectionNodeIds: Readable<Set<string>>;
  selectedGroupId: Readable<string | null>;
  clearGroupSelection: () => void;
  getSelectedNodeId: () => string;
  deleteNodeWithRules: (nodeId: string) => void;
  clipboardController: {
    copySelectedNodes: () => boolean;
    pasteCopiedNodes: () => boolean;
  };
};

export function bindCanvasKeyboard(options: CanvasKeyboardOptions): (event: KeyboardEvent) => void {
  const onKeyDown = (event: KeyboardEvent) => {
    const key = event.key;
    const lowerKey = key.toLowerCase();
    if (key === 'Escape' && options.isToolbarMenuOpen()) {
      event.preventDefault();
      options.closeToolbarMenu();
      return;
    }
    if (key === 'Escape' && get(options.isPickerOpen)) {
      event.preventDefault();
      options.closePicker();
      return;
    }
    if (
      key === 'Escape' &&
      (get(options.groupSelectionNodeIds).size > 0 || Boolean(get(options.selectedGroupId)))
    ) {
      event.preventDefault();
      options.clearGroupSelection();
      return;
    }

    const el =
      event.target instanceof HTMLElement
        ? event.target
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    const tag = el?.tagName?.toLowerCase?.() ?? '';
    const isEditing =
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      Boolean(el?.isContentEditable);
    if (isEditing) return;

    if ((event.metaKey || event.ctrlKey) && lowerKey === 'c') {
      if (options.clipboardController.copySelectedNodes()) {
        event.preventDefault();
      }
      return;
    }

    if ((event.metaKey || event.ctrlKey) && lowerKey === 'v') {
      if (options.clipboardController.pasteCopiedNodes()) {
        event.preventDefault();
      }
      return;
    }

    if (key !== 'Backspace' && key !== 'Delete') return;

    const selectedIds = get(options.groupSelectionNodeIds);
    if (selectedIds.size > 0) {
      event.preventDefault();
      for (const id of selectedIds) {
        options.deleteNodeWithRules(id);
      }
      options.clearGroupSelection();
      return;
    }

    const selectedNodeId = options.getSelectedNodeId();
    if (!selectedNodeId) return;
    event.preventDefault();
    options.deleteNodeWithRules(selectedNodeId);
  };

  options.windowRef.addEventListener('keydown', onKeyDown);
  return onKeyDown;
}
