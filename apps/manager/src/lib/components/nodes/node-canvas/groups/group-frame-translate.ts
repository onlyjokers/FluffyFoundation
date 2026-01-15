/**
 * Purpose: Keep group subtree nodes aligned when the minimized group frame node is dragged.
 */
import type { BaseSchemes } from 'rete';
import type { AreaPlugin } from 'rete-area-plugin';
import { get } from 'svelte/store';
import type { GraphState, NodeInstance } from '$lib/nodes/types';
import type { GroupController } from '../controllers/group-controller';
import { asRecord, getNumber, getString } from '../../../../utils/value-guards';

type AnyAreaPlugin = AreaPlugin<BaseSchemes, unknown>;

type NodeEngine = {
  getNode: (nodeId: string) => NodeInstance | null;
  exportGraph: () => GraphState;
  updateNodePosition: (nodeId: string, pos: { x: number; y: number }) => void;
};

type GroupPortNodesController = {
  scheduleAlign: () => void;
};

type GroupFrameTranslateOptions = {
  areaPlugin: AnyAreaPlugin | null;
  nodeEngine: NodeEngine;
  groupController: GroupController;
  isSyncing: () => boolean;
  groupPortNodesController: GroupPortNodesController;
  requestFramesUpdate: () => void;
  requestMinimapUpdate: () => void;
};

export const registerGroupFrameTranslatePipe = (opts: GroupFrameTranslateOptions) => {
  const {
    areaPlugin,
    nodeEngine,
    groupController,
    isSyncing,
    groupPortNodesController,
    requestFramesUpdate,
    requestMinimapUpdate,
  } = opts;
  if (!areaPlugin) return;

  let translateDepth = 0;

  // Dragging the minimized Group node should move the entire group (incl. nested frames/ports).
  areaPlugin.addPipe(async (ctx: { type?: string; data?: unknown }) => {
    if (ctx?.type !== 'nodetranslated') return ctx;
    if (isSyncing()) return ctx;
    if (groupController.isProgrammaticTranslate()) return ctx;
    if (translateDepth > 0) return ctx;

    const data = asRecord(ctx.data);
    const nodeId = getString(data.id, '');
    const posRecord = asRecord(data.position);
    const prevRecord = asRecord(data.previous);
    const pos = { x: getNumber(posRecord.x, NaN), y: getNumber(posRecord.y, NaN) };
    const prev = { x: getNumber(prevRecord.x, NaN), y: getNumber(prevRecord.y, NaN) };
    if (!nodeId || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return ctx;
    if (!Number.isFinite(prev.x) || !Number.isFinite(prev.y)) return ctx;

    const node = nodeEngine.getNode(nodeId);
    if (!node || String(node.type) !== 'group-frame') return ctx;

    const groupId = getString(asRecord(node.config).groupId, '');
    if (!groupId) return ctx;

    const dx = Number(pos.x ?? 0) - Number(prev.x ?? 0);
    const dy = Number(pos.y ?? 0) - Number(prev.y ?? 0);
    if (!dx && !dy) return ctx;

    const groups = get(groupController.nodeGroups) ?? [];
    const subtreeGroupIds = new Set<string>();
    const stack = [groupId];
    while (stack.length > 0) {
      const gid = String(stack.pop() ?? '');
      if (!gid || subtreeGroupIds.has(gid)) continue;
      subtreeGroupIds.add(gid);
      for (const g of groups) {
        if (String(g.parentId ?? '') === gid) stack.push(String(g.id ?? ''));
      }
    }

    const nodeIdsToMove = new Set<string>();
    for (const g of groups) {
      const gid = String(g.id ?? '');
      if (!gid || !subtreeGroupIds.has(gid)) continue;
      for (const id of g.nodeIds ?? []) nodeIdsToMove.add(String(id));
    }

    const state: GraphState = nodeEngine.exportGraph();
    for (const n of state.nodes ?? []) {
      const type = String(n.type ?? '');
      if (type !== 'group-gate' && type !== 'group-proxy' && type !== 'group-frame') continue;
      const gid = getString(asRecord(n.config).groupId, '');
      if (!gid || !subtreeGroupIds.has(gid)) continue;
      nodeIdsToMove.add(String(n.id ?? ''));
    }
    nodeIdsToMove.delete(nodeId);

    if (nodeIdsToMove.size === 0) return ctx;

    translateDepth += 1;
    groupController.beginProgrammaticTranslate();
    try {
      const promises: Promise<unknown>[] = [];
      for (const id of nodeIdsToMove) {
        const view = areaPlugin?.nodeViews?.get?.(String(id));
        const viewPos = asRecord(view?.position);
        const vx = getNumber(viewPos.x, NaN);
        const vy = getNumber(viewPos.y, NaN);
        if (Number.isFinite(vx) && Number.isFinite(vy)) {
          promises.push(areaPlugin.translate(String(id), { x: vx + dx, y: vy + dy }));
        } else {
          const instance = nodeEngine.getNode(String(id));
          if (!instance) continue;
          const cx = Number(instance.position?.x ?? 0);
          const cy = Number(instance.position?.y ?? 0);
          if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
          nodeEngine.updateNodePosition(String(id), { x: cx + dx, y: cy + dy });
        }
      }
      await Promise.all(promises);
    } finally {
      groupController.endProgrammaticTranslate();
      translateDepth = Math.max(0, translateDepth - 1);
    }

    // Persist translated positions for nodes that were moved programmatically via the view.
    for (const id of nodeIdsToMove) {
      const view = areaPlugin?.nodeViews?.get?.(String(id));
      const viewPos = view?.position as { x: number; y: number } | undefined;
      if (viewPos && Number.isFinite(viewPos.x) && Number.isFinite(viewPos.y)) {
        nodeEngine.updateNodePosition(String(id), { x: viewPos.x, y: viewPos.y });
      }
    }

    groupPortNodesController.scheduleAlign();
    requestFramesUpdate();
    requestMinimapUpdate();

    return ctx;
  });
};
