// Purpose: Compute Manager-side node disable sets for group runtime gates.
import type { GraphState } from '$lib/nodes/types';
import { isGroupGateExemptNodeType } from '../groups/group-node-types';
import type { NodeGroup } from './group-types';

export function computeGroupDisabledNodeIds(graph: GraphState, groups: NodeGroup[]): Set<string> {
  const out = new Set<string>();
  const typeByNodeId = new Map(
    (graph.nodes ?? []).map((node) => [String(node.id), String(node.type ?? '')])
  );

  for (const group of groups ?? []) {
    const runtimeActive = group.runtimeActive ?? true;
    if (!group.disabled && runtimeActive) continue;
    for (const nodeId of group.nodeIds ?? []) {
      const id = String(nodeId);
      if (!id) continue;
      const type = typeByNodeId.get(id) ?? '';
      if (isGroupGateExemptNodeType(type)) continue;
      out.add(id);
    }
  }

  return out;
}
