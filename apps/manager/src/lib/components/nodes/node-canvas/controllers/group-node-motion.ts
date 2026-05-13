/**
 * Purpose: Plan and animate node movements caused by group frame collision handling.
 */
import type { GraphState } from '$lib/nodes/types';
import type { GraphViewAdapter, NodeBounds } from '../adapters';
import { isGroupDecorationNodeType } from '../groups/group-node-types';
import { boundsIntersect, pickMoveDelta } from './group-bounds';
import type { FrameMoveContext } from './group-types';

export type NodeTranslation = {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

export type PlanNodesOutOfBoundsOptions = {
  bounds: NodeBounds;
  excludeNodeIds: Set<string>;
  frameMoves?: FrameMoveContext;
  graph: GraphState;
  adapter: Pick<GraphViewAdapter, 'getNodeBounds' | 'getNodePosition' | 'getViewportTransform'>;
};

export function planNodesOutOfBounds(options: PlanNodesOutOfBoundsOptions): NodeTranslation[] {
  const { bounds, excludeNodeIds, frameMoves, graph, adapter } = options;
  const t = adapter.getViewportTransform();
  const zoom = t?.k && Number.isFinite(t.k) && t.k > 0 ? t.k : 1;
  const margin = 24 / zoom;
  const updates: NodeTranslation[] = [];
  const skipNodeIds = new Set(excludeNodeIds);

  const moveFrame = (frameId: string): boolean => {
    if (!frameMoves) return false;
    if (frameMoves.movedFrameIds.has(frameId)) return false;
    const frame = frameMoves.frameById.get(frameId);
    if (!frame) return false;
    if (!boundsIntersect(bounds, frame.bounds)) return false;

    for (const nodeId of frame.nodeIds) {
      if (excludeNodeIds.has(String(nodeId))) return false;
    }

    const pick = pickMoveDelta(bounds, frame.bounds, margin);
    if (!pick) return false;

    for (const nodeId of frame.nodeIds) {
      const id = String(nodeId);
      if (skipNodeIds.has(id)) continue;
      const pos = adapter.getNodePosition(id);
      if (!pos) continue;
      updates.push({
        id,
        from: { x: pos.x, y: pos.y },
        to: { x: pos.x + pick.dx, y: pos.y + pick.dy },
      });
      skipNodeIds.add(id);
    }

    frameMoves.movedFrameIds.add(frameId);
    return true;
  };

  for (const node of graph.nodes ?? []) {
    const id = String(node.id ?? '');
    if (!id || skipNodeIds.has(id)) continue;
    const type = String(node?.type ?? '');
    if (isGroupDecorationNodeType(type)) continue;
    const b = adapter.getNodeBounds(id);
    if (!b) continue;

    const cx = (b.left + b.right) / 2;
    const cy = (b.top + b.bottom) / 2;
    const inside = cx > bounds.left && cx < bounds.right && cy > bounds.top && cy < bounds.bottom;
    if (!inside) continue;

    if (frameMoves) {
      const frameIds = frameMoves.nodeToFrameIds.get(id);
      if (frameIds?.length) {
        let moved = false;
        for (const frameId of frameIds) {
          if (moveFrame(frameId)) {
            moved = true;
            break;
          }
        }
        if (moved) continue;
      }
    }

    const pick = pickMoveDelta(bounds, b, margin);
    if (!pick) continue;

    const pos = adapter.getNodePosition(id) ?? { x: b.left, y: b.top };
    updates.push({
      id,
      from: { x: pos.x, y: pos.y },
      to: { x: pos.x + pick.dx, y: pos.y + pick.dy },
    });
    skipNodeIds.add(id);
  }

  return updates;
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
