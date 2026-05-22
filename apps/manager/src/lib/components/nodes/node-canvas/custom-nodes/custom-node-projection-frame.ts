// Purpose: Build expanded Custom Node overlay frame bounds from rendered projection nodes.
import type { GraphState } from '$lib/nodes/types';
import type { NodeBounds } from '../adapters';
import type { GroupFrame } from '../controllers/group-types';
import { mergeBounds } from '../controllers/group-bounds';

export function buildCustomNodeProjectionFrame(input: {
  ownerId: string;
  groupId: string;
  name: string;
  disabled: boolean;
  projection: GraphState;
  getNodeBounds: (nodeId: string) => NodeBounds | null;
}): GroupFrame | null {
  const ownerId = String(input.ownerId ?? '');
  if (!ownerId) return null;

  const ownedNodes = (input.projection.nodes ?? []).filter(
    (node) => String(node.config?.projectionOwnerNodeId ?? '') === ownerId
  );
  if (ownedNodes.length === 0) return null;

  let bounds: NodeBounds | null = null;
  for (const node of ownedNodes) {
    const nodeId = String(node.id ?? '');
    if (!nodeId) continue;
    const rendered = input.getNodeBounds(nodeId);
    if (rendered) {
      bounds = mergeBounds(bounds, rendered);
      continue;
    }
    const x = Number(node.position?.x ?? 0);
    const y = Number(node.position?.y ?? 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    bounds = mergeBounds(bounds, { left: x, top: y, right: x + 230, bottom: y + 100 });
  }
  if (!bounds) return null;

  const paddingX = 52;
  const paddingTop = 64;
  const paddingBottom = 52;
  const left = bounds.left - paddingX;
  const top = bounds.top - paddingTop;
  const right = bounds.right + paddingX;
  const bottom = bounds.bottom + paddingBottom;

  return {
    group: {
      id: String(input.groupId),
      parentId: null,
      name: String(input.name || 'Custom Node'),
      nodeIds: ownedNodes.map((node) => String(node.id)),
      disabled: input.disabled,
      minimized: false,
    },
    left,
    top,
    width: Math.max(240, right - left),
    height: Math.max(180, bottom - top),
    effectiveDisabled: input.disabled,
    depth: 0,
  };
}
