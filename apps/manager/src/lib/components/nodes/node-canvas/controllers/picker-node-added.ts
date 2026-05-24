/**
 * Purpose: Keep picker-created node side effects explicit and free of viewport jumps.
 */
export type PickerNodeAddedOptions = {
  setSelectedNode: (nodeId: string) => void;
  requestFramesUpdate: () => void;
  requestMinimapUpdate: () => void;
  setPendingFocusNodeIds?: (nodeIds: string[]) => void;
};

export function handlePickerNodeAdded(nodeId: string, opts: PickerNodeAddedOptions): void {
  const id = String(nodeId ?? '');
  if (!id) return;

  opts.setSelectedNode(id);
  opts.requestFramesUpdate();
  opts.requestMinimapUpdate();
}
