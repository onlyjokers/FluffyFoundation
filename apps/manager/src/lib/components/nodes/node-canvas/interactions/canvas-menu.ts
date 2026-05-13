// Context-menu and toolbar outside-click bindings for NodeCanvas.
export type CanvasMenuBindingOptions = {
  container: HTMLDivElement;
  windowRef: Window;
  isToolbarMenuOpen: () => boolean;
  getToolbarMenuWrap: () => HTMLDivElement | null;
  closeToolbarMenu: () => void;
  openPicker: (event: { clientX: number; clientY: number; mode: 'add' }) => void;
};

export type CanvasMenuHandlers = {
  onContextMenu: (event: MouseEvent) => void;
  onWindowPointerDown: (event: PointerEvent) => void;
};

export function bindCanvasMenuHandlers(options: CanvasMenuBindingOptions): CanvasMenuHandlers {
  const onContextMenu = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest?.('.node-picker')) return;
    if (target?.closest?.('.minimap')) return;

    const tag = target?.tagName?.toLowerCase?.() ?? '';
    const isEditing =
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      Boolean(target?.isContentEditable);
    if (isEditing) return;

    event.preventDefault();
    event.stopPropagation();
    options.openPicker({ clientX: event.clientX, clientY: event.clientY, mode: 'add' });
  };

  const onWindowPointerDown = (event: PointerEvent) => {
    if (!options.isToolbarMenuOpen()) return;
    const target = event.target as Node | null;
    if (!target) return;
    if (options.getToolbarMenuWrap()?.contains(target)) return;
    options.closeToolbarMenu();
  };

  options.container.addEventListener('contextmenu', onContextMenu, { capture: true });
  options.windowRef.addEventListener('pointerdown', onWindowPointerDown, { capture: true });
  return { onContextMenu, onWindowPointerDown };
}
