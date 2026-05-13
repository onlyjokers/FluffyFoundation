// Purpose: UI-only node visual state helpers for the manager node canvas.
import type { GraphViewAdapter } from '../adapters';

export function createNodeVisualState(opts: {
  viewAdapter: GraphViewAdapter;
  nodeMap: Map<string, unknown>;
  requestFramesUpdate: () => void;
  requestMinimapUpdate: () => void;
}) {
  const pendingCollapsedByNodeId = new Map<string, boolean>();
  const forcedHiddenNodeIds = new Set<string>();

  const getNodeCollapsed = (nodeId: string): boolean =>
    Boolean(opts.viewAdapter.getNodeVisualState(String(nodeId))?.collapsed);

  const flushPendingCollapsedNodes = async () => {
    if (pendingCollapsedByNodeId.size === 0) return;
    for (const [nodeId, collapsed] of Array.from(pendingCollapsedByNodeId.entries())) {
      if (!opts.nodeMap.has(String(nodeId))) continue;
      pendingCollapsedByNodeId.delete(String(nodeId));
      await opts.viewAdapter.setNodeVisualState(String(nodeId), { collapsed: Boolean(collapsed) });
    }
    opts.requestFramesUpdate();
    opts.requestMinimapUpdate();
  };

  const setNodeCollapsed = async (nodeId: string, collapsed: boolean) => {
    const id = String(nodeId ?? '');
    if (!id) return;
    pendingCollapsedByNodeId.set(id, Boolean(collapsed));
    await flushPendingCollapsedNodes();
  };

  return {
    forcedHiddenNodeIds,
    getNodeCollapsed,
    flushPendingCollapsedNodes,
    setNodeCollapsed,
  };
}
