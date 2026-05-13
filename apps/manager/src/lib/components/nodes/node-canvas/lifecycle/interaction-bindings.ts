// Purpose: Bind browser and canvas interactions for NodeCanvas mount.
import { normalizeAreaTransform } from '../utils/view-utils';
import { bindCanvasWheelZoom } from '../interactions/canvas-wheel';
import { bindCanvasMenuHandlers } from '../interactions/canvas-menu';
import { bindCanvasKeyboard } from '../interactions/canvas-keyboard';
import { bindCanvasGroupEditDblClick } from '../interactions/canvas-group-edit-dblclick';
import { createNodeDragInteractions } from '../interactions/node-drag-interactions';

export function bindCanvasInteractionHandlers(opts: {
  container: HTMLDivElement;
  windowRef: Window;
  getAreaPlugin: () => any;
  requestMinimapUpdate: () => void;
  requestFramesUpdate: () => void;
  isToolbarMenuOpen: () => boolean;
  getToolbarMenuWrap: () => HTMLDivElement | null;
  closeToolbarMenu: () => void;
  openPicker: (...args: any[]) => unknown;
  getSelectedGroupIdStore: () => any;
  getGroupFrames: () => unknown[];
  getNodeEngine: () => any;
  getViewAdapter: () => any;
  getGroupController: () => any;
  getGroupPortNodesController: () => any;
  computeGraphPosition: (clientX: number, clientY: number) => { x: number; y: number };
  generateId: () => string;
  addNode: (node: unknown) => void;
  setSelectedNode: (id: string) => void;
  setLastPointerClient: (client: { x: number; y: number }) => void;
  getConnectDraggingSocket: () => unknown;
  getGroupEdgeHighlight: () => unknown;
  setGroupEdgeHighlight: (highlight: unknown) => void;
  groupEdgeFinder: any;
  groupFrames: any;
  toggleGroupEditMode: (groupId: string) => void;
  minimapController: any;
  isPickerOpen: any;
  closePicker: () => void;
  groupSelectionNodeIds: any;
  selectedGroupId: any;
  clearGroupSelection: () => void;
  getSelectedNodeId: () => string;
  deleteNodeWithRules: (nodeId: string) => void;
  clipboardController: any;
}) {
  const wheelHandler = bindCanvasWheelZoom({
    windowRef: opts.windowRef,
    getContainer: () => opts.container,
    getAreaPlugin: opts.getAreaPlugin,
    requestMinimapUpdate: opts.requestMinimapUpdate,
    requestFramesUpdate: opts.requestFramesUpdate,
  });

  const menuHandlers = bindCanvasMenuHandlers({
    container: opts.container,
    windowRef: opts.windowRef,
    isToolbarMenuOpen: opts.isToolbarMenuOpen,
    getToolbarMenuWrap: opts.getToolbarMenuWrap,
    closeToolbarMenu: opts.closeToolbarMenu,
    openPicker: opts.openPicker,
  });

  const nodeDragInteractions = createNodeDragInteractions({
    windowRef: opts.windowRef,
    getSelectedGroupIdStore: opts.getSelectedGroupIdStore,
    getGroupFrames: opts.getGroupFrames,
    getNodeEngine: opts.getNodeEngine,
    getViewAdapter: opts.getViewAdapter,
    getGroupController: opts.getGroupController,
    getGroupPortNodesController: opts.getGroupPortNodesController,
    computeGraphPosition: opts.computeGraphPosition,
    generateId: opts.generateId,
    addNode: opts.addNode,
    setSelectedNode: opts.setSelectedNode,
  });
  opts.container.addEventListener('pointerdown', nodeDragInteractions.handlePointerDown, {
    capture: true,
  });

  const pointerMoveHandler = (event: PointerEvent) => {
    opts.setLastPointerClient({ x: event.clientX, y: event.clientY });
    if (opts.getConnectDraggingSocket()) {
      const edge = opts.groupEdgeFinder.findGroupProxyEdgeTargetAt(event.clientX, event.clientY);
      opts.setGroupEdgeHighlight(edge ? { groupId: edge.groupId, side: edge.side } : null);
    } else if (opts.getGroupEdgeHighlight()) {
      opts.setGroupEdgeHighlight(null);
    }
  };
  opts.container.addEventListener('pointermove', pointerMoveHandler, { capture: true });

  const dblclickHandler = bindCanvasGroupEditDblClick({
    container: opts.container,
    getAreaPlugin: opts.getAreaPlugin,
    groupFrames: opts.groupFrames,
    toggleGroupEditMode: opts.toggleGroupEditMode,
  });

  const resizeObserver = new ResizeObserver(() => {
    const areaPlugin = opts.getAreaPlugin();
    const area = areaPlugin?.area;
    if (!area) return;
    normalizeAreaTransform(area);
    area.update?.();
    opts.minimapController.handleContainerResize();
    opts.requestFramesUpdate();
  });
  resizeObserver.observe(opts.container);

  const keydownHandler = bindCanvasKeyboard({
    windowRef: opts.windowRef,
    isToolbarMenuOpen: opts.isToolbarMenuOpen,
    closeToolbarMenu: opts.closeToolbarMenu,
    isPickerOpen: opts.isPickerOpen,
    closePicker: opts.closePicker,
    groupSelectionNodeIds: opts.groupSelectionNodeIds,
    selectedGroupId: opts.selectedGroupId,
    clearGroupSelection: opts.clearGroupSelection,
    getSelectedNodeId: opts.getSelectedNodeId,
    deleteNodeWithRules: opts.deleteNodeWithRules,
    clipboardController: opts.clipboardController,
  });

  return {
    wheelHandler,
    contextMenuHandler: menuHandlers.onContextMenu,
    toolbarMenuOutsideHandler: menuHandlers.onWindowPointerDown,
    nodeDragInteractions,
    pointerDownHandler: nodeDragInteractions.handlePointerDown,
    pointerMoveHandler,
    dblclickHandler,
    resizeObserver,
    keydownHandler,
  };
}
