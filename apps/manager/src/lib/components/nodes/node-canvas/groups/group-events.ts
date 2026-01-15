// Purpose: Bind Group frame UI events to handlers.

type GroupEventHandlers = {
  onToggleMinimized: (groupId: string) => void;
  onToggleDisabled: (groupId: string) => void;
  windowRef?: Window;
};

type GroupEventDetail = { groupId?: unknown };

const readGroupId = (event: Event): string => {
  const detail = event instanceof CustomEvent ? (event.detail as GroupEventDetail) : null;
  const rawGroupId = detail?.groupId;
  return typeof rawGroupId === 'string' ? rawGroupId : rawGroupId ? String(rawGroupId) : '';
};

export const bindGroupEvents = (handlers: GroupEventHandlers) => {
  const win = handlers.windowRef ?? window;

  const onGroupFrameToggle = (event: Event) => {
    const groupId = readGroupId(event);
    if (!groupId) return;
    handlers.onToggleMinimized(groupId);
  };

  const onGroupFrameToggleDisabled = (event: Event) => {
    const groupId = readGroupId(event);
    if (!groupId) return;
    handlers.onToggleDisabled(groupId);
  };

  win.addEventListener('shugu:toggle-group-minimized', onGroupFrameToggle);
  win.addEventListener('shugu:toggle-group-disabled', onGroupFrameToggleDisabled);

  const cleanup = () => {
    win.removeEventListener('shugu:toggle-group-minimized', onGroupFrameToggle);
    win.removeEventListener('shugu:toggle-group-disabled', onGroupFrameToggleDisabled);
  };

  return { onGroupFrameToggle, onGroupFrameToggleDisabled, cleanup };
};
