// Purpose: Keep NodeCanvas node selection state synchronized with Rete nodes.
import type { Writable } from 'svelte/store';
import type { AreaPlugin } from 'rete-area-plugin';
import type { BaseSchemes } from 'rete';
import type { NodeInstance } from '$lib/nodes/types';

type SelectionControllerOptions = {
  getSelectedNodeId: () => string;
  setSelectedNodeId: (nodeId: string) => void;
  selectedGroupId: Writable<string | null>;
  nodeMap: Map<string, NodeInstance>;
  getAreaPlugin: () => AreaPlugin<BaseSchemes> | null;
};

export function createSelectionController(opts: SelectionControllerOptions) {
  const setSelectedNode = (nextId: string) => {
    const prevId = opts.getSelectedNodeId();
    if (prevId === nextId) return;

    opts.setSelectedNodeId(nextId);
    if (nextId) opts.selectedGroupId.set(null);

    if (prevId) {
      const prev = opts.nodeMap.get(prevId);
      if (prev && prev.selected) {
        prev.selected = false;
        opts.getAreaPlugin()?.update?.('node', prevId);
      }
    }

    if (nextId) {
      const next = opts.nodeMap.get(nextId);
      if (next && !next.selected) {
        next.selected = true;
        opts.getAreaPlugin()?.update?.('node', nextId);
      }
    }
  };

  return { setSelectedNode };
}

export function shouldClearMissingSelectedNode(input: {
  selectedNodeId: string;
  graphNodeIds: Iterable<string>;
  nodeMapIds: Iterable<string>;
}): boolean {
  const selectedNodeId = String(input.selectedNodeId ?? '');
  if (!selectedNodeId) return false;
  const graphIds = new Set(Array.from(input.graphNodeIds ?? []).map((id) => String(id)));
  if (graphIds.has(selectedNodeId)) return false;
  const viewIds = new Set(Array.from(input.nodeMapIds ?? []).map((id) => String(id)));
  return !viewIds.has(selectedNodeId);
}
