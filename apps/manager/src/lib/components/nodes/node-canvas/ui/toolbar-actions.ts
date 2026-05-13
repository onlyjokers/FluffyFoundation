// Purpose: Small toolbar state actions for NodeCanvas.
export function createToolbarActions(opts: {
  closeToolbarMenu: () => void;
  toggleToolbarMenu: () => void;
}) {
  const handleToolbarMenuPick = (action: () => void) => {
    opts.closeToolbarMenu();
    action();
  };

  return {
    closeToolbarMenu: opts.closeToolbarMenu,
    toggleToolbarMenu: opts.toggleToolbarMenu,
    handleToolbarMenuPick,
  };
}
