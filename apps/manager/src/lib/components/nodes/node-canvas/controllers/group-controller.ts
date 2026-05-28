/**
 * Purpose: Node group + marquee selection controller for NodeCanvas.
 */
import { get, writable } from 'svelte/store';
import type { LocalLoop } from '$lib/nodes';
import type { GraphState, NodeInstance } from '$lib/nodes/types';
import { nodeRegistry } from '$lib/nodes';
import { audienceClients } from '$lib/stores/manager';
import type { NodeBounds } from '../adapters';
import { normalizeGroupList } from '../groups/normalize-group-list';
import {
  buildGroupIndex,
  computeGroupFrameBoundsWithChildren,
  computeLoopFrameBounds as computeLoopFrameBoundsCore,
  computeSingleGroupFrameBounds,
  mergeBounds,
} from './group-bounds';
import type {
  FrameInfo,
  FrameMoveContext,
  GroupController,
  GroupControllerOptions,
  GroupEditToast,
  GroupFrame,
  NodeGroup,
} from './group-types';
import { reconcileGroupsWithGraphNodes } from './group-reconcile';
import { computeGroupFramesFromState } from './group-frame-computation';
import { planGroupFromSelection } from './group-selection-plan';
import {
  applyEditGroupMembershipChange,
  buildDropFrameContext,
  computeSelectionScreenBounds,
  pickSmallestGroupAtPoint,
  planAddNodeToGroupChain,
  planDisassembleGroup,
  planEditGroupMembershipChange,
  shouldEnforceFrameForMovedNodes,
} from './group-drop-helpers';
import { computeGroupVisualStatePlan } from './group-visual-state';
import { isGroupDecorationNodeType } from '../groups/group-node-types';
import {
  easeOutCubic,
  persistFinalNodeTranslations,
  planNodesOutOfBounds,
  type NodeTranslation,
} from './group-node-motion';
import { createGroupMarqueeController } from './group-marquee';
import { computeGroupDisabledNodeIds } from './group-disabled-nodes';
export type { FrameMoveContext, GroupController, GroupFrame, NodeGroup } from './group-types';

export function createGroupController(opts: GroupControllerOptions): GroupController {
  const nodeGroups = writable<NodeGroup[]>([]);
  const groupFrames = writable<GroupFrame[]>([]);
  const groupSelectionNodeIds = writable<Set<string>>(new Set());
  const groupSelectionBounds = writable<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const selectedGroupId = writable<string | null>(null);
  const editModeGroupId = writable<string | null>(null);
  const canvasToast = writable<string | null>(null);
  const groupEditToast = writable<GroupEditToast>(null);
  const groupDisabledNodeIds = writable<Set<string>>(new Set());
  const marqueeRect = writable<{ left: number; top: number; width: number; height: number } | null>(
    null
  );

  let groupHighlightDirty = false;
  let groupEditToastTimeout: ReturnType<typeof setTimeout> | null = null;
  let canvasToastTimeout: ReturnType<typeof setTimeout> | null = null;
  let editModeGroupBounds: { left: number; top: number; right: number; bottom: number } | null =
    null;

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
    if (node.type === 'client-loader') {
      const onlineCount = get(audienceClients).length;
      return `Client Loader: ${onlineCount} online`;
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
    const graph = opts.getGraphState();
    const next = computeGroupDisabledNodeIds(graph, nextGroups);

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

    const plan = computeGroupVisualStatePlan({
      graph: opts.getGraphState(),
      groups: get(nodeGroups),
      disabledNodeIds: get(groupDisabledNodeIds),
      selectedNodeIds: get(groupSelectionNodeIds),
      forcedHiddenNodeIds: opts.getForcedHiddenNodeIds?.() ?? new Set<string>(),
      getNodeVisualState: (id) => adapter.getNodeVisualState(id),
      getConnectionVisualState: (id) => adapter.getConnectionVisualState(id),
    });

    for (const nodePatch of plan.nodePatches) {
      const { nodeId, ...patch } = nodePatch;
      await adapter.setNodeVisualState(nodeId, patch);
    }

    for (const connectionPatch of plan.connectionPatches) {
      const { connectionId, ...patch } = connectionPatch;
      await adapter.setConnectionVisualState(connectionId, patch);
    }
  };

  const computeGroupFrameBounds = (group: NodeGroup): NodeBounds | null => {
    const adapter = opts.getAdapter();
    if (!adapter) return null;
    return computeSingleGroupFrameBounds({
      groupId: String(group.id),
      groups: get(nodeGroups),
      graph: opts.getGraphState(),
      localLoops: opts.getLocalLoops(),
      getNodeBounds: (nodeId) => adapter.getNodeBounds(nodeId),
    });
  };

  const computeLoopFrameBounds = (loop: LocalLoop): NodeBounds | null => {
    const adapter = opts.getAdapter();
    if (!adapter) return null;
    return computeLoopFrameBoundsCore(loop, (nodeId) => adapter.getNodeBounds(nodeId));
  };

  const animateNodeTranslations = (updates: NodeTranslation[], durationMs = 320) => {
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
      persistFinalNodeTranslations(updates, opts.updateNodePosition);
      opts.requestLoopFramesUpdate();
      opts.requestMinimapUpdate();
    };

    requestAnimationFrame(step);
  };

  const pushNodesOutOfBounds = (
    bounds: NodeBounds,
    excludeNodeIds: Set<string>,
    frameMoves?: FrameMoveContext
  ) => {
    const adapter = opts.getAdapter();
    if (!adapter) return;

    animateNodeTranslations(
      planNodesOutOfBounds({
        bounds,
        excludeNodeIds,
        frameMoves,
        graph: opts.getGraphState(),
        adapter,
      })
    );
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

    const { byId, childrenByParentId } = buildGroupIndex(groupsSnapshot);

    const hiddenNodeIds = new Set<string>();
    for (const g of groupsSnapshot) {
      if (!g.minimized) continue;
      for (const nodeId of g.nodeIds ?? []) hiddenNodeIds.add(String(nodeId));
    }

    const groupBoundsCache = new Map<string, NodeBounds | null>();
    const computeGroupBoundsCached = (groupId: string) =>
      computeGroupFrameBoundsWithChildren({
        groupId,
        byId,
        childrenByParentId,
        cache: groupBoundsCache,
        visiting: new Set(),
        hiddenNodeIds,
        graph: opts.getGraphState(),
        localLoops: opts.getLocalLoops(),
        getNodeBounds: (nodeId) => adapter.getNodeBounds(nodeId),
      });

    const editId = get(editModeGroupId);
    const dropContext = buildDropFrameContext({
      groups: groupsSnapshot,
      loops: loopsSnapshot,
      editModeGroupId: editId,
      editModeGroupBounds,
      computeGroupBounds: computeGroupBoundsCached,
      computeLoopBounds: computeLoopFrameBounds,
    });
    const { groupNodeSets, loopNodeSets, frameById, frameMoves } = dropContext;

    for (const loop of loopsSnapshot) {
      const loopId = String(loop.id ?? '');
      if (!loopId) continue;
      const frame = frameById.get(`loop:${loopId}`);
      const bounds = frame?.bounds;
      if (!bounds) continue;
      const loopNodeSet = loopNodeSets.get(loopId) ?? new Set();

      const shouldEnforce = shouldEnforceFrameForMovedNodes(
        nodeIds,
        loopNodeSet,
        bounds,
        getNodeCenter
      );
      if (!shouldEnforce) continue;

      pushNodesOutOfBounds(bounds, loopNodeSet, frameMoves);
    }

    if (editId && editModeGroupBounds) {
      const group = groupsSnapshot.find((g) => String(g.id) === String(editId)) ?? null;
      if (group) {
        const bounds: NodeBounds = { ...editModeGroupBounds };
        const { added, removed } = planEditGroupMembershipChange({
          movedNodeIds: nodeIds,
          group,
          bounds,
          graph: opts.getGraphState(),
          getNodeCenter,
        });

        if (added.length > 0 || removed.length > 0) {
          const graph = opts.getGraphState();
          for (const id of added) {
            const node = graph.nodes.find((n) => String(n.id) === id);
            showGroupEditToast(
              group.id,
              `Add ${node ? nodeLabel(node) : id} to ${group.name ?? 'Group'}`
            );
          }
          for (const id of removed) {
            const node = graph.nodes.find((n) => String(n.id) === id);
            showGroupEditToast(
              group.id,
              `Remove ${node ? nodeLabel(node) : id} from ${group.name ?? 'Group'}`
            );
          }
          const result = applyEditGroupMembershipChange({
            groups: get(nodeGroups),
            targetGroupId: group.id,
            added,
            removed,
          });
          nodeGroups.set(result.nextGroups);
          recomputeDisabledNodes();
          opts.requestLoopFramesUpdate();

          if (result.effectiveDisabled && added.length > 0) {
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

      const shouldEnforce = shouldEnforceFrameForMovedNodes(
        nodeIds,
        groupNodeSet,
        bounds,
        getNodeCenter
      );
      if (!shouldEnforce) continue;

      pushNodesOutOfBounds(bounds, groupNodeSet, frameMoves);
    }
  };

  const pickGroupAtPoint = (groups: NodeGroup[], gx: number, gy: number): NodeGroup | null => {
    return pickSmallestGroupAtPoint(groups, gx, gy, (_groupId, group) => {
      if (get(editModeGroupId) === group.id && editModeGroupBounds) {
        return { ...editModeGroupBounds };
      }
      return computeGroupFrameBounds(group);
    });
  };

  const addNodeToGroupChain = (groupId: string, nodeId: string) => {
    const rootId = String(groupId ?? '');
    const createdId = String(nodeId ?? '');
    if (!rootId || !createdId) return;

    const createdType = String(
      opts.getGraphState().nodes.find((n) => String(n.id) === createdId)?.type ?? ''
    );
    if (isGroupDecorationNodeType(createdType)) return;

    const result = planAddNodeToGroupChain({
      groups: get(nodeGroups),
      groupId: rootId,
      nodeId: createdId,
    });
    if (!result.didAdd) return;

    nodeGroups.set(result.nextGroups);
    recomputeDisabledNodes();
    opts.requestLoopFramesUpdate();
    opts.requestMinimapUpdate();

    if (result.effectiveDisabled) stopDeployedLoopsIntersecting([createdId]);
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

    const candidates = get(nodeGroups).filter((g) =>
      (g.nodeIds ?? []).some((id) => String(id) === initialId)
    );
    if (candidates.length === 0) return;

    const picked = pickGroupAtPoint(candidates, gx, gy);

    if (!picked) return;
    addNodeToGroupChain(picked.id, createdId);
  };

  const createGroupFromSelection = (kind: 'group' | 'ai-space' = 'group') => {
    const groups = get(nodeGroups);
    const result = planGroupFromSelection({
      selectionNodeIds: Array.from(get(groupSelectionNodeIds)),
      graph: opts.getGraphState(),
      groups,
      localLoops: opts.getLocalLoops(),
      createId: () =>
        `${kind === 'ai-space' ? 'ai-space' : 'group'}:${crypto.randomUUID?.() ?? Date.now()}`,
      kind,
    });

    if (result.deniedNodeIds.length > 0) showCanvasToast('无法创建跨组组合');
    if (!result.group) return;

    const group = result.group;
    const reparentByGroupId = new Map(
      result.reparentGroups.map((entry) => [String(entry.groupId), entry.parentId] as const)
    );
    const nextGroups = groups.map((existing) =>
      reparentByGroupId.has(String(existing.id))
        ? { ...existing, parentId: reparentByGroupId.get(String(existing.id)) ?? null }
        : existing
    );

    nodeGroups.set([...nextGroups, group]);
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
    nodeGroups.set(
      get(nodeGroups).map((g) => (g.id === groupId ? { ...g, disabled: nextDisabled } : g))
    );
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
    nodeGroups.set(
      get(nodeGroups).map((g) => (String(g.id) === id ? { ...g, minimized: nextMinimized } : g))
    );

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
    const result = planDisassembleGroup({ groups: get(nodeGroups), groupId });
    if (result.removedGroupIds.size === 0) return;

    const editingId = get(editModeGroupId);
    if (editingId && result.removedGroupIds.has(String(editingId))) {
      editModeGroupId.set(null);
      editModeGroupBounds = null;
      clearGroupEditToast();
      opts.requestLoopFramesUpdate();
    }

    nodeGroups.set(result.nextGroups);
    recomputeDisabledNodes(result.nextGroups);
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

    groupFrames.set(
      computeGroupFramesFromState({
        groups,
        editModeGroupId: get(editModeGroupId),
        editModeGroupBounds,
        forcedHiddenNodeIds: opts.getForcedHiddenNodeIds?.() ?? new Set(),
        graph: opts.getGraphState(),
        localLoops: opts.getLocalLoops(),
        getNodeBounds: (nodeId) => adapter.getNodeBounds(nodeId),
      })
    );
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

    groupSelectionBounds.set(
      computeSelectionScreenBounds({
        nodeIds: Array.from(get(groupSelectionNodeIds)),
        transform: adapter.getViewportTransform(),
        getNodeBounds: (nodeId) => adapter.getNodeBounds(nodeId),
      })
    );
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
    const result = reconcileGroupsWithGraphNodes(groupsSnapshot, graph);

    if (result.nextGroups.length === 0) {
      if (result.removedGroupIds.length > 0) {
        nodeGroups.set([]);
        recomputeDisabledNodes([]);
        clearSelection();
        requestFramesUpdate();
        opts.requestLoopFramesUpdate();
        opts.requestMinimapUpdate();
      }
      return result.removedGroupIds;
    }

    // Drop deleted nodes from selection (marquee highlight can otherwise linger after delete).
    const prevSelection = get(groupSelectionNodeIds);
    if (prevSelection.size > 0) {
      const nextSelection = new Set(
        Array.from(prevSelection).filter((id) => result.existingNodeIds.has(String(id)))
      );
      if (nextSelection.size !== prevSelection.size) {
        groupSelectionNodeIds.set(nextSelection);
        if (nextSelection.size === 0) groupSelectionBounds.set(null);
        scheduleHighlight();
        requestFramesUpdate();
      }
    }

    const editingId = get(editModeGroupId);
    if (editingId && result.removedGroupIds.includes(String(editingId))) {
      editModeGroupId.set(null);
      editModeGroupBounds = null;
      clearGroupEditToast();
      opts.requestLoopFramesUpdate();
    }

    if (!result.changed) return [];

    nodeGroups.set(result.nextGroups);
    recomputeDisabledNodes(result.nextGroups);
    requestFramesUpdate();
    opts.requestLoopFramesUpdate();
    opts.requestMinimapUpdate();

    return result.removedGroupIds;
  };

  const setRuntimeActiveByGroupId = (activeById: Map<string, boolean>) => {
    if (!(activeById instanceof Map)) return;
    const prevGroups = get(nodeGroups);
    if (prevGroups.length === 0) return;

    let changed = false;
    const nextGroups = prevGroups.map((group) => {
      const desired = activeById.has(String(group.id))
        ? Boolean(activeById.get(String(group.id)))
        : true;
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
    marqueeController.start(event);
  };

  const marqueeController = createGroupMarqueeController({
    marqueeRect,
    getContainer: opts.getContainer,
    getAdapter: opts.getAdapter,
    getGroupFrames: () => get(groupFrames),
    setSelectedNodeIds: (ids) => groupSelectionNodeIds.set(ids),
    onSelectionComplete: () => {
      scheduleHighlight();
      computeSelectionBounds();
    },
  });

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
      marqueeController.destroy();
    },
    isProgrammaticTranslate,
    beginProgrammaticTranslate,
    endProgrammaticTranslate,
    computeLoopFrameBounds,
    pushNodesOutOfBounds,
  };
}
