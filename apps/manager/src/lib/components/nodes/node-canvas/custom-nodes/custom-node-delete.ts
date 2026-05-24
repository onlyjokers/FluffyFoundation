// Purpose: Delete nodes with Custom Node mother/child coupling rules preserved.
import { asRecord } from '$lib/utils/value-guards';
import type { NodeInstance } from '$lib/nodes/types';
import type { CustomNodeDefinition } from '$lib/nodes/custom-nodes/types';
import type { CustomNodeInstanceState } from '$lib/nodes/custom-nodes/instance';

type NodeEngineLike = {
  getNode: (id: string) => NodeInstance | undefined;
  removeNode: (id: string) => void;
  exportGraph: () => { nodes?: NodeInstance[] };
};

export function createDeleteNodeWithRules(opts: {
  nodeEngine: NodeEngineLike;
  readCustomNodeState: (config: Record<string, unknown>) => CustomNodeInstanceState | null;
  getCustomNodeDefinition: (definitionId: string) => CustomNodeDefinition | undefined;
  removeCustomNodeDefinition?: (definitionId: string) => void;
  getSelectedNodeId: () => string;
  setSelectedNode: (id: string) => void;
  confirm: (message: string) => boolean;
  removeNodeCommand?: (nodeId: string) => boolean;
}) {
  return (nodeId: string) => {
    const id = String(nodeId ?? '');
    if (!id) return;

    const node = opts.nodeEngine.getNode(id);
    if (!node) return;

    const removeNode = (targetId: string): void => {
      if (!opts.removeNodeCommand?.(targetId)) opts.nodeEngine.removeNode(targetId);
    };

    const state = opts.readCustomNodeState(asRecord(node.config));
    if (!state || state.role !== 'mother') {
      removeNode(id);
      return;
    }

    const def = opts.getCustomNodeDefinition(state.definitionId);
    const name = String(def?.name ?? 'Custom Node');

    const ok = opts.confirm(
      `Delete mother "${name}"?\n\nThis will remove only this parent instance from the graph. The Custom Node definition and existing child instances will remain.\n\nYou can reintroduce the parent node in Node Manager.`
    );
    if (!ok) return;

    removeNode(id);

    if (opts.getSelectedNodeId() === id) opts.setSelectedNode('');
  };
}
