/**
 * Purpose: Bind Rete editor/area pipes to the NodeEngine + UI helpers.
 */
import { get, type Writable } from 'svelte/store';
import type { BaseSchemes, NodeEditor } from 'rete';
import type { AreaPlugin } from 'rete-area-plugin';
import type { Connection as EngineConnection } from '$lib/nodes/types';

type AnyAreaPlugin = AreaPlugin<BaseSchemes, unknown>;
type AnyRecord = Record<string, unknown>;
type ControlLike = { readonly?: boolean };

type RetePipeOptions = {
  editor: NodeEditor<BaseSchemes>;
  areaPlugin: AnyAreaPlugin | null;
  nodeEngine: {
    addConnection: (conn: EngineConnection) => boolean;
    removeConnection: (id: string) => void;
    removeNode: (id: string) => void;
    updateNodePosition: (id: string, pos: { x: number; y: number }) => void;
  };
  nodeMap: Map<string, AnyRecord>;
  connectionMap: Map<string, AnyRecord>;
  isSyncing: () => boolean;
  setSelectedNode: (id: string) => void;
  groupSelectionNodeIds: Writable<Set<string>>;
  isProgrammaticTranslate: () => boolean;
  handleDroppedNodesAfterDrag: (nodeIds: string[]) => void;
  requestFramesUpdate: () => void;
  requestMinimapUpdate: () => void;
};

export function bindRetePipes(opts: RetePipeOptions) {
  const {
    editor,
    areaPlugin,
    nodeEngine,
    nodeMap,
    connectionMap,
    isSyncing,
    setSelectedNode,
    groupSelectionNodeIds,
    isProgrammaticTranslate,
    handleDroppedNodesAfterDrag,
    requestFramesUpdate,
    requestMinimapUpdate,
  } = opts;

  let multiDragLeaderId: string | null = null;
  let multiDragLeaderLastPos: { x: number; y: number } | null = null;
  let multiDragTranslateDepth = 0;
  const isMultiDragTranslate = () => multiDragTranslateDepth > 0;

  editor.addPipe(async (ctx) => {
    if (!ctx || typeof ctx !== 'object') return ctx;
    if (isSyncing()) return ctx;

    if (ctx.type === 'connectioncreated') {
      const c = ctx.data as AnyRecord;
      const engineConn: EngineConnection = {
        id: String(c.id),
        sourceNodeId: String(c.source),
        sourcePortId: String(c.sourceOutput),
        targetNodeId: String(c.target),
        targetPortId: String(c.targetInput),
      };
      const accepted = nodeEngine.addConnection(engineConn);
      if (accepted) {
        connectionMap.set(engineConn.id, c);
        const targetNode = nodeMap.get(engineConn.targetNodeId);
        const targetRecord = (targetNode ?? {}) as AnyRecord;
        const input = (targetRecord.inputs as Record<string, AnyRecord> | undefined)?.[engineConn.targetPortId];
        const control = input?.control as ControlLike | undefined;
        if (control && Boolean(control.readonly) !== true) {
          control.readonly = true;
          await areaPlugin?.update?.('node', engineConn.targetNodeId);
        }
      } else if (editor) {
        try {
          if (editor.getConnection(String(c.id))) {
            await editor.removeConnection(String(c.id));
          }
        } catch {
          // ignore
        }
      }
    }

    if (ctx.type === 'connectionremoved') {
      const raw = ctx.data as AnyRecord;
      const id = String(raw.id);
      const targetId = String(raw.target);
      const portId = String(raw.targetInput);
      connectionMap.delete(id);
      nodeEngine.removeConnection(id);
      const targetNode = nodeMap.get(targetId);
      const targetRecord = (targetNode ?? {}) as AnyRecord;
      const input = (targetRecord.inputs as Record<string, AnyRecord> | undefined)?.[portId];
      const control = input?.control as ControlLike | undefined;
      if (control) {
        const stillConnected = Array.from(connectionMap.values()).some(
          (conn) => String((conn as AnyRecord).target) === targetId && String((conn as AnyRecord).targetInput) === portId
        );
        if (Boolean(control.readonly) !== stillConnected) {
          control.readonly = stillConnected;
          await areaPlugin?.update?.('node', targetId);
        }
      }
    }

    if (ctx.type === 'noderemoved') {
      const id = String((ctx.data as AnyRecord).id);
      nodeMap.delete(id);
      nodeEngine.removeNode(id);
    }

    return ctx;
  });

  if (!areaPlugin) return;
  areaPlugin.addPipe(async (ctx: AnyRecord) => {
    // During graph sync we translate nodes programmatically (engine -> view). Rete also emits an initial
    // `nodetranslated` from NodeView construction (0,0), which must NOT be treated as a user move,
    // otherwise it overwrites engine positions and makes import/paste layouts "fly" to the top-left.
    const syncing = isSyncing();
    if (ctx?.type === 'nodepicked') {
      setSelectedNode(String(ctx.data?.id ?? ''));
    }
    if (ctx?.type === 'nodetranslate') {
      if (syncing) return ctx;
      if (isProgrammaticTranslate() || isMultiDragTranslate()) return ctx;

      const id = String(ctx.data?.id ?? '');
      const selectedIds = get(groupSelectionNodeIds);
      if (id && selectedIds.size > 1 && selectedIds.has(id)) {
        multiDragLeaderId = id;
        const view = areaPlugin?.nodeViews?.get?.(id);
        const pos = view?.position as { x: number; y: number } | undefined;
        multiDragLeaderLastPos = pos ? { x: pos.x, y: pos.y } : null;
      } else {
        multiDragLeaderId = null;
        multiDragLeaderLastPos = null;
      }
    }
    if (ctx?.type === 'nodedragged') {
      if (syncing) return ctx;
      const id = String(ctx.data?.id ?? '');
      const selectedIds = get(groupSelectionNodeIds);
      const movedNodeIds =
        multiDragLeaderId && id === multiDragLeaderId && selectedIds.size > 1 && selectedIds.has(id)
          ? Array.from(selectedIds).map(String)
          : id
            ? [id]
            : [];
      multiDragLeaderId = null;
      multiDragLeaderLastPos = null;
      handleDroppedNodesAfterDrag(movedNodeIds);

      // Ensure NodeEngine positions stay in sync even if intermediate `nodetranslated` events
      // were missed (e.g. due to renderer timing). This fixes export/import and copy/paste layout.
      if (areaPlugin?.nodeViews) {
        for (const movedId of movedNodeIds) {
          const view = areaPlugin.nodeViews.get(String(movedId));
          const pos = view?.position as { x: number; y: number } | undefined;
          if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) continue;
          nodeEngine.updateNodePosition(String(movedId), { x: pos.x, y: pos.y });
        }
      }
    }
    if (ctx?.type === 'translated' || ctx?.type === 'zoomed' || ctx?.type === 'nodetranslated') {
      requestMinimapUpdate();
      requestFramesUpdate();
    }
    if (ctx?.type === 'pointerdown') {
      const target = ctx.data?.event?.target as HTMLElement | undefined;
      const clickedNode = target?.closest?.('.node');
      if (!clickedNode) setSelectedNode('');
    }
    if (ctx?.type === 'nodetranslated') {
      if (syncing) return ctx;
      const { id, position, previous } = ctx.data ?? {};
      if (id && position) {
        // Ignore no-op translations (including NodeView's initial translate(0,0) on construction).
        if (
          previous &&
          typeof previous.x === 'number' &&
          typeof previous.y === 'number' &&
          previous.x === position.x &&
          previous.y === position.y
        ) {
          return ctx;
        }

        const nodeId = String(id);
        const selectedIds = get(groupSelectionNodeIds);

        if (
          multiDragLeaderId &&
          nodeId === multiDragLeaderId &&
          selectedIds.size > 1 &&
          !isProgrammaticTranslate()
        ) {
          if (!multiDragLeaderLastPos) {
            multiDragLeaderLastPos = { x: position.x, y: position.y };
          } else {
            const dx = position.x - multiDragLeaderLastPos.x;
            const dy = position.y - multiDragLeaderLastPos.y;
            multiDragLeaderLastPos = { x: position.x, y: position.y };

            if ((dx || dy) && areaPlugin?.nodeViews) {
              multiDragTranslateDepth += 1;
              try {
                const promises: Promise<unknown>[] = [];
                for (const otherId of selectedIds) {
                  const oid = String(otherId);
                  if (oid === nodeId) continue;
                  const view = areaPlugin.nodeViews.get(oid);
                  const pos = view?.position as { x: number; y: number } | undefined;
                  if (!pos) continue;
                  promises.push(areaPlugin.translate(oid, { x: pos.x + dx, y: pos.y + dy }));
                }
                await Promise.all(promises);
              } finally {
                multiDragTranslateDepth = Math.max(0, multiDragTranslateDepth - 1);
              }
            }
          }
        }

        nodeEngine.updateNodePosition(nodeId, { x: position.x, y: position.y });
      }
    }
    return ctx;
  });
}
