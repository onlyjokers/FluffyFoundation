// Pointer drag interactions for NodeCanvas nodes.
import { get } from 'svelte/store';

import type { NodeInstance } from '$lib/nodes/types';
import {
  cloneInternalGraphForNewInstance,
  generateCustomNodeGroupId,
  readCustomNodeState,
  writeCustomNodeState,
} from '$lib/nodes/custom-nodes/instance';
import { asRecord, getString } from '$lib/utils/value-guards';

type NodeDragInteractionsOptions = {
  windowRef: Window;
  getSelectedGroupIdStore: () => { set: (value: string | null) => void };
  getGroupFrames: () => unknown[];
  getNodeEngine: () => {
    getNode: (nodeId: string) => NodeInstance | null | undefined;
    updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
    updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  };
  getViewAdapter: () => {
    getNodePosition: (nodeId: string) => { x: number; y: number } | null | undefined;
    setNodePosition: (nodeId: string, x: number, y: number) => void;
  };
  getGroupController: () => {
    clearSelection: () => void;
    handleDroppedNodesAfterDrag: (nodeIds: string[]) => void;
    onPointerDown: (event: PointerEvent) => void;
  };
  getGroupPortNodesController: () => {
    scheduleAlign: () => void;
  };
  computeGraphPosition: (clientX: number, clientY: number) => { x: number; y: number };
  generateId: () => string;
  addNode: (node: NodeInstance) => void;
  setSelectedNode: (nodeId: string) => void;
};

export function createNodeDragInteractions(options: NodeDragInteractionsOptions) {
  let altDuplicateDragPointerId: number | null = null;
  let altDuplicateDragMoveHandler: ((event: PointerEvent) => void) | null = null;
  let altDuplicateDragUpHandler: ((event: PointerEvent) => void) | null = null;
  let proxyDragPointerId: number | null = null;
  let proxyDragMoveHandler: ((event: PointerEvent) => void) | null = null;
  let proxyDragUpHandler: ((event: PointerEvent) => void) | null = null;

  const clearProxyDrag = () => {
    if (proxyDragMoveHandler) {
      options.windowRef.removeEventListener('pointermove', proxyDragMoveHandler, {
        capture: true,
      });
    }
    if (proxyDragUpHandler) {
      options.windowRef.removeEventListener('pointerup', proxyDragUpHandler, { capture: true });
      options.windowRef.removeEventListener('pointercancel', proxyDragUpHandler, {
        capture: true,
      });
    }
    proxyDragPointerId = null;
    proxyDragMoveHandler = null;
    proxyDragUpHandler = null;
  };

  const clearAltDuplicateDrag = () => {
    if (altDuplicateDragMoveHandler) {
      options.windowRef.removeEventListener('pointermove', altDuplicateDragMoveHandler, {
        capture: true,
      });
    }
    if (altDuplicateDragUpHandler) {
      options.windowRef.removeEventListener('pointerup', altDuplicateDragUpHandler, {
        capture: true,
      });
      options.windowRef.removeEventListener('pointercancel', altDuplicateDragUpHandler, {
        capture: true,
      });
    }
    altDuplicateDragPointerId = null;
    altDuplicateDragMoveHandler = null;
    altDuplicateDragUpHandler = null;
  };

  const tryStartProxyDrag = (event: PointerEvent, target: HTMLElement | null): boolean => {
    if (event.button !== 0 || event.altKey || proxyDragPointerId !== null) return false;

    const nodeEl = (target?.closest?.('.node') as HTMLElement | null) ?? null;
    const nodeId = String(nodeEl?.dataset?.reteNodeId ?? '');
    const isOnSocket = Boolean(target?.closest?.('.socket'));
    const isEditing =
      Boolean(target?.closest?.('input, textarea, select, button')) ||
      Boolean(target?.isContentEditable) ||
      Boolean(target?.closest?.('.port-control')) ||
      Boolean(target?.closest?.('.cmd-aggregator-controls'));

    if (!nodeEl || !nodeId || isEditing) return false;

    const node = options.getNodeEngine().getNode(nodeId);
    if (node?.type !== 'group-proxy') return false;

    options.getGroupController().clearSelection();
    options.setSelectedNode(nodeId);

    if (isOnSocket) return false;

    const groupId = getString(asRecord(node.config).groupId, '');
    if (!groupId) return true;

    const frames = options.getGroupFrames() ?? [];
    const frame =
      frames.find((f) => String(asRecord(asRecord(f).group).id ?? '') === groupId) ?? null;
    if (!frame) return true;

    const frameRecord = asRecord(frame);
    const direction =
      getString(asRecord(node.config).direction, 'output') === 'input' ? 'input' : 'output';
    const proxyWidth = 48;
    const proxyHalfHeight = 10;
    const proxyOutset = 10;
    const proxyEdgeNudge = 12;

    const left = Number(frameRecord.left ?? 0);
    const top = Number(frameRecord.top ?? 0);
    const width = Number(frameRecord.width ?? 0);
    const height = Number(frameRecord.height ?? 0);
    const isMinimized = Boolean(asRecord(frameRecord.group).minimized);

    const fixedX = isMinimized
      ? direction === 'input'
        ? left - proxyOutset
        : left + width + proxyOutset - proxyWidth
      : direction === 'input'
        ? left - proxyWidth / 2 - proxyEdgeNudge
        : left + width - proxyWidth / 2 + proxyEdgeNudge;
    const topPad = isMinimized
      ? 44 + 6 + 28 / 2
      : (() => {
          if (!Number.isFinite(height) || height <= 0) return 56;
          return Math.max(24, Math.min(56, Math.max(0, height / 2 - 18)));
        })();
    const bottomPad = isMinimized ? 6 + 28 / 2 : topPad;
    const minCenterY = top + topPad;
    const maxCenterY = top + height - bottomPad;
    const clampCenterY = (y: number) => {
      if (!Number.isFinite(y)) return top + height / 2;
      if (
        !Number.isFinite(minCenterY) ||
        !Number.isFinite(maxCenterY) ||
        maxCenterY <= minCenterY
      ) {
        return top + height / 2;
      }
      return Math.max(minCenterY, Math.min(maxCenterY, y));
    };

    event.preventDefault();
    event.stopPropagation();

    const startGraph = options.computeGraphPosition(event.clientX, event.clientY);
    const startPos =
      options.getViewAdapter().getNodePosition(nodeId) ??
      ({
        x: Number(node.position?.x ?? 0),
        y: Number(node.position?.y ?? 0),
      } as const);
    const dragOffsetY = startGraph.y - startPos.y;

    const onMove = (moveEvent: PointerEvent) => {
      if (proxyDragPointerId === null) return;
      if (moveEvent.pointerId !== proxyDragPointerId) return;

      const graphPos = options.computeGraphPosition(moveEvent.clientX, moveEvent.clientY);
      const desiredTopLeftY = graphPos.y - dragOffsetY;
      const desiredCenterY = desiredTopLeftY + proxyHalfHeight;
      const clampedCenterY = clampCenterY(desiredCenterY);
      const topLeftY = clampedCenterY - proxyHalfHeight;
      options.getViewAdapter().setNodePosition(nodeId, fixedX, topLeftY);

      moveEvent.preventDefault();
      moveEvent.stopPropagation();
    };

    const onUp = (upEvent: PointerEvent) => {
      if (proxyDragPointerId === null) return;
      if (upEvent.pointerId !== proxyDragPointerId) return;

      clearProxyDrag();

      const pos = options.getViewAdapter().getNodePosition(nodeId);
      if (pos) options.getNodeEngine().updateNodePosition(nodeId, { x: pos.x, y: pos.y });
      options.getNodeEngine().updateNodeConfig(nodeId, { pinned: true });
      options.getGroupPortNodesController().scheduleAlign();
    };

    proxyDragPointerId = event.pointerId;
    proxyDragMoveHandler = onMove;
    proxyDragUpHandler = onUp;
    options.windowRef.addEventListener('pointermove', onMove, { capture: true });
    options.windowRef.addEventListener('pointerup', onUp, { capture: true });
    options.windowRef.addEventListener('pointercancel', onUp, { capture: true });
    return true;
  };

  const tryStartAltDuplicateDrag = (event: PointerEvent, target: HTMLElement | null): boolean => {
    if (event.button !== 0 || !event.altKey || altDuplicateDragPointerId !== null) return false;

    const nodeEl = (target?.closest?.('.node') as HTMLElement | null) ?? null;
    const nodeId = String(nodeEl?.dataset?.reteNodeId ?? '');
    const tag = target?.tagName?.toLowerCase?.() ?? '';
    const isEditing =
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      tag === 'button' ||
      Boolean(target?.isContentEditable) ||
      Boolean(target?.closest?.('input, textarea, select, button')) ||
      Boolean(target?.closest?.('.port-control')) ||
      Boolean(target?.closest?.('.cmd-aggregator-controls'));

    if (!nodeEl || !nodeId || isEditing) return false;

    event.preventDefault();
    event.stopPropagation();

    const initialNode = options.getNodeEngine().getNode(nodeId);
    if (!initialNode) return true;

    options.getGroupController().clearSelection();
    options.setSelectedNode(nodeId);

    const startClient = { x: event.clientX, y: event.clientY };
    const startGraph = options.computeGraphPosition(event.clientX, event.clientY);
    const startPos =
      options.getViewAdapter().getNodePosition(nodeId) ??
      ({
        x: Number(initialNode.position?.x ?? 0),
        y: Number(initialNode.position?.y ?? 0),
      } as const);

    let didDuplicate = false;
    let duplicatedId: string | null = null;
    let dragOffset = { x: startGraph.x - startPos.x, y: startGraph.y - startPos.y };
    const minDragPx = 4;

    const onMove = (moveEvent: PointerEvent) => {
      if (altDuplicateDragPointerId === null) return;
      if (moveEvent.pointerId !== altDuplicateDragPointerId) return;

      const dx = moveEvent.clientX - startClient.x;
      const dy = moveEvent.clientY - startClient.y;
      const dist = Math.hypot(dx, dy);

      if (!didDuplicate) {
        if (dist < minDragPx) return;

        const source = options.getNodeEngine().getNode(nodeId);
        if (!source) {
          clearAltDuplicateDrag();
          return;
        }

        const basePos =
          options.getViewAdapter().getNodePosition(nodeId) ??
          ({
            x: Number(source.position?.x ?? 0),
            y: Number(source.position?.y ?? 0),
          } as const);

        const newId = options.generateId();
        let config = { ...(source.config ?? {}) };
        const state = readCustomNodeState(config);
        if (state) {
          const groupId = generateCustomNodeGroupId();
          config = writeCustomNodeState(config, {
            ...state,
            groupId,
            role: 'child',
            internal: cloneInternalGraphForNewInstance(state.internal, groupId),
          });
        }
        const clone: NodeInstance = {
          id: newId,
          type: String(source.type ?? ''),
          position: { x: basePos.x, y: basePos.y },
          config,
          inputValues: { ...(source.inputValues ?? {}) },
          outputValues: {},
        };

        options.addNode(clone);
        didDuplicate = true;
        duplicatedId = newId;
        dragOffset = { x: startGraph.x - basePos.x, y: startGraph.y - basePos.y };

        options.getGroupController().clearSelection();
        options.setSelectedNode(newId);
      }

      if (!duplicatedId) return;

      const graphPos = options.computeGraphPosition(moveEvent.clientX, moveEvent.clientY);
      const desiredX = graphPos.x - dragOffset.x;
      const desiredY = graphPos.y - dragOffset.y;
      options.getViewAdapter().setNodePosition(duplicatedId, desiredX, desiredY);

      moveEvent.preventDefault();
      moveEvent.stopPropagation();
    };

    const onUp = (upEvent: PointerEvent) => {
      if (altDuplicateDragPointerId === null) return;
      if (upEvent.pointerId !== altDuplicateDragPointerId) return;

      const finalId = duplicatedId;
      clearAltDuplicateDrag();

      if (finalId) {
        const pos = options.getViewAdapter().getNodePosition(finalId);
        if (pos) options.getNodeEngine().updateNodePosition(finalId, { x: pos.x, y: pos.y });
        options.getGroupController().handleDroppedNodesAfterDrag([finalId]);
      }
    };

    altDuplicateDragPointerId = event.pointerId;
    altDuplicateDragMoveHandler = onMove;
    altDuplicateDragUpHandler = onUp;
    options.windowRef.addEventListener('pointermove', onMove, { capture: true });
    options.windowRef.addEventListener('pointerup', onUp, { capture: true });
    options.windowRef.addEventListener('pointercancel', onUp, { capture: true });
    return true;
  };

  const handlePointerDown = (event: PointerEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest?.('.group-frame-header')) options.getSelectedGroupIdStore().set(null);
    if (tryStartProxyDrag(event, target)) return;
    if (tryStartAltDuplicateDrag(event, target)) return;
    options.getGroupController().onPointerDown(event);
  };

  const destroy = () => {
    clearProxyDrag();
    clearAltDuplicateDrag();
  };

  return { handlePointerDown, destroy };
}
