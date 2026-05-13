<script lang="ts">
  // @ts-nocheck
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';

  import NodeCanvasChrome from './node-canvas/ui/NodeCanvasChrome.svelte';
  import { createCanvasActions } from './node-canvas/ui/canvas-actions';
  import { createToolbarActions } from './node-canvas/ui/toolbar-actions';
  import { reteRenderers } from './node-canvas/registry/renderers';
  import { nodeGraphPerfConsole, nodeGraphEdgeShadows } from '$lib/features/node-graph-flags';

  import { nodeEngine, nodeRegistry } from '$lib/nodes';
  import {
    CUSTOM_NODE_TYPE_PREFIX,
    addCustomNodeDefinition,
    customNodeDefinitions,
    customNodeType,
    getCustomNodeDefinition,
    removeCustomNodeDefinition,
    upsertCustomNodeDefinition,
  } from '$lib/nodes/custom-nodes/store';
  import {
    cloneInternalGraphForNewInstance,
    generateCustomNodeGroupId,
    readCustomNodeState,
    writeCustomNodeState,
  } from '$lib/nodes/custom-nodes/instance';
  import { syncCustomNodeInternalGraph, syncNestedCustomNodesToDefinition } from '$lib/nodes/custom-nodes/sync';
  import { definitionsInCycles, wouldCreateCycle } from '$lib/nodes/custom-nodes/deps';
  import { parameterRegistry } from '$lib/parameters/registry';
  import { nodeGroupsState } from '$lib/project/nodeGraphUiState';
  import { displayTransport, getSDK, sensorData, state as managerState } from '$lib/stores/manager';
  import { displayBridgeState, ensureDisplayLocalFilesRegisteredFromValue } from '$lib/display/display-bridge';
  import type { NodeInstance, Connection as EngineConnection, GraphState } from '$lib/nodes/types';
  import type { LocalLoop } from '$lib/nodes';
  import { createNodeCanvasFileActionBundle } from './node-canvas/io/node-canvas-file-actions';
  import { createReteAdapter, type GraphViewAdapter } from './node-canvas/adapters';
  import { createNodeCanvasSemanticCommands } from './node-canvas/adapters/semantic-command-adapter';
  import { createMinimapController } from './node-canvas/controllers/minimap-controller';
  import { createGroupController, type GroupFrame } from './node-canvas/controllers/group-controller';
  import { createFocusController } from './node-canvas/controllers/focus-controller';
  import { createGroupPortNodesController } from './node-canvas/controllers/group-port-nodes-controller';
  import { createClipboardController } from './node-canvas/controllers/clipboard-controller';
  import { createFrameDragController } from './node-canvas/controllers/frame-drag-controller';
  import { createSelectionController } from './node-canvas/controllers/selection-controller';
  import { createLoopController, type LoopController } from './node-canvas/controllers/loop-controller';
  import { createMidiHighlightController } from './node-canvas/controllers/midi-highlight-controller';
  import { createPickerController, type SocketData } from './node-canvas/controllers/picker-controller';
  import { createReteBuilder } from './node-canvas/rete/rete-builder';
  import { createReteSockets } from './node-canvas/rete/rete-sockets';
  import { readAreaTransform } from './node-canvas/utils/view-utils';
  import {
    customNodeIdFromMaterializedNodeId,
    internalNodeIdFromMaterialized,
    isMaterializedInternalNodeId,
    materializeInternalNodeId,
  } from './node-canvas/custom-nodes/custom-node-ids';
  import type { ExpandedCustomNodeFrame } from './node-canvas/custom-nodes/custom-node-expansion';
  import { bindCustomNodeEvents } from './node-canvas/custom-nodes/custom-node-events';
  import { createCustomNodeComposition } from './node-canvas/custom-nodes/custom-node-composition';
  import { createNodeAdder } from './node-canvas/custom-nodes/node-addition';
  import { createDeleteNodeWithRules } from './node-canvas/custom-nodes/custom-node-delete';
  import { deepestGroupIdContainingNode } from './node-canvas/groups/group-tree';
  import { bindGroupFrameEvents } from './node-canvas/groups/group-frame-events';
  import { createGroupEdgeFinder } from './node-canvas/groups/group-edge-finder';
  import { createGroupFrameHeaderHandlers } from './node-canvas/groups/group-frame-header';
  import {
    deriveGateModeGroupIds,
    deriveGroupGateNodeIdByGroupId,
  } from './node-canvas/groups/group-gate-state';
  import {
    buildGroupPortIndex,
    groupIdFromNode,
    isGroupPortNodeType,
  } from './node-canvas/utils/group-port-utils';
  import { createMinimapProjection } from './node-canvas/utils/minimap-projection';
  import { initNodeCanvasRuntime } from './node-canvas/runtime/runtime-init';
  import {
    destroyMountedNodeCanvasResources,
    mountNodeCanvasResources,
    type MountedNodeCanvasResources,
  } from './node-canvas/lifecycle/mount';
  import { createNodeVisualState } from './node-canvas/ui/node-visual-state';

  let container: HTMLDivElement | null = null;
  let areaPlugin: any = null;
  let mountedResources: MountedNodeCanvasResources | null = null;

  const sockets = createReteSockets();

  const nodeMap = new Map<string, NodeInstance>();
  const connectionMap = new Map<string, EngineConnection>();
  const isSyncingRef = { value: false };

  let graphState: GraphState = { nodes: [], connections: [] };
  let nodeCount = 0;
  let selectedNodeId = '';
  let importGraphInputEl: HTMLInputElement | null = null;
  let importTemplatesInputEl: HTMLInputElement | null = null;
  let importCustomNodeInputEl: HTMLInputElement | null = null;
  let isToolbarMenuOpen = false;
  let isModelDistributionPanelOpen = false;
  let toolbarMenuWrap: HTMLDivElement | null = null;
  let numberParamOptions: { path: string; label: string }[] = [];
  let pickerElement: HTMLDivElement | null = null;
  let lastPointerClient = { x: 0, y: 0 };
  let groupEdgeHighlight: { groupId: string; side: 'input' | 'output' } | null = null;
  let connectDraggingSocket: SocketData | null = null;

  const graphStateStore = nodeEngine?.graphState;
  const isRunningStore = nodeEngine?.isRunning;
  const lastErrorStore = nodeEngine?.lastError;

  let loopController: LoopController | null = null;
  let minimapController: ReturnType<typeof createMinimapController> | null = null;
  let requestFramesUpdate = () => {};
  let canvasTransform = { k: 1, tx: 0, ty: 0 };

  const viewAdapter: GraphViewAdapter = createReteAdapter({
    getContainer: () => container,
    getAreaPlugin: () => areaPlugin,
    getNodeMap: () => nodeMap,
    getConnectionMap: () => connectionMap,
    requestFramesUpdate: () => requestFramesUpdate(),
  });

  const canvasCommands = createNodeCanvasSemanticCommands({
    nodeEngine,
    nodeRegistry,
    getGroups: () => get(groupController.nodeGroups),
    getPartitions: () =>
      loopController
        ? get(loopController.localLoops).map((loop) => ({
            id: loop.id,
            nodeIds: loop.nodeIds,
            status: get(loopController!.deployedLoopIds).has(loop.id) ? 'deployed' : 'draft',
            requiredCapabilities: loop.requiredCapabilities,
          }))
        : [],
    isRunningStore,
    lastErrorStore,
  });

  const nodeVisualState = createNodeVisualState({
    viewAdapter,
    nodeMap,
    requestFramesUpdate: () => requestFramesUpdate(),
    requestMinimapUpdate: () => minimapController?.requestUpdate(),
  });
  const { forcedHiddenNodeIds, getNodeCollapsed, flushPendingCollapsedNodes, setNodeCollapsed } =
    nodeVisualState;

  const groupController = createGroupController({
    getContainer: () => container,
    getAdapter: () => viewAdapter,
    getGraphState: () => graphState,
    getForcedHiddenNodeIds: () => forcedHiddenNodeIds,
    getLocalLoops: () => (loopController ? get(loopController.localLoops) : []),
    getLoopConstraintLoops: () => (loopController ? loopController.getEffectiveLoops() : []),
    getDeployedLoopIds: () => (loopController ? get(loopController.deployedLoopIds) : new Set()),
    setNodesDisabled: (ids, disabled) => nodeEngine.setNodesDisabled(ids, disabled),
    requestLoopFramesUpdate: () => requestFramesUpdate(),
    requestMinimapUpdate: () => minimapController?.requestUpdate(),
    isSyncingGraph: () => isSyncingRef.value,
    stopAndRemoveLoop: (loop: LocalLoop) => loopController?.loopActions.removeLoop(loop),
  });

  minimapController = createMinimapController({
    getContainer: () => container,
    getAdapter: () => viewAdapter,
    getGraphState: () => graphState,
    getSelectedNodeId: () => selectedNodeId,
    getLocalLoopConnIds: () => (loopController ? get(loopController.localLoopConnIds) : new Set()),
    getDeployedConnIds: () => (loopController ? get(loopController.deployedConnIds) : new Set()),
  });

  loopController = createLoopController({
    nodeEngine,
    getSDK,
    isRunning: () => get(isRunningStore),
    getGraphState: () => graphState,
    getAdapter: () => viewAdapter,
    getGroupDisabledNodeIds: () => get(groupController.groupDisabledNodeIds),
    isSyncingGraph: () => isSyncingRef.value,
    onDeployTimeout: (loopId) => alert(`Deploy timeout for loop ${loopId}`),
    onDeployError: (message) => alert(`Deploy failed: ${message}`),
    onDeployMissingClient: () => alert('Select a client in the Client node before deploying.'),
    onMissingSdk: () => alert('Manager SDK not connected.'),
    onLoopVanished: () => undefined,
    onLoopFrameReady: (loop) => {
      const effectiveLoop =
        loopController?.getEffectiveLoops().find((l) => l.id === loop.id) ?? loop;
      const bounds = groupController.computeLoopFrameBounds(effectiveLoop);
      if (!bounds) return;
      groupController.pushNodesOutOfBounds(
        bounds,
        new Set((effectiveLoop.nodeIds ?? []).map((id) => String(id)))
      );
    },
  });

  const {
    loopFrames,
    deployedLoopIds,
    executorStatusByClient,
    showExecutorLogs,
    logsClientId,
  } = loopController;

  const {
    nodeGroups,
    groupFrames,
    editModeGroupId,
    selectedGroupId,
    canvasToast,
    groupEditToast,
    groupSelectionBounds,
    groupSelectionNodeIds,
    marqueeRect,
  } = groupController;

  $: gateModeGroupIds = deriveGateModeGroupIds(graphState.nodes, graphState.connections);

  $: groupGateNodeIdByGroupId = deriveGroupGateNodeIdByGroupId(graphState.nodes);

  const { minimap, minimapUi } = minimapController;

  const midiController = createMidiHighlightController({
    getGraphState: () => graphState,
    getGroupDisabledNodeIds: () => get(groupController.groupDisabledNodeIds),
    getAdapter: () => viewAdapter,
    isSyncingGraph: () => isSyncingRef.value,
  });

  const focusController = createFocusController({
    getContainer: () => container,
    getGraphState: () => graphState,
    exportGraph: () => nodeEngine.exportGraph(),
    adapter: viewAdapter,
    requestFramesUpdate: () => requestFramesUpdate(),
    requestMinimapUpdate: () => minimapController?.requestUpdate(),
    getNodeGroups: () => get(nodeGroups),
    getGroupFrames: () => get(groupFrames),
  });

  requestFramesUpdate = () => {
    const t = readAreaTransform(areaPlugin);
    if (t) canvasTransform = t;
    loopController?.requestFramesUpdate();
    groupController.requestFramesUpdate();
  };

  const { sleepNodeSockets, patchRuntime, clientSelectionBinding } = initNodeCanvasRuntime({
    nodeEngine,
    nodeRegistry,
    adapter: viewAdapter,
    getGraphState: () => graphState,
    graphStateStore,
    isRunningStore,
    groupDisabledNodeIds: groupController.groupDisabledNodeIds,
    executorStatusByClient,
    showExecutorLogs,
    logsClientId,
    loopController,
    managerState,
    displayTransport,
    getSDK,
    ensureDisplayLocalFilesRegisteredFromValue,
    sensorData,
    getAreaPlugin: () => areaPlugin,
    getNodeMap: () => nodeMap,
    sockets,
  });

  const syncSleepNodeSockets = sleepNodeSockets.syncSleepNodeSockets;
  const resolveSleepOutputType = sleepNodeSockets.resolveSleepOutputType;
  const applyClientNodeSelection = (nodeId: string, next: Record<string, unknown>) =>
    clientSelectionBinding.applyClientNodeSelection(nodeId, next);
  const syncClientNodesFromInputs = () => clientSelectionBinding.syncClientNodesFromInputs();
  const schedulePatchReconcile = (reason: string) => patchRuntime.scheduleReconcile(reason);
  const stopAllDeployedPatches = () => patchRuntime.stopAllDeployedPatches();
  const applyStoppedHighlights = (running: boolean) => patchRuntime.applyStoppedHighlights(running);
  const toggleExecutorLogs = () => patchRuntime.toggleExecutorLogs();
  const toggleModelDistributionPanel = () => (isModelDistributionPanelOpen = !isModelDistributionPanelOpen);
  const syncPatchVisualState = () => patchRuntime.syncPatchVisualState();
  const sendNodeOverride = patchRuntime.sendNodeOverride;

  const reteBuilder = createReteBuilder({
    nodeRegistry,
    nodeEngine,
    sockets,
    getNumberParamOptions: () => numberParamOptions,
    sendNodeOverride,
    onClientNodePick: (nodeId, clientId) => void applyClientNodeSelection(nodeId, { clientId }),
    onClientNodeSelectInput: (nodeId, portId, value) =>
      void applyClientNodeSelection(nodeId, { [portId]: value }),
    onClientNodeRandom: (nodeId, value) => void applyClientNodeSelection(nodeId, { random: value }),
  });

  let pickerControllerRef: ReturnType<typeof createPickerController> | null = null;

  const pickerController = createPickerController({
    nodeRegistry,
    getContainer: () => container,
    computeGraphPosition,
    getLastPointerClient: () => lastPointerClient,
    graphStateStore,
    getPortDefForSocket: (socket) => {
      const base = reteBuilder.getPortDefForSocket(socket);
      if (!base) return null;
      if (socket.side === 'output' && socket.key === 'output') {
        const node = (graphState.nodes ?? []).find((n) => String(n.id) === String(socket.nodeId));
        if (node && String(node.type) === 'logic-sleep') {
          const { type } = resolveSleepOutputType(String(node.id));
          return { ...base, type };
        }
      }
      return base;
    },
    bestMatchingPort: reteBuilder.bestMatchingPort,
    addNode: (type, position) => {
      const nodeId = addNode(type, position);
      if (!nodeId) return nodeId;

      const picker = pickerControllerRef;
      const mode = picker ? get(picker.mode) : 'add';
      const initial = picker ? get(picker.initialSocket) : null;

      if (mode === 'connect' && initial && position) {
        groupController.autoAddNodeToGroupFromConnectDrop(initial.nodeId, nodeId, position);
        loopController?.autoAddNodeToLoopFromConnectDrop(initial.nodeId, nodeId, position);
      }

      return nodeId;
    },
    addConnection: (conn) => {
      canvasCommands.connect(conn);
    },
  });

  pickerControllerRef = pickerController;

  const {
    isOpen: isPickerOpen,
    mode: pickerMode,
    anchor: pickerAnchor,
    selectedCategory: pickerSelectedCategory,
    query: pickerQuery,
    initialSocket: pickerInitialSocket,
    items: pickerItems,
    categories: pickerCategories,
    setPickerElement,
    openPicker,
    openConnectPicker,
    closePicker,
    handlePick: handlePickerPick,
  } = pickerController;

  $: setPickerElement(pickerElement);

  const { toMiniX, toMiniY } = createMinimapProjection(minimap);

  const refreshNumberParams = () => {
    const params = parameterRegistry
      .list()
      .filter((p) => p.type === 'number')
      .filter((p) => !p.metadata?.hidden);
    numberParamOptions = params
      .map((p) => ({
        path: p.path,
        label: p.metadata?.label || p.path.split('/').pop() || p.path,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  };

  const { setSelectedNode } = createSelectionController({
    getSelectedNodeId: () => selectedNodeId,
    setSelectedNodeId: (nodeId) => {
      selectedNodeId = nodeId;
    },
    selectedGroupId,
    nodeMap,
    getAreaPlugin: () => areaPlugin,
  });

  const deleteNodeWithRules = createDeleteNodeWithRules({
    nodeEngine,
    readCustomNodeState,
    getCustomNodeDefinition,
    removeCustomNodeDefinition,
    getSelectedNodeId: () => selectedNodeId,
    setSelectedNode,
    confirm,
  });

  const expandedCustomByGroupId = new Map<string, ExpandedCustomNodeFrame>();
  let expandedCustomGroupIds: Set<string> = new Set();

  const generateId = () => `node-${crypto.randomUUID?.() ?? Date.now()}`;

  const groupPortNodesController = createGroupPortNodesController({
    nodeEngine,
    nodeRegistry,
    adapter: viewAdapter,
    groupController,
    getNodeCount: () => nodeCount,
    generateId,
  });

  const {
    handleToggleGroupDisabled,
    handleRenameGroup,
    syncCustomGateInputs,
    handleNodalizeGroup,
    handleUncoupleCustomNode,
    handleDenodalizeGroup,
    rehydrateExpandedCustomFrames,
    handleExpandCustomNode,
    handleCollapseCustomNodeFrame,
  } = createCustomNodeComposition({
    nodeEngine,
    nodeRegistry,
    groupController,
    groupPortNodesController,
    groupFrames,
    viewAdapter,
    buildGroupPortIndex,
    groupIdFromNode,
    isGroupPortNodeType,
    customNodeType,
    addCustomNodeDefinition,
    removeCustomNodeDefinition,
    getCustomNodeDefinition,
    upsertCustomNodeDefinition,
    customNodeDefinitions,
    readCustomNodeState,
    writeCustomNodeState,
    syncCustomNodeInternalGraph,
    syncNestedCustomNodesToDefinition,
    definitionsInCycles,
    deepestGroupIdContainingNode,
    materializeInternalNodeId,
    isMaterializedInternalNodeId,
    internalNodeIdFromMaterialized,
    customNodeIdFromMaterializedNodeId,
    expandedCustomByGroupId,
    forcedHiddenNodeIds,
    setExpandedCustomGroupIds: (next) => {
      expandedCustomGroupIds = next;
    },
    requestFramesUpdate,
    setSelectedNode,
  });

  function computeGraphPosition(clientX: number, clientY: number) {
    const pos = viewAdapter.clientToGraph(clientX, clientY);
    if (Number.isFinite(pos.x) && Number.isFinite(pos.y)) return pos;
    return { x: 120 + nodeCount * 10, y: 120 + nodeCount * 6 };
  }

  const groupEdgeFinder = createGroupEdgeFinder({
    getFrames: () => get(groupFrames) ?? [],
    clientToGraph: (x, y) => viewAdapter.clientToGraph(x, y),
    getScale: () => Number(canvasTransform?.k ?? 1) || 1,
  });

  const findPortRowSocketAt = (
    clientX: number,
    clientY: number,
    desiredSide: 'input' | 'output'
  ): SocketData | null => {
    if (!container) return null;
    if (typeof document === 'undefined') return null;
    const elements = document.elementsFromPoint(clientX, clientY) as Element[];
    for (const el of elements) {
      const row = (el as HTMLElement | null)?.closest?.(
        '[data-rete-port-side][data-rete-port-key][data-rete-node-id]'
      ) as HTMLElement | null;
      if (!row) continue;
      if (!container.contains(row)) continue;
      const side = (row.dataset.retePortSide as 'input' | 'output' | undefined) ?? undefined;
      if (!side || side !== desiredSide) continue;
      const nodeId = row.dataset.reteNodeId;
      const key = row.dataset.retePortKey;
      if (!nodeId || !key) continue;
      return { nodeId, side, key };
    }
    return null;
  };

  const addNode = createNodeAdder({
    nodeRegistry,
    nodeEngine,
    customNodeTypePrefix: CUSTOM_NODE_TYPE_PREFIX,
    getCustomNodeDefinition,
    cloneInternalGraphForNewInstance,
    generateCustomNodeGroupId,
    readCustomNodeState,
    writeCustomNodeState,
    customNodeDefinitions,
    wouldCreateCycle,
    getGroupFrames: () => get(groupFrames) ?? [],
    expandedCustomByGroupId,
    getNodeCount: () => nodeCount,
    generateId,
    addNodeCommand: (node) => canvasCommands.addNode(node),
  });

  const clipboardController = createClipboardController({
    getContainer: () => container,
    nodeEngine,
    adapter: viewAdapter,
    getGraphState: () => graphState,
    getNodeCount: () => nodeCount,
    getSelectedNodeId: () => selectedNodeId,
    setSelectedNode,
    groupController,
    getLastPointerClient: () => lastPointerClient,
    computeGraphPosition,
    generateId,
  });

  const frameDragController = createFrameDragController({
    getAreaPlugin: () => areaPlugin,
    groupController,
    getLoopController: () => loopController,
  });

  const groupFrameHeaderHandlers = createGroupFrameHeaderHandlers({
    selectedGroupId,
    groupSelectionNodeIds,
    groupSelectionBounds,
    groupController,
    frameDragController,
    setSelectedNode,
  });

  const { handleToggleEngine, handleClear, resetGroups, viewportCenterGraphPos } =
    createCanvasActions({
      nodeEngine,
      isRunningStore,
      getLoopController: () => loopController,
      groupController,
      getContainer: () => container,
      getNodeCount: () => nodeCount,
      computeGraphPosition,
      schedulePatchReconcile,
      stopAllDeployedPatches,
      confirm,
    });

  const importCustomNode = () => {
    importCustomNodeInputEl?.click?.();
  };

  const {
    fileActions,
    exportCustomNode,
    handleImportCustomNodeChange,
  } = createNodeCanvasFileActionBundle({
    nodeEngine,
    viewAdapter,
    getNodeCollapsed,
    setNodeCollapsed,
    getImportGraphInput: () => importGraphInputEl,
    getImportTemplatesInput: () => importTemplatesInputEl,
    getSelectedNodeId: () => selectedNodeId,
    getViewportCenterGraphPos: viewportCenterGraphPos,
    generateId,
    addCustomNodeDefinition,
    addNodeCommand: (node) => canvasCommands.addNode(node),
    groupController,
    requestFramesUpdate,
    requestMinimapUpdate: () => minimapController?.requestUpdate(),
    setSelectedNode,
    focusController,
  });

  const closeToolbarMenu = () => {
    isToolbarMenuOpen = false;
  };

  const toggleToolbarMenu = () => {
    isToolbarMenuOpen = !isToolbarMenuOpen;
  };

  const { handleToolbarMenuPick } = createToolbarActions({
    closeToolbarMenu,
    toggleToolbarMenu,
  });

  $: if (selectedNodeId && !graphState.nodes.some((n) => n.id === selectedNodeId)) {
    setSelectedNode('');
  }

  onMount(async () => {
    mountedResources = await mountNodeCanvasResources({
      container,
      nodeMap,
      connectionMap,
      nodeRegistry,
      nodeEngine,
      canvasCommands,
      groupController,
      groupPortNodesController,
      groupEdgeFinder,
      reteBuilder,
      graphStateStore,
      isRunningStore,
      deployedLoopIds,
      patchRuntime,
      isSyncingRef,
      renderers: reteRenderers,
      socketPositionWatcher: null,
      getLastPointerClient: () => lastPointerClient,
      setConnectDraggingSocket: (socket) => {
        connectDraggingSocket = socket as SocketData | null;
      },
      setGroupEdgeHighlight: (highlight) => {
        groupEdgeHighlight = highlight as typeof groupEdgeHighlight;
      },
      computeGraphPosition,
      addNode,
      findPortRowSocketAt,
      openConnectPicker,
      setGraphState: (state) => (graphState = state as GraphState),
      setNodeCount: (count) => (nodeCount = count),
      getSelectedNodeId: () => selectedNodeId,
      syncSleepNodeSockets,
      flushPendingCollapsedNodes,
      minimapController,
      requestFramesUpdate,
      loopController,
      midiController,
      applyStoppedHighlights,
      syncPatchVisualState,
      focusController,
      syncClientNodesFromInputs,
      setSelectedNode,
      managerState,
      displayBridgeState,
      schedulePatchReconcile,
      syncCustomGateInputs,
      rehydrateExpandedCustomFrames,
      requestMinimapUpdate: minimapController.requestUpdate,
      requestFramesUpdate,
      isToolbarMenuOpen: () => isToolbarMenuOpen,
      getToolbarMenuWrap: () => toolbarMenuWrap,
      closeToolbarMenu,
      openPicker,
      getSelectedGroupIdStore: () => selectedGroupId,
      getGroupFrames: () => get(groupFrames) ?? [],
      getNodeEngine: () => nodeEngine,
      getViewAdapter: () => viewAdapter,
      getGroupController: () => groupController,
      getGroupPortNodesController: () => groupPortNodesController,
      computeGraphPosition,
      generateId,
      addNode: (node) => canvasCommands.addNode(node),
      setSelectedNode,
      setLastPointerClient: (client) => {
        lastPointerClient = client;
      },
      getConnectDraggingSocket: () => connectDraggingSocket,
      getGroupEdgeHighlight: () => groupEdgeHighlight,
      setGroupEdgeHighlight: (highlight) => {
        groupEdgeHighlight = highlight as typeof groupEdgeHighlight;
      },
      groupEdgeFinder,
      groupFrames,
      toggleGroupEditMode: groupController.toggleGroupEditMode,
      minimapController,
      isPickerOpen,
      closePicker,
      groupSelectionNodeIds: groupController.groupSelectionNodeIds,
      selectedGroupId: groupController.selectedGroupId,
      clearGroupSelection: () => groupController.clearSelection(),
      getSelectedNodeId: () => selectedNodeId,
      deleteNodeWithRules,
      clipboardController,
      parameterRegistry,
      refreshNumberParams,
      midiController,
      nodeGroupsState,
      groupFrames,
      handleUncoupleCustomNode,
      handleExpandCustomNode,
      windowRef: window,
      viewAdapter,
      getAreaPlugin: () => areaPlugin,
      isDev: import.meta.env.DEV,
    });
    areaPlugin = mountedResources?.areaPlugin ?? null;
  });

  onDestroy(() => {
    destroyMountedNodeCanvasResources(mountedResources, {
      container,
      midiController,
      patchRuntime,
      loopController,
      frameDragController,
      groupController,
      groupPortNodesController,
      minimapController,
      nodeMap,
      connectionMap,
      nodeEngine,
      windowRef: typeof window === 'undefined' ? undefined : window,
      isDev: import.meta.env.DEV,
    });
  });
</script>

<NodeCanvasChrome
  bind:container
  bind:importGraphInputEl
  bind:importTemplatesInputEl
  bind:importCustomNodeInputEl
  bind:toolbarMenuWrap
  bind:pickerElement
  isRunning={$isRunningStore}
  edgeShadowsEnabled={$nodeGraphEdgeShadows}
  gridScale={canvasTransform.k}
  gridOffset={{ x: canvasTransform.tx, y: canvasTransform.ty }}
  {nodeCount}
  groups={$nodeGroups}
  graphConnectionCount={graphState.connections?.length ?? 0}
  lastError={$lastErrorStore}
  {isToolbarMenuOpen}
  showPerfConsole={$nodeGraphPerfConsole}
  canvasToast={$canvasToast}
  {isModelDistributionPanelOpen}
  onCloseModelDistributionPanel={() => (isModelDistributionPanelOpen = false)}
  {fileActions}
  {handleImportCustomNodeChange}
  {importCustomNode}
  {exportCustomNode}
  focusGroupById={focusController.focusGroupById}
  {handleToggleEngine}
  {toggleExecutorLogs}
  {handleClear}
  {toggleToolbarMenu}
  {handleToolbarMenuPick}
  {toggleModelDistributionPanel}
  showExecutorLogs={$showExecutorLogs}
  logsClientId={$logsClientId}
  executorStatusByClient={$executorStatusByClient}
  onCloseExecutorLogs={() => showExecutorLogs.set(false)}
  picker={{
    isOpen: $isPickerOpen,
    mode: $pickerMode,
    initialSocket: $pickerInitialSocket,
    anchor: $pickerAnchor,
    query: $pickerQuery,
    categories: $pickerCategories,
    selectedCategory: $pickerSelectedCategory,
    items: $pickerItems,
    onClose: closePicker,
    onPick: handlePickerPick,
  }}
  {reteBuilder}
  groupFrames={$groupFrames}
  editModeGroupId={$editModeGroupId}
  selectedGroupId={$selectedGroupId}
  groupEditToast={$groupEditToast}
  {groupEdgeHighlight}
  {gateModeGroupIds}
  {groupGateNodeIdByGroupId}
  {expandedCustomGroupIds}
  groupOverlayActions={{
    onToggleDisabled: handleToggleGroupDisabled,
    onToggleMinimized: groupController.toggleGroupMinimized,
    onToggleEditMode: groupController.toggleGroupEditMode,
    onNodalize: handleNodalizeGroup,
    onDenodalize: handleDenodalizeGroup,
    onCollapseCustomNode: handleCollapseCustomNodeFrame,
    onDisassemble: groupPortNodesController.disassembleGroupAndPorts,
    onRename: handleRenameGroup,
    onHeaderPointerDown: groupFrameHeaderHandlers.handleGroupHeaderPointerDown,
  }}
  loopFrames={$loopFrames}
  deployedLoopIds={$deployedLoopIds}
  {loopController}
  {frameDragController}
  marqueeRect={$marqueeRect}
  groupSelectionBounds={$groupSelectionBounds}
  groupSelectionCount={$groupSelectionNodeIds.size}
  createGroupFromSelection={groupController.createGroupFromSelection}
  minimapUi={$minimapUi}
  minimap={$minimap}
  {toMiniX}
  {toMiniY}
  {minimapController}
/>
