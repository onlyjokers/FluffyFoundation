// Purpose: Centralized cleanup for NodeCanvas resources on unmount.

type WindowWithEngine = Window & { __shuguNodeEngine?: unknown };

type EventHandler<T extends Event> = ((event: T) => void) | null;

type Destroyable = { destroy?: () => void } | null;

type ControllerDestroyable = { destroy: () => void };

type NodeEngineLike = { clearDisabledNodes: () => void };

export type NodeCanvasDestroyContext = {
  container: HTMLDivElement | null;
  graphUnsub: (() => void) | null;
  groupNodesUnsub: (() => void) | null;
  groupFramesUnsub: (() => void) | null;
  groupUiStateUnsub: (() => void) | null;
  paramsUnsub: (() => void) | null;
  tickUnsub: (() => void) | null;
  runningUnsub: (() => void) | null;
  loopDeployUnsub: (() => void) | null;
  groupDisabledUnsub: (() => void) | null;
  managerUnsub: (() => void) | null;
  displayBridgeUnsub: (() => void) | null;
  midiController: { stop: () => void };
  patchRuntime: { destroy: () => void };
  loopController: Destroyable;
  frameDragController: ControllerDestroyable;
  groupController: ControllerDestroyable;
  groupPortNodesController: ControllerDestroyable;
  minimapController: ControllerDestroyable;
  keydownHandler: EventHandler<KeyboardEvent>;
  wheelHandler: EventHandler<WheelEvent>;
  contextMenuHandler: EventHandler<MouseEvent>;
  pointerDownHandler: EventHandler<PointerEvent>;
  pointerMoveHandler: EventHandler<PointerEvent>;
  dblclickHandler: EventHandler<MouseEvent>;
  toolbarMenuOutsideHandler: EventHandler<PointerEvent>;
  altDuplicateDragMoveHandler: EventHandler<PointerEvent>;
  altDuplicateDragUpHandler: EventHandler<PointerEvent>;
  proxyDragMoveHandler: EventHandler<PointerEvent>;
  proxyDragUpHandler: EventHandler<PointerEvent>;
  groupFrameToggleHandler: EventHandler<Event>;
  groupFrameDisabledHandler: EventHandler<Event>;
  customNodeUncoupleHandler: EventHandler<Event>;
  customNodeExpandHandler: EventHandler<Event>;
  resizeObserver: ResizeObserver | null;
  socketPositionWatcher: Destroyable;
  areaPlugin: Destroyable;
  editor: { clear?: () => void } | null;
  nodeMap: Map<string, unknown>;
  connectionMap: Map<string, unknown>;
  nodeEngine: NodeEngineLike;
  windowRef?: Window | undefined;
  isDev: boolean;
  setAltDuplicateDragPointerId: (value: number | null) => void;
  setAltDuplicateDragMoveHandler: (handler: EventHandler<PointerEvent>) => void;
  setAltDuplicateDragUpHandler: (handler: EventHandler<PointerEvent>) => void;
  setProxyDragPointerId: (value: number | null) => void;
  setProxyDragMoveHandler: (handler: EventHandler<PointerEvent>) => void;
  setProxyDragUpHandler: (handler: EventHandler<PointerEvent>) => void;
};

export const destroyNodeCanvasResources = (ctx: NodeCanvasDestroyContext) => {
  const win = ctx.windowRef;

  ctx.graphUnsub?.();
  ctx.groupNodesUnsub?.();
  ctx.groupFramesUnsub?.();
  ctx.groupUiStateUnsub?.();
  ctx.paramsUnsub?.();
  ctx.tickUnsub?.();
  ctx.runningUnsub?.();
  ctx.loopDeployUnsub?.();
  ctx.groupDisabledUnsub?.();
  ctx.managerUnsub?.();
  ctx.displayBridgeUnsub?.();
  ctx.midiController.stop();
  ctx.patchRuntime.destroy();
  ctx.loopController?.destroy?.();
  ctx.frameDragController.destroy();
  ctx.groupController.destroy();
  ctx.groupPortNodesController.destroy();
  ctx.minimapController.destroy();

  if (win && ctx.wheelHandler) win.removeEventListener('wheel', ctx.wheelHandler, { capture: true });
  if (ctx.contextMenuHandler)
    ctx.container?.removeEventListener('contextmenu', ctx.contextMenuHandler, { capture: true });
  if (ctx.pointerDownHandler)
    ctx.container?.removeEventListener('pointerdown', ctx.pointerDownHandler, { capture: true });
  if (ctx.pointerMoveHandler)
    ctx.container?.removeEventListener('pointermove', ctx.pointerMoveHandler, { capture: true });
  if (ctx.dblclickHandler)
    ctx.container?.removeEventListener('dblclick', ctx.dblclickHandler, { capture: true });
  if (win && ctx.keydownHandler) win.removeEventListener('keydown', ctx.keydownHandler);

  if (win && ctx.altDuplicateDragMoveHandler)
    win.removeEventListener('pointermove', ctx.altDuplicateDragMoveHandler, { capture: true });
  if (win && ctx.altDuplicateDragUpHandler) {
    win.removeEventListener('pointerup', ctx.altDuplicateDragUpHandler, { capture: true });
    win.removeEventListener('pointercancel', ctx.altDuplicateDragUpHandler, { capture: true });
  }
  ctx.setAltDuplicateDragPointerId(null);
  ctx.setAltDuplicateDragMoveHandler(null);
  ctx.setAltDuplicateDragUpHandler(null);

  if (win && ctx.proxyDragMoveHandler)
    win.removeEventListener('pointermove', ctx.proxyDragMoveHandler, { capture: true });
  if (win && ctx.proxyDragUpHandler) {
    win.removeEventListener('pointerup', ctx.proxyDragUpHandler, { capture: true });
    win.removeEventListener('pointercancel', ctx.proxyDragUpHandler, { capture: true });
  }
  ctx.setProxyDragPointerId(null);
  ctx.setProxyDragMoveHandler(null);
  ctx.setProxyDragUpHandler(null);

  if (win && ctx.toolbarMenuOutsideHandler)
    win.removeEventListener('pointerdown', ctx.toolbarMenuOutsideHandler, { capture: true });
  if (win && ctx.groupFrameToggleHandler)
    win.removeEventListener('shugu:toggle-group-minimized', ctx.groupFrameToggleHandler);
  if (win && ctx.groupFrameDisabledHandler)
    win.removeEventListener('shugu:toggle-group-disabled', ctx.groupFrameDisabledHandler);
  if (win && ctx.customNodeUncoupleHandler)
    win.removeEventListener('shugu:custom-node-uncouple', ctx.customNodeUncoupleHandler);
  if (win && ctx.customNodeExpandHandler)
    win.removeEventListener('shugu:custom-node-expand', ctx.customNodeExpandHandler);

  ctx.resizeObserver?.disconnect();
  ctx.socketPositionWatcher?.destroy?.();
  ctx.areaPlugin?.destroy?.();
  ctx.editor?.clear?.();
  ctx.nodeMap.clear();
  ctx.connectionMap.clear();
  ctx.nodeEngine.clearDisabledNodes();

  if (ctx.isDev && win) {
    const winRecord = win as WindowWithEngine;
    if (winRecord.__shuguNodeEngine === ctx.nodeEngine) {
      delete winRecord.__shuguNodeEngine;
    }
  }
};
