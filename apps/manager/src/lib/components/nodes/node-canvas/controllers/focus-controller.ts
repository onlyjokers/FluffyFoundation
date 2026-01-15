/**
 * Purpose: Editor focus utilities (focus nodes/groups, pending focus after sync) for NodeCanvas.
 */

import type { GraphState } from '$lib/nodes/types';
import type { GraphViewAdapter } from '../adapters/graph-view-adapter';
import { buildGroupPortIndex, isGroupPortNodeType } from '../utils/group-port-utils';

type Bounds = { left: number; top: number; right: number; bottom: number };
type AnyRecord = Record<string, unknown>;

export interface FocusController {
  focusNodeIds(nodeIdsRaw: string[], opts?: { force?: boolean }): void;
  focusGroupById(groupId: string): void;
  setPendingFocusNodeIds(nodeIdsRaw: string[]): void;
  flushPendingFocus(): void;
}

export interface CreateFocusControllerOptions {
  getContainer: () => HTMLDivElement | null;
  getGraphState: () => GraphState;
  exportGraph: () => GraphState;
  adapter: GraphViewAdapter;
  requestFramesUpdate: () => void;
  requestMinimapUpdate: () => void;
  getNodeGroups: () => AnyRecord[];
  getGroupFrames: () => AnyRecord[];
}

export function createFocusController(opts: CreateFocusControllerOptions): FocusController {
  const {
    getContainer,
    getGraphState,
    exportGraph,
    adapter,
    requestFramesUpdate,
    requestMinimapUpdate,
    getNodeGroups,
    getGroupFrames,
  } = opts;

  const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const mergeBounds = (base: Bounds | null, next: Bounds | null): Bounds | null => {
    if (!next) return base;
    if (!base) return { ...next };
    return {
      left: Math.min(base.left, next.left),
      top: Math.min(base.top, next.top),
      right: Math.max(base.right, next.right),
      bottom: Math.max(base.bottom, next.bottom),
    };
  };

  let pendingFocusNodeIds: string[] | null = null;

  const focusBounds = (bounds: Bounds | null, opts: { force?: boolean } = {}) => {
    const container = getContainer();
    if (!container) return;
    if (!bounds) return;

    const w = bounds.right - bounds.left;
    const h = bounds.bottom - bounds.top;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 1 || h <= 1) return;

    if (!opts.force) {
      const t = adapter.getViewportTransform();
      const k = Number(t?.k ?? 1) || 1;
      const tx = Number(t?.tx ?? 0) || 0;
      const ty = Number(t?.ty ?? 0) || 0;

      const visibleLeft = -tx / k;
      const visibleTop = -ty / k;
      const visibleRight = (container.clientWidth - tx) / k;
      const visibleBottom = (container.clientHeight - ty) / k;

      const marginX = 48 / k;
      const marginY = 64 / k;
      const fullyVisible =
        bounds.left >= visibleLeft + marginX &&
        bounds.right <= visibleRight - marginX &&
        bounds.top >= visibleTop + marginY &&
        bounds.bottom <= visibleBottom - marginY;

      if (fullyVisible) return;
    }

    const marginX = 120;
    const marginY = 140;
    const availW = Math.max(240, container.clientWidth - marginX * 2);
    const availH = Math.max(180, container.clientHeight - marginY * 2);

    let k = Math.min(availW / w, availH / h);
    if (!Number.isFinite(k) || k <= 0) k = 1;
    k = clampNumber(k, 0.08, 2.2);

    const cx = (bounds.left + bounds.right) / 2;
    const cy = (bounds.top + bounds.bottom) / 2;
    const tx = container.clientWidth / 2 - cx * k;
    const ty = container.clientHeight / 2 - cy * k;

    adapter.setViewportTransform({ k, tx, ty });
    requestMinimapUpdate();
    requestFramesUpdate();
  };

  const focusNodeIds = (nodeIdsRaw: string[], opts: { force?: boolean } = {}) => {
    const container = getContainer();
    if (!container) return;

    const state = getGraphState();
    const nodeById = new Map((state.nodes ?? []).map((n) => [String((n as AnyRecord).id), n]));
    const typeByNodeId = new Map((state.nodes ?? []).map((n) => [String((n as AnyRecord).id), String((n as AnyRecord).type ?? '')]));

    const ids = (nodeIdsRaw ?? []).map((id) => String(id)).filter(Boolean);
    const nodeIds = ids.filter((id) => {
      const type = typeByNodeId.get(id) ?? '';
      return Boolean(type) && !isGroupPortNodeType(type);
    });
    if (nodeIds.length === 0) return;

    const getNodeBoundsApprox = (nodeId: string): Bounds | null => {
      const node = nodeById.get(String(nodeId));
      const pos = (node as AnyRecord)?.position;
      const x = Number(pos?.x ?? 0);
      const y = Number(pos?.y ?? 0);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      const w = 230;
      const h = 100;
      return { left: x, top: y, right: x + w, bottom: y + h };
    };

    let bounds: Bounds | null = null;
    for (const id of nodeIds) {
      const raw = adapter.getNodeBounds(id);
      const usable = (() => {
        if (!raw) return null;
        const bw = raw.right - raw.left;
        const bh = raw.bottom - raw.top;
        if (!Number.isFinite(bw) || !Number.isFinite(bh)) return null;
        if (bw < 40 || bh < 30) return null;
        return raw;
      })();
      bounds = mergeBounds(bounds, usable ?? getNodeBoundsApprox(id));
    }
    focusBounds(bounds, opts);
  };

  const focusGroupById = (groupId: string) => {
    const targetId = String(groupId ?? '');
    if (!targetId) return;

    const groups = getNodeGroups();
    if (!Array.isArray(groups) || groups.length === 0) return;

    const byId = new Map<string, AnyRecord>();
    const childrenByParentId = new Map<string, string[]>();

    for (const g of groups) {
      const id = String(g?.id ?? '');
      if (!id) continue;
      byId.set(id, g);

      const pid = g?.parentId ? String(g.parentId) : '';
      if (!pid) continue;
      const list = childrenByParentId.get(pid) ?? [];
      list.push(id);
      childrenByParentId.set(pid, list);
    }

    const groupIds = new Set<string>();
    const stack = [targetId];
    while (stack.length > 0) {
      const id = stack.pop();
      if (!id || groupIds.has(id)) continue;
      groupIds.add(id);
      for (const childId of childrenByParentId.get(id) ?? []) stack.push(childId);
    }

    // Prefer frame-based focus (accounts for group padding + child groups), then include Group Activate port nodes.
    let bounds: Bounds | null = null;
    const frames = getGroupFrames();
    if (Array.isArray(frames) && frames.length > 0) {
      const frame = frames.find((f) => String(f?.group?.id ?? '') === targetId) ?? null;
      const left = Number(frame?.left);
      const top = Number(frame?.top);
      const width = Number(frame?.width);
      const height = Number(frame?.height);
      if (Number.isFinite(left) && Number.isFinite(top) && Number.isFinite(width) && Number.isFinite(height)) {
        bounds = { left, top, right: left + width, bottom: top + height };
      }
    }

    if (groupIds.size > 0) {
      const state = exportGraph();
      const index = buildGroupPortIndex(state);
      const nodeById = new Map((state.nodes ?? []).map((n) => [String((n as AnyRecord).id), n]));

      const getPortBoundsApprox = (nodeId: string): Bounds | null => {
        const node = nodeById.get(String(nodeId));
        const x = Number((node as AnyRecord)?.position?.x ?? 0);
        const y = Number((node as AnyRecord)?.position?.y ?? 0);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        const w = 80;
        const h = 44;
        return { left: x, top: y, right: x + w, bottom: y + h };
      };

      for (const gid of groupIds) {
        const portId = index.get(String(gid))?.gateId;
        if (!portId) continue;
        bounds = mergeBounds(bounds, adapter.getNodeBounds(String(portId)) ?? getPortBoundsApprox(portId));
      }
    }

    const nodeIdsSet = new Set<string>();
    for (const gid of groupIds) {
      const g = byId.get(gid);
      for (const nid of g?.nodeIds ?? []) {
        const id = String(nid);
        if (id) nodeIdsSet.add(id);
      }
    }

    if (bounds) {
      focusBounds(bounds, { force: true });
      return;
    }

    focusNodeIds(Array.from(nodeIdsSet), { force: true });
  };

  const setPendingFocusNodeIds = (nodeIdsRaw: string[]) => {
    const ids = (nodeIdsRaw ?? []).map((id) => String(id)).filter(Boolean);
    pendingFocusNodeIds = ids.length > 0 ? ids : null;
  };

  const flushPendingFocus = () => {
    if (!pendingFocusNodeIds || pendingFocusNodeIds.length === 0) return;
    const ids = pendingFocusNodeIds;
    pendingFocusNodeIds = null;
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => focusNodeIds(ids));
    } else {
      focusNodeIds(ids);
    }
  };

  return { focusNodeIds, focusGroupById, setPendingFocusNodeIds, flushPendingFocus };
}
