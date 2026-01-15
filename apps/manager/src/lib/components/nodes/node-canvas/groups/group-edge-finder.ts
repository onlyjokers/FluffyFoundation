/**
 * Purpose: Locate group gate/proxy edge targets during connection drag interactions.
 */
import type { GroupFrame } from '../controllers/group-controller';

type GroupEdgeFinderOptions = {
  getFrames: () => GroupFrame[];
  clientToGraph: (x: number, y: number) => { x: number; y: number };
  getScale: () => number;
};

export type GroupGateTarget = { groupId: string };

export type GroupEdgeTarget = { groupId: string; side: 'input' | 'output'; frame: GroupFrame };

export const createGroupEdgeFinder = (opts: GroupEdgeFinderOptions) => {
  const findGroupGateTargetAt = (clientX: number, clientY: number): GroupGateTarget | null => {
    const frames = opts.getFrames() ?? [];
    if (frames.length === 0) return null;

    const pos = opts.clientToGraph(clientX, clientY);
    const k = opts.getScale() || 1;
    const radius = 22 / k;

    let best: { groupId: string; dist: number; depth: number; area: number } | null = null;

    for (const frame of frames) {
      const groupId = String(frame?.group?.id ?? '');
      if (!groupId) continue;
      const left = Number(frame.left ?? 0);
      const top = Number(frame.top ?? 0);
      const width = Number(frame.width ?? 0);
      const height = Number(frame.height ?? 0);
      if (
        !Number.isFinite(left) ||
        !Number.isFinite(top) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height)
      )
        continue;

      // Must stay in sync with Group Gate node placement offsets in `group-port-nodes-controller.ts`.
      const isMinimized = Boolean(frame.group?.minimized);
      const gateCenterX = left + (isMinimized ? 12 : 18) + 7;
      const gateCenterY = top + 12 + 4 + 7;
      const dx = pos.x - gateCenterX;
      const dy = pos.y - gateCenterY;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) continue;

      const depth = Number(frame.depth ?? 0) || 0;
      const area = Math.max(0, width) * Math.max(0, height);

      if (
        !best ||
        dist < best.dist - 0.001 ||
        (Math.abs(dist - best.dist) <= 0.001 &&
          (depth > best.depth || (depth === best.depth && area < best.area)))
      ) {
        best = { groupId, dist, depth, area };
      }
    }

    return best ? { groupId: best.groupId } : null;
  };

  const findGroupProxyEdgeTargetAt = (
    clientX: number,
    clientY: number
  ): GroupEdgeTarget | null => {
    const frames = opts.getFrames() ?? [];
    if (frames.length === 0) return null;

    const pos = opts.clientToGraph(clientX, clientY);
    const k = opts.getScale() || 1;
    const threshold = 18 / k;
    const yMargin = 14 / k;

    let best: {
      groupId: string;
      side: 'input' | 'output';
      dist: number;
      depth: number;
      area: number;
      frame: GroupFrame;
    } | null = null;

    for (const frame of frames) {
      const groupId = String(frame?.group?.id ?? '');
      if (!groupId) continue;
      const left = Number(frame.left ?? 0);
      const top = Number(frame.top ?? 0);
      const width = Number(frame.width ?? 0);
      const height = Number(frame.height ?? 0);
      const right = left + width;
      const bottom = top + height;

      if (
        !Number.isFinite(left) ||
        !Number.isFinite(top) ||
        !Number.isFinite(right) ||
        !Number.isFinite(bottom)
      )
        continue;

      if (pos.y < top - yMargin || pos.y > bottom + yMargin) continue;

      const dl = Math.abs(pos.x - left);
      const dr = Math.abs(pos.x - right);
      if (dl > threshold && dr > threshold) continue;

      const side: 'input' | 'output' = dl <= dr ? 'input' : 'output';
      const dist = side === 'input' ? dl : dr;
      const depth = Number(frame.depth ?? 0) || 0;
      const area = Math.max(0, width) * Math.max(0, height);

      if (
        !best ||
        dist < best.dist - 0.001 ||
        (Math.abs(dist - best.dist) <= 0.001 &&
          (depth > best.depth || (depth === best.depth && area < best.area)))
      ) {
        best = { groupId, side, dist, depth, area, frame };
      }
    }

    return best ? { groupId: best.groupId, side: best.side, frame: best.frame } : null;
  };

  return { findGroupGateTargetAt, findGroupProxyEdgeTargetAt };
};
