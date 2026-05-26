// Purpose: Mount and unmount browser/runtime resources for NodeCanvas.svelte.
import { get } from 'svelte/store';
import { initReteCanvas } from './rete-init';
import { bindCanvasInteractionHandlers } from './interaction-bindings';
import { destroyNodeCanvasResources } from './cleanup';
import {
  bindDisplayBridgeSubscription,
  bindGraphStateSubscription,
  bindGroupUiSubscriptions,
  bindLocalSemanticGraphChangeSubscription,
  bindManagerClientSubscription,
  bindRuntimeSubscriptions,
} from './subscriptions';
import { bindGroupFrameEvents } from '../groups/group-frame-events';
import { bindCustomNodeEvents } from '../custom-nodes/custom-node-events';

type MountOptions = Record<string, any>;

type WindowWithEngine = Window & { __shuguNodeEngine?: unknown };

export type MountedNodeCanvasResources = {
  editor: any;
  areaPlugin: any;
  graphSync: any;
  socketPositionWatcher: any;
  graphUnsub: (() => void) | null;
  localSemanticGraphChangeUnsub: (() => void) | null;
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
  keydownHandler: ((event: KeyboardEvent) => void) | null;
  wheelHandler: ((event: WheelEvent) => void) | null;
  contextMenuHandler: ((event: MouseEvent) => void) | null;
  pointerDownHandler: ((event: PointerEvent) => void) | null;
  pointerMoveHandler: ((event: PointerEvent) => void) | null;
  dblclickHandler: ((event: MouseEvent) => void) | null;
  toolbarMenuOutsideHandler: ((event: PointerEvent) => void) | null;
  groupFrameToggleHandler: ((event: Event) => void) | null;
  groupFrameDisabledHandler: ((event: Event) => void) | null;
  customNodeUncoupleHandler: ((event: Event) => void) | null;
  customNodeExpandHandler: ((event: Event) => void) | null;
  resizeObserver: ResizeObserver | null;
  nodeDragInteractions: any;
};

export async function mountNodeCanvasResources(
  opts: MountOptions
): Promise<MountedNodeCanvasResources | null> {
  if (!opts.container) return null;

  if (opts.isDev && opts.windowRef) {
    (opts.windowRef as WindowWithEngine).__shuguNodeEngine = opts.nodeEngine;
  }

  opts.midiController.start();
  opts.refreshNumberParams();
  const paramsUnsub = opts.parameterRegistry.subscribe(() => opts.refreshNumberParams());

  const runtimeSubs = bindRuntimeSubscriptions({
    nodeEngine: opts.nodeEngine,
    isRunningStore: opts.isRunningStore,
    deployedLoopIds: opts.deployedLoopIds,
    groupController: opts.groupController,
    groupPortNodesController: opts.groupPortNodesController,
    patchRuntime: opts.patchRuntime,
    loopController: opts.loopController,
  });

  const groupUiSubs = bindGroupUiSubscriptions({
    nodeGroupsState: opts.nodeGroupsState,
    nodeGroups: opts.groupController.nodeGroups,
    groupFrames: opts.groupFrames,
    groupController: opts.groupController,
    groupPortNodesController: opts.groupPortNodesController,
  });

  const rete = await initReteCanvas({
    container: opts.container,
    editorId: 'fluffy-rete',
    nodeMap: opts.nodeMap,
    connectionMap: opts.connectionMap,
    nodeRegistry: opts.nodeRegistry,
    nodeEngine: opts.nodeEngine,
    canvasCommands: opts.canvasCommands,
    groupController: opts.groupController,
    groupPortNodesController: opts.groupPortNodesController,
    groupEdgeFinder: opts.groupEdgeFinder,
    reteBuilder: opts.reteBuilder,
    graphStateStore: opts.graphStateStore,
    isRunningStore: opts.isRunningStore,
    isSyncingRef: opts.isSyncingRef,
    renderers: opts.renderers,
    socketPositionWatcher: opts.socketPositionWatcher,
    getLastPointerClient: opts.getLastPointerClient,
    setConnectDraggingSocket: opts.setConnectDraggingSocket,
    setGroupEdgeHighlight: opts.setGroupEdgeHighlight,
    computeGraphPosition: opts.computeGraphPosition,
    addNode: opts.addNode,
    findPortRowSocketAt: opts.findPortRowSocketAt,
    openConnectPicker: opts.openConnectPicker,
    setGraphState: opts.setGraphState,
    setNodeCount: opts.setNodeCount,
    getProjectionState: opts.getProjectionState,
    translateProjectionConnection: opts.translateProjectionConnection,
    updateProjectionNodePosition: opts.updateProjectionNodePosition,
    getSelectedNodeId: opts.getSelectedNodeId,
    syncSleepNodeSockets: opts.syncSleepNodeSockets,
    flushPendingCollapsedNodes: opts.flushPendingCollapsedNodes,
    minimapController: opts.minimapController,
    requestFramesUpdate: opts.requestFramesUpdate,
    getNodeGroupIds: opts.getNodeGroupIds,
    loopController: opts.loopController,
    midiController: opts.midiController,
    applyStoppedHighlights: opts.applyStoppedHighlights,
    syncPatchVisualState: opts.syncPatchVisualState,
    focusController: opts.focusController,
    syncClientNodesFromInputs: opts.syncClientNodesFromInputs,
    setSelectedNode: opts.setSelectedNode,
    isProjectionId: opts.isProjectionId,
  });

  const graphUnsub = bindGraphStateSubscription({
    graphStateStore: opts.graphStateStore,
    graphSync: rete.graphSync,
    groupController: opts.groupController,
    groupPortNodesController: opts.groupPortNodesController,
    patchRuntime: opts.patchRuntime,
    syncCustomGateInputs: opts.syncCustomGateInputs,
    rehydrateExpandedCustomFrames: opts.rehydrateExpandedCustomFrames,
    isApplyingServerSemanticSnapshot: () =>
      Boolean(opts.serverSemanticSyncState?.isApplyingSnapshot),
  });

  const localSemanticGraphChangeUnsub = bindLocalSemanticGraphChangeSubscription({
    graphChangesStore: opts.nodeEngine.graphChanges,
    canvasCommands: opts.canvasCommands,
    isSyncingGraph: opts.isSyncingGraph ?? (() => Boolean(opts.isSyncingRef?.value)),
  });

  const managerUnsub = bindManagerClientSubscription({
    managerState: opts.managerState,
    graphStateStore: opts.graphStateStore,
    graphSync: rete.graphSync,
    nodeEngine: opts.nodeEngine,
    schedulePatchReconcile: opts.schedulePatchReconcile,
    syncClientNodesFromInputs: opts.syncClientNodesFromInputs,
  });

  const displayBridgeUnsub = bindDisplayBridgeSubscription({
    displayBridgeState: opts.displayBridgeState,
    schedulePatchReconcile: opts.schedulePatchReconcile,
  });

  const groupEvents = bindGroupFrameEvents({
    groupController: opts.groupController,
    windowRef: opts.windowRef,
  });
  const customNodeEvents = bindCustomNodeEvents({
    onUncouple: opts.handleUncoupleCustomNode,
    onExpand: opts.handleExpandCustomNode,
    windowRef: opts.windowRef,
  });

  const interactions = bindCanvasInteractionHandlers({
    container: opts.container,
    windowRef: opts.windowRef,
    getAreaPlugin: () => opts.getAreaPlugin(),
    requestMinimapUpdate: opts.minimapController.requestUpdate,
    requestFramesUpdate: opts.requestFramesUpdate,
    isToolbarMenuOpen: opts.isToolbarMenuOpen,
    getToolbarMenuWrap: opts.getToolbarMenuWrap,
    closeToolbarMenu: opts.closeToolbarMenu,
    openPicker: opts.openPicker,
    getSelectedGroupIdStore: () => opts.selectedGroupId,
    getGroupFrames: () => get(opts.groupFrames) ?? [],
    getNodeEngine: () => opts.nodeEngine,
    getViewAdapter: () => opts.viewAdapter,
    getGroupController: () => opts.groupController,
    getGroupPortNodesController: () => opts.groupPortNodesController,
    computeGraphPosition: opts.computeGraphPosition,
    generateId: opts.generateId,
    addNode: (node: unknown) => opts.canvasCommands.addNode(node),
    setSelectedNode: opts.setSelectedNode,
    setLastPointerClient: opts.setLastPointerClient,
    getConnectDraggingSocket: opts.getConnectDraggingSocket,
    getGroupEdgeHighlight: opts.getGroupEdgeHighlight,
    setGroupEdgeHighlight: opts.setGroupEdgeHighlight,
    groupEdgeFinder: opts.groupEdgeFinder,
    groupFrames: opts.groupFrames,
    toggleGroupEditMode: opts.groupController.toggleGroupEditMode,
    minimapController: opts.minimapController,
    isPickerOpen: opts.isPickerOpen,
    closePicker: opts.closePicker,
    groupSelectionNodeIds: opts.groupController.groupSelectionNodeIds,
    selectedGroupId: opts.groupController.selectedGroupId,
    clearGroupSelection: () => opts.groupController.clearSelection(),
    getSelectedNodeId: opts.getSelectedNodeId,
    deleteNodeWithRules: opts.deleteNodeWithRules,
    clipboardController: opts.clipboardController,
  });

  return {
    ...rete,
    ...runtimeSubs,
    ...groupUiSubs,
    graphUnsub,
    localSemanticGraphChangeUnsub,
    managerUnsub,
    displayBridgeUnsub,
    paramsUnsub,
    groupFrameToggleHandler: groupEvents.onGroupFrameToggle,
    groupFrameDisabledHandler: groupEvents.onGroupFrameToggleDisabled,
    customNodeUncoupleHandler: customNodeEvents.onCustomNodeUncouple,
    customNodeExpandHandler: customNodeEvents.onCustomNodeExpand,
    ...interactions,
  };
}

export function destroyMountedNodeCanvasResources(
  resources: MountedNodeCanvasResources | null,
  opts: MountOptions
): void {
  if (!resources) return;
  destroyNodeCanvasResources({
    ...resources,
    container: opts.container,
    midiController: opts.midiController,
    patchRuntime: opts.patchRuntime,
    loopController: opts.loopController,
    frameDragController: opts.frameDragController,
    groupController: opts.groupController,
    groupPortNodesController: opts.groupPortNodesController,
    minimapController: opts.minimapController,
    nodeMap: opts.nodeMap,
    connectionMap: opts.connectionMap,
    nodeEngine: opts.nodeEngine,
    windowRef: opts.windowRef,
    isDev: opts.isDev,
  });
}
