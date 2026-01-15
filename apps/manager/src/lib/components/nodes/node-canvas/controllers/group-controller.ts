/**
 * Purpose: Node group + marquee selection controller for NodeCanvas.
 */
import { get, writable, type Writable } from 'svelte/store';
import type { LocalLoop } from '$lib/nodes';
import type { GraphState, NodeInstance } from '$lib/nodes/types';
import { nodeRegistry } from '$lib/nodes';
import { audienceClients } from '$lib/stores/manager';
import type { GraphViewAdapter, NodeBounds } from '../adapters';
import { normalizeGroupList } from '../groups/normalize-group-list';
import { isGroupDecorationNodeType } from '../groups/group-node-types';
import { groupIdFromNode, isGroupPortNodeType } from '../utils/group-port-utils';


export type NodeGroup = {
  id: string;
  parentId: string | null;
  name: string;
  nodeIds: string[];
  disabled: boolean;
  /** When true, the group frame collapses into a node-like form and hides its subtree nodes/connections. */
  minimized: boolean;
  /** Runtime gate from Group Gate port; defaults to true when unset. */
  runtimeActive?: boolean;
};

export type GroupFrame = {
  group: NodeGroup;
  left: number;
  top: number;
  width: number;
  height: number;
  effectiveDisabled: boolean;
  depth: number;
};
export type GroupEditToast = { groupId: string; message: string } | null;

export type FrameInfo = {
  id: string;
  kind: 'group' | 'loop';
  nodeIds: Set<string>;
  bounds: NodeBounds;
};

export type FrameMoveContext = {
  frameById: Map<string, FrameInfo>;
  nodeToFrameIds: Map<string, string[]>;
  movedFrameIds: Set<string>;
};

export type GroupController = {
  nodeGroups: Writable<NodeGroup[]>;
  groupFrames: Writable<GroupFrame[]>;
  groupSelectionNodeIds: Writable<Set<string>>;
  groupSelectionBounds: Writable<{ left: number; top: number; width: number; height: number } | null>;
  selectedGroupId: Writable<string | null>;
  editModeGroupId: Writable<string | null>;
  canvasToast: Writable<string | null>;
  groupEditToast: Writable<GroupEditToast>;
  groupDisabledNodeIds: Writable<Set<string>>;
  marqueeRect: Writable<{ left: number; top: number; width: number; height: number } | null>;
  requestFramesUpdate: () => void;
  setGroups: (groups: NodeGroup[]) => void;
  appendGroups: (groups: NodeGroup[]) => void;
  /** Reconcile group membership after nodes are removed from the graph. Returns removed group IDs. */
  reconcileGraphNodes: (graph?: GraphState) => string[];
  setRuntimeActiveByGroupId: (activeById: Map<string, boolean>) => void;
  applyHighlights: () => Promise<void>;
  scheduleHighlight: () => void;
  clearSelection: () => void;
  createGroupFromSelection: () => void;
  toggleGroupDisabled: (groupId: string) => void;
  toggleGroupMinimized: (groupId: string) => void;
  disassembleGroup: (groupId: string) => void;
  renameGroup: (groupId: string, name: string) => void;
  toggleGroupEditMode: (groupId: string) => void;
  autoAddNodeToGroupFromPosition: (nodeId: string, graphPos: { x: number; y: number }) => void;
  autoAddNodeToGroupFromConnectDrop: (
    initialNodeId: string,
    newNodeId: string,
    dropGraphPos: { x: number; y: number }
  ) => void;
  handleDroppedNodesAfterDrag: (nodeIds: string[]) => void;
  onPointerDown: (event: PointerEvent) => void;
  destroy: () => void;
  isProgrammaticTranslate: () => boolean;
  beginProgrammaticTranslate: () => void;
  endProgrammaticTranslate: () => void;
  computeLoopFrameBounds: (loop: LocalLoop) => NodeBounds | null;
  pushNodesOutOfBounds: (bounds: NodeBounds, excludeNodeIds: Set<string>, frameMoves?: FrameMoveContext) => void;
};

type GroupControllerOptions = {
  getContainer: () => HTMLDivElement | null;
  getAdapter: () => GraphViewAdapter | null;
  getGraphState: () => GraphState;
  /** Extra hidden nodes owned by host UI (e.g. expanded Custom Node mother instances). */
  getForcedHiddenNodeIds?: () => Set<string>;
  getLocalLoops: () => LocalLoop[];
  getLoopConstraintLoops: () => LocalLoop[];
  getDeployedLoopIds: () => Set<string>;
  setNodesDisabled: (ids: string[], disabled: boolean) => void;
  requestLoopFramesUpdate: () => void;
  requestMinimapUpdate: () => void;
  isSyncingGraph: () => boolean;
  stopAndRemoveLoop: (loop: LocalLoop) => void;
};

export function createGroupController(opts: GroupControllerOptions): GroupController {
  const nodeGroups = writable<NodeGroup[]>([]);
  const groupFrames = writable<GroupFrame[]>([]);
  const groupSelectionNodeIds = writable<Set<string>>(new Set());
  const groupSelectionBounds = writable<{ left: number; top: number; width: number; height: number } | null>(
    null
  );
  const selectedGroupId = writable<string | null>(null);
  const editModeGroupId = writable<string | null>(null);
  const canvasToast = writable<string | null>(null);
  const groupEditToast = writable<GroupEditToast>(null);
  const groupDisabledNodeIds = writable<Set<string>>(new Set());
  const marqueeRect = writable<{ left: number; top: number; width: number; height: number } | null>(null);

  let groupHighlightDirty = false;
  let groupEditToastTimeout: ReturnType<typeof setTimeout> | null = null;
  let canvasToastTimeout: ReturnType<typeof setTimeout> | null = null;

  let editModeGroupBounds: { left: number; top: number; right: number; bottom: number } | null = null;

  let isMarqueeDragging = false;
  let marqueeStart = { x: 0, y: 0 };
  let marqueeCurrent = { x: 0, y: 0 };
  let marqueePointerId: number | null = null;
  let marqueeMoveHandler: ((event: PointerEvent) => void) | null = null;
  let marqueeUpHandler: ((event: PointerEvent) => void) | null = null;

  let programmaticTranslateDepth = 0;
  const isProgrammaticTranslate = () => programmaticTranslateDepth > 0;
  const beginProgrammaticTranslate = () => {
    programmaticTranslateDepth += 1;
  };
  const endProgrammaticTranslate = () => {
    programmaticTranslateDepth = Math.max(0, programmaticTranslateDepth - 1);
  };

  let framesRaf = 0;

  const nodeLabel = (node: NodeInstance): string => {
    if (node.type === 'client-object') {
      const onlineCount = get(audienceClients).length;
      return `Client: ${onlineCount} online`;
    }
    return nodeRegistry.get(node.type)?.label ?? node.type;
  };

  const clearGroupEditToast = () => {
    groupEditToast.set(null);
    if (groupEditToastTimeout) {
      clearTimeout(groupEditToastTimeout);
      groupEditToastTimeout = null;
    }
  };

  const clearCanvasToast = () => {
    canvasToast.set(null);
    if (canvasToastTimeout) {
      clearTimeout(canvasToastTimeout);
      canvasToastTimeout = null;
    }
  };

  const showCanvasToast = (message: string, durationMs = 1400) => {
    const msg = String(message ?? '').trim();
    if (!msg) return;
    canvasToast.set(msg);
    if (canvasToastTimeout) clearTimeout(canvasToastTimeout);
    canvasToastTimeout = setTimeout(() => {
      canvasToast.set(null);
      canvasToastTimeout = null;
    }, durationMs);
  };

  const showGroupEditToast = (groupId: string, message: string) => {
    if (!groupId) return;
    groupEditToast.set({ groupId, message });
    if (groupEditToastTimeout) clearTimeout(groupEditToastTimeout);
    groupEditToastTimeout = setTimeout(() => {
      groupEditToast.set(null);
      groupEditToastTimeout = null;
    }, 1400);
  };

  const recomputeDisabledNodes = (nextGroups: NodeGroup[] = get(nodeGroups)) => {
    const prev = get(groupDisabledNodeIds);
    const next = new Set<string>();
    const graph = opts.getGraphState();
    const typeByNodeId = new Map((graph.nodes ?? []).map((node) => [String(node.id), String(node.type ?? '')]));

    for (const g of nextGroups) {
      const runtimeActive = g.runtimeActive ?? true;
      if (!g.disabled && runtimeActive) continue;
      for (const nodeId of g.nodeIds ?? []) {
        const id = String(nodeId);
        if (!id) continue;
        const type = typeByNodeId.get(id) ?? '';
        // Group decoration nodes are UI-only and should stay enabled even when the group is gated.
        if (isGroupDecorationNodeType(type)) continue;
        next.add(id);
      }
    }

    groupDisabledNodeIds.set(next);

    const toDisable = Array.from(next).filter((id) => !prev.has(id));
    const toEnable = Array.from(prev).filter((id) => !next.has(id));
    if (toDisable.length > 0) opts.setNodesDisabled(toDisable, true);
    if (toEnable.length > 0) opts.setNodesDisabled(toEnable, false);
    scheduleHighlight();
  };

  const scheduleHighlight = () => {
    groupHighlightDirty = true;
    if (!opts.isSyncingGraph()) void applyHighlights();
  };

  const applyHighlights = async () => {
    const adapter = opts.getAdapter();
    if (!adapter) return;
    if (!groupHighlightDirty) return;
    groupHighlightDirty = false;

    const disabled = get(groupDisabledNodeIds);
    const selected = get(groupSelectionNodeIds);
    const graph = opts.getGraphState();
    const groups = get(nodeGroups);
    const forcedHidden = opts.getForcedHiddenNodeIds?.() ?? new Set<string>();

    const hiddenNodeIds = new Set<string>();
    const minimizedGroupIds: string[] = [];
    for (const g of groups) {
      if (!g.minimized) continue;
      minimizedGroupIds.push(String(g.id));
      for (const nodeId of g.nodeIds ?? []) hiddenNodeIds.add(String(nodeId));
    }
    const minimizedGroupIdSet = new Set(minimizedGroupIds);

    const hiddenGroupIds = new Set<string>();
    if (minimizedGroupIds.length > 0) {
      const { childrenByParentId } = buildGroupIndex(groups);
      const stack: string[] = [];
      for (const gid of minimizedGroupIds) {
        for (const childId of childrenByParentId.get(String(gid)) ?? []) stack.push(String(childId));
      }
      while (stack.length > 0) {
        const next = String(stack.pop() ?? '');
        if (!next || hiddenGroupIds.has(next)) continue;
        hiddenGroupIds.add(next);
        for (const childId of childrenByParentId.get(next) ?? []) stack.push(String(childId));
      }
    }

    const hiddenNodesEffective = new Set<string>();
    for (const node of graph.nodes ?? []) {
      const id = String(node.id);
      if (!id) continue;

      const type = String(node.type ?? '');
      const nextHidden =
        forcedHidden.has(id) ||
        hiddenNodeIds.has(id) ||
        (isGroupDecorationNodeType(type) && hiddenGroupIds.has(groupIdFromNode(node)));
      if (nextHidden) hiddenNodesEffective.add(id);

      const nextDisabled = disabled.has(id);
      const nextSelected = selected.has(id);
      const nextGroupMinimized =
        isGroupPortNodeType(type) && minimizedGroupIdSet.has(groupIdFromNode(node));
      const prev = adapter.getNodeVisualState(id);

      const patch: { hidden?: boolean; groupDisabled?: boolean; groupSelected?: boolean; groupMinimized?: boolean } = {};
      if (Boolean(prev?.hidden) !== nextHidden) patch.hidden = nextHidden;
      if (Boolean(prev?.groupDisabled) !== nextDisabled) patch.groupDisabled = nextDisabled;
      if (Boolean(prev?.groupSelected) !== nextSelected) patch.groupSelected = nextSelected;
      if (Boolean(prev?.groupMinimized) !== nextGroupMinimized) patch.groupMinimized = nextGroupMinimized;
      if (Object.keys(patch).length > 0) await adapter.setNodeVisualState(id, patch);
    }

    for (const conn of graph.connections ?? []) {
      const id = String(conn.id);
      if (!id) continue;
      const nextHidden =
        hiddenNodesEffective.has(String(conn.sourceNodeId)) || hiddenNodesEffective.has(String(conn.targetNodeId));
      const prev = adapter.getConnectionVisualState(id);
      const patch: { hidden?: boolean } = {};
      if (Boolean(prev?.hidden) !== nextHidden) patch.hidden = nextHidden;
      if (Object.keys(patch).length > 0) await adapter.setConnectionVisualState(id, patch);
    }
  };

  const mergeBounds = (base: NodeBounds | null, next: NodeBounds | null): NodeBounds | null => {
    if (!next) return base;
    if (!base) return { ...next };
    return {
      left: Math.min(base.left, next.left),
      top: Math.min(base.top, next.top),
      right: Math.max(base.right, next.right),
      bottom: Math.max(base.bottom, next.bottom),
    };
  };

  const boundsIntersect = (a: NodeBounds, b: NodeBounds): boolean =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  const pickMoveDelta = (bounds: NodeBounds, target: NodeBounds, margin: number) => {
    const moveLeft = bounds.left - margin - target.right;
    const moveRight = bounds.right + margin - target.left;
    const moveUp = bounds.top - margin - target.bottom;
    const moveDown = bounds.bottom + margin - target.top;

    const candidates = [
      { dx: moveLeft, dy: 0 },
      { dx: moveRight, dy: 0 },
      { dx: 0, dy: moveUp },
      { dx: 0, dy: moveDown },
    ];
    candidates.sort((a, b) => Math.abs(a.dx) + Math.abs(a.dy) - (Math.abs(b.dx) + Math.abs(b.dy)));
    return candidates[0] ?? null;
  };

  const buildGroupIndex = (groups: NodeGroup[]) => {
    const byId = new Map<string, NodeGroup>();
    const childrenByParentId = new Map<string, string[]>();

    for (const group of groups) {
      const id = String(group.id);
      const parentId = group.parentId ? String(group.parentId) : null;
      const normalized: NodeGroup = {
        ...group,
        id,
        parentId,
        nodeIds: (group.nodeIds ?? []).map((nodeId) => String(nodeId)),
        minimized: Boolean(group.minimized),
      };
      byId.set(id, normalized);
      if (!parentId) continue;
      const list = childrenByParentId.get(parentId) ?? [];
      list.push(id);
      childrenByParentId.set(parentId, list);
    }

    return { byId, childrenByParentId };
  };

  // Include child frames so parent bounds reflect nested groups.
  const computeGroupFrameBoundsWithChildren = (
    groupId: string,
    byId: Map<string, NodeGroup>,
    childrenByParentId: Map<string, string[]>,
    cache: Map<string, NodeBounds | null>,
    visiting: Set<string>,
    hiddenNodeIds: Set<string>
  ): NodeBounds | null => {
    const cached = cache.get(groupId);
    if (cached !== undefined) return cached;
    if (visiting.has(groupId)) return null;

    const group = byId.get(groupId);
    if (!group) return null;

    visiting.add(groupId);

    const minimized = Boolean(group.minimized);
    const isSubGroup = Boolean(group.parentId);
    const paddingX = isSubGroup ? 36 : 52;
    const paddingTop = isSubGroup ? 54 : 64;
    const paddingBottom = isSubGroup ? 40 : 52;

    const loopPaddingX = 56;
    const loopPaddingTop = 64;
    const loopPaddingBottom = 64;

    let bounds: NodeBounds | null = null;
    const adapter = opts.getAdapter();
    if (!adapter) return null;

    const graph = opts.getGraphState();
    const nodeById = new Map((graph.nodes ?? []).map((node) => [String(node.id), node]));
    const typeByNodeId = new Map((graph.nodes ?? []).map((node) => [String(node.id), String(node.type ?? '')]));
    const isDecorationNodeId = (nodeId: string): boolean => {
      const type = typeByNodeId.get(String(nodeId)) ?? '';
      return isGroupDecorationNodeType(type);
    };

    const unionBoundsFromPositions = (nodeIds: string[]) => {
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;

      for (const nodeId of nodeIds) {
        if (isDecorationNodeId(nodeId)) continue;
        const node = nodeById.get(String(nodeId));
        if (!node) continue;
        const x = Number(node.position?.x ?? 0);
        const y = Number(node.position?.y ?? 0);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }

      const ok =
        Number.isFinite(minX) &&
        Number.isFinite(minY) &&
        Number.isFinite(maxX) &&
        Number.isFinite(maxY);
      if (!ok) return null;
      return { minX, minY, maxX, maxY, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
    };

    if (minimized) {
      const posBounds = unionBoundsFromPositions(group.nodeIds ?? []);
      const centerX = posBounds?.centerX ?? 220;
      const centerY = posBounds?.centerY ?? 160;

      const proxyNodes = (graph.nodes ?? []).filter(
        (n) =>
          String(n?.type ?? '') === 'group-proxy' &&
          String((n?.config as Record<string, unknown>)?.groupId ?? '') === groupId
      );
      const inputProxyCount = proxyNodes.filter((n) => String((n?.config as Record<string, unknown>)?.direction ?? 'output') === 'input').length;
      const outputProxyCount = Math.max(0, proxyNodes.length - inputProxyCount);
      const portRows = Math.max(1, Math.max(inputProxyCount, outputProxyCount));

      // Minimized Group should look like a standard node: title bar + port rows.
      const width = 230;
      const headerHeight = 44;
      const rowHeight = 28;
      const height = Math.max(84, headerHeight + portRows * rowHeight + 12);
      const compact = {
        left: centerX - width / 2,
        top: centerY - height / 2,
        right: centerX + width / 2,
        bottom: centerY + height / 2,
      };
      cache.set(groupId, compact);
      visiting.delete(groupId);
      return compact;
    }

    const unionBoundsGraph = (nodeIds: string[]): NodeBounds | null => {
      let merged: NodeBounds | null = null;
      for (const nodeId of nodeIds) {
        if (hiddenNodeIds.has(String(nodeId))) continue;
        if (isDecorationNodeId(nodeId)) continue;
        const b = adapter.getNodeBounds(String(nodeId));
        merged = mergeBounds(merged, b);
      }
      return merged;
    };

    bounds = mergeBounds(bounds, unionBoundsGraph(group.nodeIds ?? []));

    const groupNodeSet = new Set((group.nodeIds ?? []).map((id) => String(id)));
    for (const loop of opts.getLocalLoops()) {
      if (!loop?.nodeIds?.length) continue;
      const fullyContained = loop.nodeIds.every((id) => groupNodeSet.has(String(id)));
      if (!fullyContained) continue;
      const lb = unionBoundsGraph(loop.nodeIds.map(String));
      if (!lb) continue;
      bounds = mergeBounds(bounds, {
        left: lb.left - loopPaddingX,
        top: lb.top - loopPaddingTop,
        right: lb.right + loopPaddingX,
        bottom: lb.bottom + loopPaddingBottom,
      });
    }

    const children = childrenByParentId.get(groupId) ?? [];
    for (const childId of children) {
      const childBounds = computeGroupFrameBoundsWithChildren(
        childId,
        byId,
        childrenByParentId,
        cache,
        visiting,
        hiddenNodeIds
      );
      bounds = mergeBounds(bounds, childBounds);
    }

    visiting.delete(groupId);

    if (!bounds) {
      cache.set(groupId, null);
      return null;
    }

    const padded = {
      left: bounds.left - paddingX,
      top: bounds.top - paddingTop,
      right: bounds.right + paddingX,
      bottom: bounds.bottom + paddingBottom,
    };
    cache.set(groupId, padded);
    return padded;
  };

  const computeGroupFrameBounds = (group: NodeGroup): NodeBounds | null => {
    const groupsSnapshot = get(nodeGroups);
    const { byId, childrenByParentId } = buildGroupIndex(groupsSnapshot);
    const cache = new Map<string, NodeBounds | null>();

    const hiddenNodeIds = new Set<string>();
    for (const g of groupsSnapshot) {
      if (!g.minimized) continue;
      for (const nodeId of g.nodeIds ?? []) hiddenNodeIds.add(String(nodeId));
    }
    return computeGroupFrameBoundsWithChildren(
      String(group.id),
      byId,
      childrenByParentId,
      cache,
      new Set(),
      hiddenNodeIds
    );
  };

  const computeLoopFrameBounds = (loop: LocalLoop): NodeBounds | null => {
    const paddingX = 56;
    const paddingTop = 64;
    const paddingBottom = 64;

    const adapter = opts.getAdapter();
    if (!adapter) return null;

    let base: NodeBounds | null = null;
    for (const nodeId of loop.nodeIds ?? []) {
      const b = adapter.getNodeBounds(String(nodeId));
      base = mergeBounds(base, b);
    }
    if (!base) return null;

    return {
      left: base.left - paddingX,
      top: base.top - paddingTop,
      right: base.right + paddingX,
      bottom: base.bottom + paddingBottom,
    };
  };

  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

  const animateNodeTranslations = (
    updates: { id: string; from: { x: number; y: number }; to: { x: number; y: number } }[],
    durationMs = 320
  ) => {
    const adapter = opts.getAdapter();
    if (!adapter) return;
    if (typeof requestAnimationFrame === 'undefined') return;
    if (updates.length === 0) return;

    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    programmaticTranslateDepth += 1;

    const step = (now: number) => {
      const current = typeof performance !== 'undefined' ? now : Date.now();
      const rawT = (current - start) / durationMs;
      const tt = Math.max(0, Math.min(1, rawT));
      const eased = easeOutCubic(tt);

      for (const u of updates) {
        const x = u.from.x + (u.to.x - u.from.x) * eased;
        const y = u.from.y + (u.to.y - u.from.y) * eased;
        adapter.setNodePosition(u.id, x, y);
      }

      if (tt < 1) {
        requestAnimationFrame(step);
        return;
      }

      programmaticTranslateDepth = Math.max(0, programmaticTranslateDepth - 1);
      opts.requestLoopFramesUpdate();
      opts.requestMinimapUpdate();
    };

    requestAnimationFrame(step);
  };

  const pushNodesOutOfBounds = (bounds: NodeBounds, excludeNodeIds: Set<string>, frameMoves?: FrameMoveContext) => {
    const adapter = opts.getAdapter();
    if (!adapter) return;

    const t = adapter.getViewportTransform();
    const zoom = t?.k && Number.isFinite(t.k) && t.k > 0 ? t.k : 1;
    const margin = 24 / zoom;
    const updates: { id: string; from: { x: number; y: number }; to: { x: number; y: number } }[] = [];
    const skipNodeIds = new Set(excludeNodeIds);

    // Push full frames as units when possible so internal node layout stays intact.
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

      const dx = pick.dx;
      const dy = pick.dy;

      for (const nodeId of frame.nodeIds) {
        const id = String(nodeId);
        if (skipNodeIds.has(id)) continue;
        const pos = adapter.getNodePosition(id);
        if (!pos) continue;
        updates.push({ id, from: { x: pos.x, y: pos.y }, to: { x: pos.x + dx, y: pos.y + dy } });
        skipNodeIds.add(id);
      }

      frameMoves.movedFrameIds.add(frameId);
      return true;
    };

    for (const node of opts.getGraphState().nodes ?? []) {
      const id = String(node.id ?? '');
      if (!id) continue;
      if (skipNodeIds.has(id)) continue;
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

      const to = { x: pos.x + pick.dx, y: pos.y + pick.dy };
      updates.push({ id, from: { x: pos.x, y: pos.y }, to });
      skipNodeIds.add(id);
    }

    animateNodeTranslations(updates);
  };

  const handleDroppedNodesAfterDrag = (nodeIds: string[]) => {
    if (!nodeIds.length) return;
    if (isProgrammaticTranslate()) return;

    const adapter = opts.getAdapter();
    if (!adapter) return;

    const nodeCenterCache = new Map<string, { cx: number; cy: number }>();
    const getNodeCenter = (nodeId: string) => {
      const id = String(nodeId);
      const cached = nodeCenterCache.get(id);
      if (cached) return cached;
      const b = adapter.getNodeBounds(id);
      if (!b) return null;
      const cx = (b.left + b.right) / 2;
      const cy = (b.top + b.bottom) / 2;
      const v = { cx, cy };
      nodeCenterCache.set(id, v);
      return v;
    };

    const groupsSnapshot = get(nodeGroups);
    const loopsSnapshot = opts.getLoopConstraintLoops();

    const groupNodeSets = new Map<string, Set<string>>();
    for (const g of groupsSnapshot) {
      const gid = String(g.id);
      const set = new Set((g.nodeIds ?? []).map((id) => String(id)));
      groupNodeSets.set(gid, set);
    }

    const { byId, childrenByParentId } = buildGroupIndex(groupsSnapshot);

    const hiddenNodeIds = new Set<string>();
    for (const g of groupsSnapshot) {
      if (!g.minimized) continue;
      for (const nodeId of g.nodeIds ?? []) hiddenNodeIds.add(String(nodeId));
    }

    const groupBoundsCache = new Map<string, NodeBounds | null>();
    const computeGroupBoundsCached = (groupId: string) =>
      computeGroupFrameBoundsWithChildren(
        groupId,
        byId,
        childrenByParentId,
        groupBoundsCache,
        new Set(),
        hiddenNodeIds
      );

    const frameById = new Map<string, FrameInfo>();
    const loopNodeSets = new Map<string, Set<string>>();

    for (const loop of loopsSnapshot) {
      const loopId = String(loop.id ?? '');
      if (!loopId) continue;
      const nodeIds = new Set((loop.nodeIds ?? []).map((id) => String(id)));
      loopNodeSets.set(loopId, nodeIds);
      const bounds = computeLoopFrameBounds(loop);
      if (!bounds) continue;
      frameById.set(`loop:${loopId}`, {
        id: `loop:${loopId}`,
        kind: 'loop',
        nodeIds,
        bounds,
      });
    }

    const editId = get(editModeGroupId);
    for (const group of groupsSnapshot) {
      const groupId = String(group.id ?? '');
      if (!groupId) continue;
      const nodeIds = groupNodeSets.get(groupId) ?? new Set();

      let bounds: NodeBounds | null = null;
      if (editId && editModeGroupBounds && editId === groupId) {
        bounds = { ...editModeGroupBounds };
      } else {
        bounds = computeGroupBoundsCached(groupId);
      }
      if (!bounds) continue;
      frameById.set(`group:${groupId}`, {
        id: `group:${groupId}`,
        kind: 'group',
        nodeIds,
        bounds,
      });
    }

    const frameAreaById = new Map<string, number>();
    const nodeToFrameIds = new Map<string, string[]>();

    for (const [frameId, frame] of frameById.entries()) {
      const area = Math.max(
        0,
        (frame.bounds.right - frame.bounds.left) * (frame.bounds.bottom - frame.bounds.top)
      );
      frameAreaById.set(frameId, area);
      for (const nid of frame.nodeIds) {
        const id = String(nid);
        const list = nodeToFrameIds.get(id) ?? [];
        list.push(frameId);
        nodeToFrameIds.set(id, list);
      }
    }

    for (const [nodeId, list] of nodeToFrameIds.entries()) {
      list.sort((a, b) => {
        const areaA = frameAreaById.get(a) ?? Number.POSITIVE_INFINITY;
        const areaB = frameAreaById.get(b) ?? Number.POSITIVE_INFINITY;
        return areaA - areaB;
      });
      nodeToFrameIds.set(nodeId, list);
    }

    const frameMoves: FrameMoveContext | undefined =
      frameById.size > 0 ? { frameById, nodeToFrameIds, movedFrameIds: new Set() } : undefined;

    for (const loop of loopsSnapshot) {
      const loopId = String(loop.id ?? '');
      if (!loopId) continue;
      const frame = frameById.get(`loop:${loopId}`);
      const bounds = frame?.bounds;
      if (!bounds) continue;
      const loopNodeSet = loopNodeSets.get(loopId) ?? new Set();

      let shouldEnforce = false;
      for (const movedId of nodeIds) {
        const id = String(movedId);
        if (loopNodeSet.has(id)) {
          shouldEnforce = true;
          break;
        }
        const c = getNodeCenter(id);
        if (!c) continue;
        if (c.cx > bounds.left && c.cx < bounds.right && c.cy > bounds.top && c.cy < bounds.bottom) {
          shouldEnforce = true;
          break;
        }
      }
      if (!shouldEnforce) continue;

      pushNodesOutOfBounds(bounds, loopNodeSet, frameMoves);
    }

    if (editId && editModeGroupBounds) {
      const group = groupsSnapshot.find((g) => String(g.id) === String(editId)) ?? null;
      if (group) {
        const bounds: NodeBounds = { ...editModeGroupBounds };

        const nextSet = new Set((group.nodeIds ?? []).map((id) => String(id)));
        const typeByNodeId = new Map(
          opts.getGraphState().nodes.map((node) => [String(node.id), String(node.type ?? '')])
        );
        const added: string[] = [];
        const removed: string[] = [];

          for (const movedId of nodeIds) {
            const id = String(movedId);
            if (isGroupDecorationNodeType(typeByNodeId.get(id) ?? '')) continue;
            const c = getNodeCenter(id);
            if (!c) continue;
          const inside = c.cx > bounds.left && c.cx < bounds.right && c.cy > bounds.top && c.cy < bounds.bottom;

          if (inside && !nextSet.has(id)) {
            nextSet.add(id);
            added.push(id);
            const node = opts.getGraphState().nodes.find((n) => String(n.id) === id);
            const nodeName = node ? nodeLabel(node) : id;
            showGroupEditToast(group.id, `Add ${nodeName} to ${group.name ?? 'Group'}`);
          }

          if (!inside && nextSet.has(id)) {
            nextSet.delete(id);
            removed.push(id);
            const node = opts.getGraphState().nodes.find((n) => String(n.id) === id);
            const nodeName = node ? nodeLabel(node) : id;
            showGroupEditToast(group.id, `Remove ${nodeName} from ${group.name ?? 'Group'}`);
          }
        }

        if (added.length > 0 || removed.length > 0) {
          const groupsSnapshot = get(nodeGroups);
          const byId = new Map<string, NodeGroup>();
          const childrenByParentId = new Map<string, string[]>();

          for (const g of groupsSnapshot) {
            byId.set(String(g.id), g);
            const pid = g.parentId ? String(g.parentId) : '';
            if (!pid) continue;
            const list = childrenByParentId.get(pid) ?? [];
            list.push(String(g.id));
            childrenByParentId.set(pid, list);
          }

          const targetAndAncestors = new Set<string>();
          let cursor: string | null = String(group.id);
          while (cursor) {
            if (targetAndAncestors.has(cursor)) break;
            targetAndAncestors.add(cursor);
            const parentId: string = (() => {
              const rec = byId.get(cursor);
              return rec?.parentId ? String(rec.parentId) : '';
            })();
            cursor = parentId && byId.has(parentId) ? parentId : null;
          }

          const targetAndDescendants = new Set<string>();
          const stack = [String(group.id)];
          while (stack.length > 0) {
            const id = stack.pop();
            if (!id) continue;
            if (targetAndDescendants.has(id)) continue;
            targetAndDescendants.add(id);
            const children = childrenByParentId.get(id) ?? [];
            for (const childId of children) stack.push(childId);
          }

          const effectiveDisabled = Array.from(targetAndAncestors).some((id) => {
            const g = byId.get(id);
            const runtimeActive = g?.runtimeActive ?? true;
            return Boolean(g?.disabled) || !runtimeActive;
          });

          nodeGroups.update((groups) =>
            groups.map((g) => {
              const id = String(g.id);
              let changed = false;
              let nextNodeIds = Array.from((g.nodeIds ?? []).map((nid) => String(nid)));

              if (added.length > 0 && targetAndAncestors.has(id)) {
                const set = new Set(nextNodeIds);
                for (const nid of added) {
                  if (set.has(nid)) continue;
                  set.add(nid);
                  changed = true;
                }
                if (changed) nextNodeIds = Array.from(set);
              }

              if (removed.length > 0 && targetAndDescendants.has(id)) {
                const set = new Set(nextNodeIds);
                for (const nid of removed) {
                  if (!set.has(nid)) continue;
                  set.delete(nid);
                  changed = true;
                }
                if (changed) nextNodeIds = Array.from(set);
              }

              return changed ? { ...g, nodeIds: nextNodeIds } : g;
            })
          );
          recomputeDisabledNodes();
          opts.requestLoopFramesUpdate();

          if (effectiveDisabled && added.length > 0) {
            stopDeployedLoopsIntersecting(added.map(String));
          }
        }
      }
    }

    for (const group of groupsSnapshot) {
      if (editId && String(editId) === String(group.id)) continue;

      const frame = frameById.get(`group:${String(group.id)}`);
      const bounds = frame?.bounds ?? null;
      if (!bounds) continue;
      const groupNodeSet = groupNodeSets.get(String(group.id)) ?? new Set();

      let shouldEnforce = false;
      for (const movedId of nodeIds) {
        const id = String(movedId);
        if (groupNodeSet.has(id)) {
          shouldEnforce = true;
          break;
        }
        const c = getNodeCenter(id);
        if (!c) continue;
        if (c.cx > bounds.left && c.cx < bounds.right && c.cy > bounds.top && c.cy < bounds.bottom) {
          shouldEnforce = true;
          break;
        }
      }
      if (!shouldEnforce) continue;

      pushNodesOutOfBounds(bounds, groupNodeSet, frameMoves);
    }
  };

  const pickGroupAtPoint = (groups: NodeGroup[], gx: number, gy: number): NodeGroup | null => {
    let picked: NodeGroup | null = null;
    let pickedArea = Number.POSITIVE_INFINITY;

    for (const group of groups) {
      let bounds: NodeBounds | null = null;

      if (get(editModeGroupId) === group.id && editModeGroupBounds) {
        bounds = { ...editModeGroupBounds };
      } else {
        bounds = computeGroupFrameBounds(group);
      }

      if (!bounds) continue;
      const inside = gx >= bounds.left && gx <= bounds.right && gy >= bounds.top && gy <= bounds.bottom;
      if (!inside) continue;

      const area = (bounds.right - bounds.left) * (bounds.bottom - bounds.top);
      if (area < pickedArea) {
        picked = group;
        pickedArea = area;
      }
    }

    return picked;
  };

  const addNodeToGroupChain = (groupId: string, nodeId: string) => {
    const rootId = String(groupId ?? '');
      const createdId = String(nodeId ?? '');
      if (!rootId || !createdId) return;

      const createdType = String(opts.getGraphState().nodes.find((n) => String(n.id) === createdId)?.type ?? '');
      if (isGroupDecorationNodeType(createdType)) return;

    const groupsSnapshot = get(nodeGroups);
    const byId = new Map<string, NodeGroup>();
    for (const g of groupsSnapshot) byId.set(String(g.id), g);

    const targetAndAncestors = new Set<string>();
    let cursor: string | null = rootId;
    while (cursor) {
      if (targetAndAncestors.has(cursor)) break;
      targetAndAncestors.add(cursor);
      const parentId: string = (() => {
        const rec = byId.get(cursor);
        return rec?.parentId ? String(rec.parentId) : '';
      })();
      cursor = parentId && byId.has(parentId) ? parentId : null;
    }

    const effectiveDisabled = Array.from(targetAndAncestors).some((id) => {
      const g = byId.get(id);
      const runtimeActive = g?.runtimeActive ?? true;
      return Boolean(g?.disabled) || !runtimeActive;
    });

    let didAdd = false;
    nodeGroups.update((groups) =>
      groups.map((g) => {
        if (!targetAndAncestors.has(String(g.id))) return g;
        const set = new Set((g.nodeIds ?? []).map((id) => String(id)));
        if (set.has(createdId)) return g;
        set.add(createdId);
        if (String(g.id) === rootId) didAdd = true;
        return { ...g, nodeIds: Array.from(set) };
      })
    );

    if (!didAdd) return;

    recomputeDisabledNodes();
    opts.requestLoopFramesUpdate();
    opts.requestMinimapUpdate();

    if (effectiveDisabled) stopDeployedLoopsIntersecting([createdId]);
  };

  const autoAddNodeToGroupFromPosition = (nodeId: string, graphPos: { x: number; y: number }) => {
    const createdId = String(nodeId ?? '');
    if (!createdId) return;

    const gx = Number(graphPos?.x);
    const gy = Number(graphPos?.y);
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) return;

    const groupsSnapshot = get(nodeGroups);
    if (groupsSnapshot.length === 0) return;

    const picked = pickGroupAtPoint(groupsSnapshot, gx, gy);
    if (!picked) return;

    addNodeToGroupChain(picked.id, createdId);
  };

  const autoAddNodeToGroupFromConnectDrop = (
    initialNodeId: string,
    newNodeId: string,
    dropGraphPos: { x: number; y: number }
  ) => {
    const initialId = String(initialNodeId ?? '');
    const createdId = String(newNodeId ?? '');
    if (!initialId || !createdId) return;

    const gx = Number(dropGraphPos?.x);
    const gy = Number(dropGraphPos?.y);
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) return;

    const candidates = get(nodeGroups).filter((g) => (g.nodeIds ?? []).some((id) => String(id) === initialId));
    if (candidates.length === 0) return;

    const picked = pickGroupAtPoint(candidates, gx, gy);

    if (!picked) return;
    addNodeToGroupChain(picked.id, createdId);
  };

  const createGroupFromSelection = () => {
      const selectedRaw = Array.from(get(groupSelectionNodeIds)).map((id) => String(id));
      const graph = opts.getGraphState();
      const nodeById = new Map((graph.nodes ?? []).map((node) => [String(node.id), node]));
      const selected = selectedRaw.filter((id) => {
        const type = String(nodeById.get(id)?.type ?? '');
        return !isGroupDecorationNodeType(type);
      });
    if (selected.length === 0) return;

    const groups = get(nodeGroups);
    const byId = new Map<string, NodeGroup>();
    const groupNodeSets = new Map<string, Set<string>>();
    const nodeToGroupIds = new Map<string, string[]>();

    for (const g of groups) {
      const id = String(g.id);
      byId.set(id, { ...g, id, parentId: g.parentId ? String(g.parentId) : null });
      const set = new Set((g.nodeIds ?? []).map((nid) => String(nid)));
      groupNodeSets.set(id, set);
      for (const nid of set) {
        const list = nodeToGroupIds.get(nid) ?? [];
        list.push(id);
        nodeToGroupIds.set(nid, list);
      }
    }

    const depthCache = new Map<string, number>();
    const getDepth = (groupId: string, visiting = new Set<string>()): number => {
      const cached = depthCache.get(groupId);
      if (cached !== undefined) return cached;
      if (visiting.has(groupId)) return 0;
      visiting.add(groupId);

      const g = byId.get(groupId);
      const parentId = g?.parentId && byId.has(String(g.parentId)) ? String(g.parentId) : null;
      const depth = parentId ? getDepth(parentId, visiting) + 1 : 0;

      visiting.delete(groupId);
      depthCache.set(groupId, depth);
      return depth;
    };

    const getPrimaryGroupIdForNode = (nodeId: string): string | null => {
      const groupIds = nodeToGroupIds.get(String(nodeId)) ?? [];
      if (groupIds.length === 0) return null;

      let bestId: string | null = null;
      let bestDepth = -1;
      let bestSize = Number.POSITIVE_INFINITY;

      for (const gid of groupIds) {
        const depth = getDepth(gid);
        const size = groupNodeSets.get(gid)?.size ?? Number.POSITIVE_INFINITY;
        if (depth > bestDepth || (depth === bestDepth && size < bestSize)) {
          bestId = gid;
          bestDepth = depth;
          bestSize = size;
        }
      }

      return bestId;
    };

    let parentId: string | null = null;
    let parentDepth = -1;
    let parentSize = Number.POSITIVE_INFINITY;

    for (const g of groups) {
      const gid = String(g.id);
      const set = groupNodeSets.get(gid);
      if (!set) continue;
      const containsAll = selected.every((id) => set.has(String(id)));
      if (!containsAll) continue;

      const depth = getDepth(gid);
      const size = set.size;
      if (depth > parentDepth || (depth === parentDepth && size < parentSize)) {
        parentId = gid;
        parentDepth = depth;
        parentSize = size;
      }
    }

    const denied: string[] = [];
    const ids = new Set<string>();

    for (const nodeId of selected) {
      const primary = getPrimaryGroupIdForNode(nodeId);
      const allowed = parentId ? primary === parentId : primary === null;
      if (!allowed) {
        denied.push(nodeId);
        continue;
      }
      ids.add(nodeId);
    }

    if (denied.length > 0) showCanvasToast('无法创建跨组组合');
    if (ids.size === 0) return;

    const isEligibleLoopNode = (nodeId: string): boolean => {
      const primary = getPrimaryGroupIdForNode(nodeId);
      return parentId ? primary === parentId : primary === null;
    };

    for (const loop of opts.getLocalLoops()) {
      if (!loop?.nodeIds?.length) continue;
      const loopIds = loop.nodeIds.map((id) => String(id));
      if (!loopIds.some((id) => ids.has(id))) continue;
      if (!loopIds.every((id) => isEligibleLoopNode(id))) continue;
      for (const nid of loopIds) ids.add(nid);
    }

    const groupId = `group:${crypto.randomUUID?.() ?? Date.now()}`;
    const nextName = parentId
      ? `Sub Group ${(groups.filter((g) => String(g.parentId ?? '') === String(parentId)).length ?? 0) + 1}`
      : `Group ${groups.filter((g) => !g.parentId).length + 1}`;

    const group: NodeGroup = {
      id: groupId,
      parentId,
      name: nextName,
      nodeIds: Array.from(ids),
      disabled: false,
      minimized: false,
      runtimeActive: true,
    };

    nodeGroups.set([...groups, group]);
    recomputeDisabledNodes();

    groupSelectionNodeIds.set(new Set());
    groupSelectionBounds.set(null);
    scheduleHighlight();
    opts.requestLoopFramesUpdate();

    const bounds = computeGroupFrameBounds(group);
    if (!bounds) return;
    pushNodesOutOfBounds(bounds, new Set(group.nodeIds.map((id) => String(id))));
  };

  const stopDeployedLoopsIntersecting = (nodeIds: string[]) => {
    const set = new Set(nodeIds.map((id) => String(id)));
    for (const loop of opts.getLocalLoops()) {
      if (!opts.getDeployedLoopIds().has(loop.id)) continue;
      if (!loop.nodeIds.some((id) => set.has(String(id)))) continue;
      opts.stopAndRemoveLoop(loop);
    }
  };

  const toggleGroupDisabled = (groupId: string) => {
    const group = get(nodeGroups).find((g) => g.id === groupId);
    if (!group) return;

    const nextDisabled = !group.disabled;
    nodeGroups.set(get(nodeGroups).map((g) => (g.id === groupId ? { ...g, disabled: nextDisabled } : g)));
    recomputeDisabledNodes();
    opts.requestLoopFramesUpdate();

    if (nextDisabled) stopDeployedLoopsIntersecting(group.nodeIds);
  };

  const toggleGroupMinimized = (groupId: string) => {
    const id = String(groupId ?? '');
    if (!id) return;
    const group = get(nodeGroups).find((g) => String(g.id) === id);
    if (!group) return;

    const nextMinimized = !group.minimized;
    nodeGroups.set(get(nodeGroups).map((g) => (String(g.id) === id ? { ...g, minimized: nextMinimized } : g)));

    // Exiting edit mode is less surprising when the frame is minimized.
    if (nextMinimized && get(editModeGroupId) === id) {
      editModeGroupId.set(null);
      editModeGroupBounds = null;
      clearGroupEditToast();
    }

    scheduleHighlight();
    requestFramesUpdate();
    opts.requestLoopFramesUpdate();
    opts.requestMinimapUpdate();
  };

  const disassembleGroup = (groupId: string) => {
    const rootId = String(groupId ?? '');
    if (!rootId) return;

    const groups = get(nodeGroups);
    if (!groups.some((g) => String(g.id) === rootId)) return;

    const childrenByParentId = new Map<string, string[]>();
    for (const g of groups) {
      const pid = g.parentId ? String(g.parentId) : '';
      if (!pid) continue;
      const list = childrenByParentId.get(pid) ?? [];
      list.push(String(g.id));
      childrenByParentId.set(pid, list);
    }

    const toRemove = new Set<string>();
    const stack = [rootId];
    while (stack.length > 0) {
      const id = stack.pop();
      if (!id) continue;
      if (toRemove.has(id)) continue;
      toRemove.add(id);
      const children = childrenByParentId.get(id) ?? [];
      for (const childId of children) stack.push(childId);
    }

    const editingId = get(editModeGroupId);
    if (editingId && toRemove.has(String(editingId))) {
      editModeGroupId.set(null);
      editModeGroupBounds = null;
      clearGroupEditToast();
      opts.requestLoopFramesUpdate();
    }

    nodeGroups.set(groups.filter((g) => !toRemove.has(String(g.id))));
    recomputeDisabledNodes(get(nodeGroups));
    opts.requestLoopFramesUpdate();
  };

  const renameGroup = (groupId: string, name: string) => {
    const trimmed = name.trim();
    if (!groupId || !trimmed) return;
    if (!get(nodeGroups).some((g) => g.id === groupId)) return;
    nodeGroups.set(get(nodeGroups).map((g) => (g.id === groupId ? { ...g, name: trimmed } : g)));
    opts.requestLoopFramesUpdate();
  };

  const toggleGroupEditMode = (groupId: string) => {
    if (!groupId) return;
    const group = get(nodeGroups).find((g) => g.id === groupId) ?? null;
    if (!group) return;

    if (get(editModeGroupId) === groupId) {
      editModeGroupId.set(null);
      editModeGroupBounds = null;
      clearGroupEditToast();
      opts.requestLoopFramesUpdate();
      return;
    }

    const b = computeGroupFrameBounds(group);
    editModeGroupBounds = b ? { ...b } : null;

    editModeGroupId.set(groupId);
    clearGroupEditToast();
    opts.requestLoopFramesUpdate();
  };

  const computeGroupFrames = () => {
    const adapter = opts.getAdapter();
    if (!adapter) {
      groupFrames.set([]);
      return;
    }
    const groups = get(nodeGroups);
    if (groups.length === 0) {
      groupFrames.set([]);
      return;
    }

    const { byId, childrenByParentId } = buildGroupIndex(groups);

    const hiddenNodeIds = new Set<string>();
    for (const nodeId of opts.getForcedHiddenNodeIds?.() ?? []) hiddenNodeIds.add(String(nodeId));
    const minimizedGroupIds: string[] = [];
    for (const g of groups) {
      if (!g.minimized) continue;
      minimizedGroupIds.push(String(g.id));
      for (const nodeId of g.nodeIds ?? []) hiddenNodeIds.add(String(nodeId));
    }

    const hiddenGroupIds = new Set<string>();
    if (minimizedGroupIds.length > 0) {
      const stack: string[] = [];
      for (const gid of minimizedGroupIds) {
        for (const childId of childrenByParentId.get(String(gid)) ?? []) {
          stack.push(String(childId));
        }
      }
      while (stack.length > 0) {
        const next = String(stack.pop() ?? '');
        if (!next || hiddenGroupIds.has(next)) continue;
        hiddenGroupIds.add(next);
        for (const childId of childrenByParentId.get(next) ?? []) {
          stack.push(String(childId));
        }
      }
    }

    const depthCache = new Map<string, number>();
    const getDepth = (groupId: string, visiting = new Set<string>()): number => {
      const cached = depthCache.get(groupId);
      if (cached !== undefined) return cached;
      if (visiting.has(groupId)) return 0;
      visiting.add(groupId);

      const g = byId.get(groupId);
      const parentId = g?.parentId && byId.has(String(g.parentId)) ? String(g.parentId) : null;
      const depth = parentId ? getDepth(parentId, visiting) + 1 : 0;

      visiting.delete(groupId);
      depthCache.set(groupId, depth);
      return depth;
    };

    const effectiveDisabledCache = new Map<string, boolean>();
    const getEffectiveDisabled = (groupId: string, visiting = new Set<string>()): boolean => {
      const cached = effectiveDisabledCache.get(groupId);
      if (cached !== undefined) return cached;
      if (visiting.has(groupId)) return false;
      visiting.add(groupId);

      const g = byId.get(groupId);
      const parentId = g?.parentId && byId.has(String(g.parentId)) ? String(g.parentId) : null;
      const runtimeActive = g?.runtimeActive ?? true;
      const effective =
        Boolean(g?.disabled) || !runtimeActive || (parentId ? getEffectiveDisabled(parentId, visiting) : false);

      visiting.delete(groupId);
      effectiveDisabledCache.set(groupId, effective);
      return effective;
    };

    const boundsCache = new Map<string, NodeBounds | null>();
    const computeBoundsCached = (groupId: string) =>
      computeGroupFrameBoundsWithChildren(
        groupId,
        byId,
        childrenByParentId,
        boundsCache,
        new Set(),
        hiddenNodeIds
      );

    const frames: GroupFrame[] = [];
    for (const group of groups) {
      if (hiddenGroupIds.has(String(group.id))) continue;
      const depth = getDepth(String(group.id));
      const effectiveDisabled = getEffectiveDisabled(String(group.id));

      if (get(editModeGroupId) === group.id && editModeGroupBounds) {
        const left = editModeGroupBounds.left;
        const top = editModeGroupBounds.top;
        const right = editModeGroupBounds.right;
        const bottom = editModeGroupBounds.bottom;
        frames.push({
          group,
          left,
          top,
          width: right - left,
          height: bottom - top,
          effectiveDisabled,
          depth,
        });
        continue;
      }

      const bounds = computeBoundsCached(String(group.id));
      if (!bounds) continue;

      frames.push({
        group,
        left: bounds.left,
        top: bounds.top,
        width: bounds.right - bounds.left,
        height: bounds.bottom - bounds.top,
        effectiveDisabled,
        depth,
      });
    }

    frames.sort((a, b) => a.depth - b.depth);
    groupFrames.set(frames);
  };

  const computeSelectionBounds = () => {
    const adapter = opts.getAdapter();
    if (!adapter) {
      groupSelectionBounds.set(null);
      return;
    }

    if (get(groupSelectionNodeIds).size === 0) {
      groupSelectionBounds.set(null);
      return;
    }

    const t = adapter.getViewportTransform();

    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;

    for (const nodeId of get(groupSelectionNodeIds)) {
      const b = adapter.getNodeBounds(String(nodeId));
      if (!b) continue;
      left = Math.min(left, b.left * t.k + t.tx);
      top = Math.min(top, b.top * t.k + t.ty);
      right = Math.max(right, b.right * t.k + t.tx);
      bottom = Math.max(bottom, b.bottom * t.k + t.ty);
    }

    const hasBounds =
      Number.isFinite(left) && Number.isFinite(top) && Number.isFinite(right) && Number.isFinite(bottom);
    if (!hasBounds) {
      groupSelectionBounds.set(null);
      return;
    }

    const pad = 18;
    groupSelectionBounds.set({
      left: left - pad,
      top: top - pad,
      width: right - left + pad * 2,
      height: bottom - top + pad * 2,
    });
  };

  const requestFramesUpdate = () => {
    if (typeof requestAnimationFrame === 'undefined') return;
    if (framesRaf) return;
    framesRaf = requestAnimationFrame(() => {
      framesRaf = 0;
      computeGroupFrames();
      computeSelectionBounds();
    });
  };

  const setGroups = (groups: NodeGroup[]) => {
    const next = normalizeGroupList(groups);
    nodeGroups.set(next);
    recomputeDisabledNodes(next);
    scheduleHighlight();
    requestFramesUpdate();
    opts.requestLoopFramesUpdate();
    opts.requestMinimapUpdate();
  };

  const appendGroups = (groups: NodeGroup[]) => {
    const incoming = normalizeGroupList(groups);
    if (incoming.length === 0) return;
    nodeGroups.set(normalizeGroupList([...get(nodeGroups), ...incoming]));
    recomputeDisabledNodes();
    scheduleHighlight();
    requestFramesUpdate();
    opts.requestLoopFramesUpdate();
    opts.requestMinimapUpdate();
  };

  const reconcileGraphNodes = (graphOverride?: GraphState): string[] => {
    const groupsSnapshot = get(nodeGroups);
    if (groupsSnapshot.length === 0) return [];

    const graph = graphOverride ?? opts.getGraphState();
    const existingNodeIds = new Set<string>();
    for (const node of graph.nodes ?? []) {
      const id = String(node.id ?? '');
      if (!id) continue;
      // Ignore UI-only group decoration nodes so a deleted group doesn't "stick" just because a port node survived.
      if (isGroupDecorationNodeType(String(node.type ?? ''))) continue;
      existingNodeIds.add(id);
    }

    const prevById = new Map<string, NodeGroup>();
    for (const g of groupsSnapshot) prevById.set(String(g.id), g);

    const normalized: NodeGroup[] = [];
    const byId = new Map<string, NodeGroup>();
    for (const group of groupsSnapshot) {
      const id = String(group?.id ?? '');
      if (!id) continue;
      const parentId = group?.parentId ? String(group.parentId) : null;
      const nodeIds = Array.from(new Set((group.nodeIds ?? []).map((nid) => String(nid)).filter(Boolean))).filter(
        (nid) => existingNodeIds.has(nid)
      );
      const next: NodeGroup = { ...group, id, parentId, nodeIds };
      normalized.push(next);
      byId.set(id, next);
    }

    if (normalized.length === 0) {
      const removedIds = Array.from(prevById.keys()).filter(Boolean);
      if (removedIds.length > 0) {
        nodeGroups.set([]);
        recomputeDisabledNodes([]);
        clearSelection();
        requestFramesUpdate();
        opts.requestLoopFramesUpdate();
        opts.requestMinimapUpdate();
      }
      return removedIds;
    }

    const childrenByParent = new Map<string, string[]>();
    for (const g of normalized) {
      const pid = g.parentId ? String(g.parentId) : '';
      if (!pid || pid === g.id || !byId.has(pid)) continue;
      const list = childrenByParent.get(pid) ?? [];
      list.push(g.id);
      childrenByParent.set(pid, list);
    }

    const unionCache = new Map<string, Set<string>>();
    const visiting = new Set<string>();
    const computeUnion = (id: string): Set<string> => {
      const cached = unionCache.get(id);
      if (cached) return cached;
      if (visiting.has(id)) return new Set((byId.get(id)?.nodeIds ?? []).map(String));
      visiting.add(id);
      const base = new Set((byId.get(id)?.nodeIds ?? []).map(String));
      for (const childId of childrenByParent.get(id) ?? []) {
        const childUnion = computeUnion(String(childId));
        for (const nid of childUnion) base.add(nid);
      }
      visiting.delete(id);
      unionCache.set(id, base);
      return base;
    };

    for (const g of normalized) computeUnion(g.id);

    const removedGroupIds = new Set<string>();
    for (const g of normalized) {
      const union = unionCache.get(g.id) ?? new Set();
      if (union.size === 0) removedGroupIds.add(g.id);
    }

    let changed = removedGroupIds.size > 0;
    const nextGroups: NodeGroup[] = [];

    for (const g of normalized) {
      if (removedGroupIds.has(g.id)) continue;
      const union = unionCache.get(g.id) ?? new Set<string>();
      const preferred = Array.from((g.nodeIds ?? []).map((nid) => String(nid)).filter(Boolean));
      const ordered: string[] = [];
      const seen = new Set<string>();
      for (const nid of preferred) {
        if (!union.has(nid) || seen.has(nid)) continue;
        seen.add(nid);
        ordered.push(nid);
      }
      const extras = Array.from(union).filter((nid) => !seen.has(nid));
      extras.sort();
      ordered.push(...extras);

      const nextParentId =
        g.parentId && byId.has(String(g.parentId)) && !removedGroupIds.has(String(g.parentId))
          ? String(g.parentId)
          : null;

      const prev = prevById.get(g.id);
      if (prev) {
        const prevParentId = prev.parentId ? String(prev.parentId) : null;
        const prevNodeIds = Array.from((prev.nodeIds ?? []).map((nid) => String(nid)).filter(Boolean));
        if (prevParentId !== nextParentId) changed = true;
        if (prevNodeIds.length !== ordered.length) changed = true;
        else {
          for (let i = 0; i < ordered.length; i += 1) {
            if (prevNodeIds[i] !== ordered[i]) {
              changed = true;
              break;
            }
          }
        }
      } else {
        changed = true;
      }

      nextGroups.push({ ...g, parentId: nextParentId, nodeIds: ordered });
    }

    // Drop deleted nodes from selection (marquee highlight can otherwise linger after delete).
    const prevSelection = get(groupSelectionNodeIds);
    if (prevSelection.size > 0) {
      const nextSelection = new Set(Array.from(prevSelection).filter((id) => existingNodeIds.has(String(id))));
      if (nextSelection.size !== prevSelection.size) {
        groupSelectionNodeIds.set(nextSelection);
        if (nextSelection.size === 0) groupSelectionBounds.set(null);
        scheduleHighlight();
        requestFramesUpdate();
      }
    }

    const editingId = get(editModeGroupId);
    if (editingId && removedGroupIds.has(String(editingId))) {
      editModeGroupId.set(null);
      editModeGroupBounds = null;
      clearGroupEditToast();
      opts.requestLoopFramesUpdate();
    }

    if (!changed) return [];

    nodeGroups.set(nextGroups);
    recomputeDisabledNodes(nextGroups);
    requestFramesUpdate();
    opts.requestLoopFramesUpdate();
    opts.requestMinimapUpdate();

    return Array.from(removedGroupIds);
  };

  const setRuntimeActiveByGroupId = (activeById: Map<string, boolean>) => {
    if (!(activeById instanceof Map)) return;
    const prevGroups = get(nodeGroups);
    if (prevGroups.length === 0) return;

    let changed = false;
    const nextGroups = prevGroups.map((group) => {
      const desired = activeById.has(String(group.id)) ? Boolean(activeById.get(String(group.id))) : true;
      const current = group.runtimeActive ?? true;
      if (current === desired) return group;
      changed = true;
      return { ...group, runtimeActive: desired };
    });

    if (!changed) return;
    nodeGroups.set(nextGroups);
    recomputeDisabledNodes(nextGroups);
    scheduleHighlight();
    requestFramesUpdate();
    opts.requestLoopFramesUpdate();
  };

  const clearSelection = () => {
    const hadNodes = get(groupSelectionNodeIds).size > 0;
    const hadGroup = Boolean(get(selectedGroupId));
    if (!hadNodes && !hadGroup) return;

    if (hadNodes) groupSelectionNodeIds.set(new Set());
    groupSelectionBounds.set(null);
    selectedGroupId.set(null);
    scheduleHighlight();
  };

  const toContainerPoint = (clientX: number, clientY: number): { x: number; y: number } => {
    const container = opts.getContainer();
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const isMarqueeStartTarget = (target: HTMLElement | null): boolean => {
    if (!target) return false;
    if (target.closest('.node')) return false;
    if (target.closest('.node-picker')) return false;
    if (target.closest('.marquee-actions')) return false;
    if (target.closest('.minimap')) return false;
    if (target.closest('.executor-logs')) return false;
    if (target.closest('.loop-frame-header')) return false;
    if (target.closest('.group-frame-header')) return false;
    return true;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;

    if (!event.shiftKey && get(groupSelectionNodeIds).size > 0 && isMarqueeStartTarget(target)) {
      clearSelection();
      return;
    }

    if (!event.shiftKey) return;
    if (!isMarqueeStartTarget(target)) return;

    event.preventDefault();
    event.stopPropagation();

    clearSelection();
    isMarqueeDragging = true;
    marqueePointerId = event.pointerId;
    marqueeStart = toContainerPoint(event.clientX, event.clientY);
    marqueeCurrent = marqueeStart;
    marqueeRect.set({
      left: marqueeStart.x,
      top: marqueeStart.y,
      width: 0,
      height: 0,
    });

    const onMove = (ev: PointerEvent) => {
      if (!isMarqueeDragging) return;
      if (marqueePointerId !== null && ev.pointerId !== marqueePointerId) return;
      marqueeCurrent = toContainerPoint(ev.clientX, ev.clientY);
      const left = Math.min(marqueeStart.x, marqueeCurrent.x);
      const top = Math.min(marqueeStart.y, marqueeCurrent.y);
      const width = Math.abs(marqueeStart.x - marqueeCurrent.x);
      const height = Math.abs(marqueeStart.y - marqueeCurrent.y);
      marqueeRect.set({ left, top, width, height });
    };

    const onUp = (ev: PointerEvent) => {
      if (marqueePointerId !== null && ev.pointerId !== marqueePointerId) return;
      isMarqueeDragging = false;
      marqueePointerId = null;

      if (marqueeMoveHandler)
        window.removeEventListener('pointermove', marqueeMoveHandler, { capture: true });
      if (marqueeUpHandler) {
        window.removeEventListener('pointerup', marqueeUpHandler, { capture: true });
        window.removeEventListener('pointercancel', marqueeUpHandler, { capture: true });
      }
      marqueeMoveHandler = null;
      marqueeUpHandler = null;

      const selLeft = Math.min(marqueeStart.x, marqueeCurrent.x);
      const selTop = Math.min(marqueeStart.y, marqueeCurrent.y);
      const selRight = Math.max(marqueeStart.x, marqueeCurrent.x);
      const selBottom = Math.max(marqueeStart.y, marqueeCurrent.y);

      const adapter = opts.getAdapter();
      if (!adapter) return;
      const t = adapter.getViewportTransform();
      const rect = {
        left: (selLeft - t.tx) / t.k,
        top: (selTop - t.ty) / t.k,
        right: (selRight - t.tx) / t.k,
        bottom: (selBottom - t.ty) / t.k,
      };
      const selected = adapter.getNodesInRect(rect);
      groupSelectionNodeIds.set(new Set(selected.map(String)));
      scheduleHighlight();
      computeSelectionBounds();
      marqueeRect.set(null);
    };

    marqueeMoveHandler = onMove;
    marqueeUpHandler = onUp;
    window.addEventListener('pointermove', onMove, { capture: true });
    window.addEventListener('pointerup', onUp, { capture: true });
    window.addEventListener('pointercancel', onUp, { capture: true });
  };

  return {
    nodeGroups,
    groupFrames,
    groupSelectionNodeIds,
    groupSelectionBounds,
    selectedGroupId,
    editModeGroupId,
    canvasToast,
    groupEditToast,
    groupDisabledNodeIds,
    marqueeRect,
    requestFramesUpdate,
    setGroups,
    appendGroups,
    reconcileGraphNodes,
    setRuntimeActiveByGroupId,
    applyHighlights,
    scheduleHighlight,
    clearSelection,
    createGroupFromSelection,
    toggleGroupDisabled,
    toggleGroupMinimized,
    disassembleGroup,
    renameGroup,
    toggleGroupEditMode,
    autoAddNodeToGroupFromPosition,
    autoAddNodeToGroupFromConnectDrop,
    handleDroppedNodesAfterDrag,
    onPointerDown,
    destroy: () => {
      clearGroupEditToast();
      clearCanvasToast();
      if (framesRaf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(framesRaf);
      framesRaf = 0;
      if (marqueeMoveHandler)
        window.removeEventListener('pointermove', marqueeMoveHandler, { capture: true });
      if (marqueeUpHandler) {
        window.removeEventListener('pointerup', marqueeUpHandler, { capture: true });
        window.removeEventListener('pointercancel', marqueeUpHandler, { capture: true });
      }
      marqueeMoveHandler = null;
      marqueeUpHandler = null;
    },
    isProgrammaticTranslate,
    beginProgrammaticTranslate,
    endProgrammaticTranslate,
    computeLoopFrameBounds,
    pushNodesOutOfBounds,
  };
}
