<script lang="ts">
  // @ts-nocheck
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import { ClassicPreset, NodeEditor } from 'rete';
  import { AreaPlugin, AreaExtensions } from 'rete-area-plugin';
  import { ConnectionPlugin, Presets as ConnectionPresets } from 'rete-connection-plugin';
  import { HistoryPlugin } from 'rete-history-plugin';
  import { SveltePlugin } from 'rete-svelte-plugin';

  import NodeCanvasLayout from './node-canvas/ui/NodeCanvasLayout.svelte';
  import { reteRenderers } from './node-canvas/registry/renderers';
  import ExecutorLogsPanel from './node-canvas/ui/panels/ExecutorLogsPanel.svelte';
  import GroupFramesOverlay from './node-canvas/ui/overlays/GroupFramesOverlay.svelte';
  import LoopFramesOverlay from './node-canvas/ui/overlays/LoopFramesOverlay.svelte';
  import MarqueeOverlay from './node-canvas/ui/overlays/MarqueeOverlay.svelte';
  import NodeCanvasMinimap from './node-canvas/ui/NodeCanvasMinimap.svelte';
  import NodeCanvasToolbar from './node-canvas/ui/NodeCanvasToolbar.svelte';
  import NodePickerOverlay from './node-canvas/ui/NodePickerOverlay.svelte';
  import PerformanceDebugConsole from './node-canvas/ui/PerformanceDebugConsole.svelte';
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
  import {
    syncCustomNodeInternalGraph,
    syncNestedCustomNodesToDefinition,
  } from '$lib/nodes/custom-nodes/sync';
  import { definitionsInCycles, wouldCreateCycle } from '$lib/nodes/custom-nodes/deps';
  import {
    buildCustomNodeFile,
    parseCustomNodeFile,
    remapImportedDefinitions,
  } from '$lib/nodes/custom-nodes/io';
  import { parameterRegistry } from '$lib/parameters/registry';
  import { nodeGroupsState } from '$lib/project/nodeGraphUiState';
  import { displayTransport, getSDK, sensorData, state as managerState } from '$lib/stores/manager';
  import {
    displayBridgeState,
    ensureDisplayLocalFilesRegisteredFromValue,
  } from '$lib/display/display-bridge';
  import { asRecord, getBoolean, getString } from '$lib/utils/value-guards';
  import type { NodeInstance, Connection as EngineConnection, GraphState } from '$lib/nodes/types';
  import type { LocalLoop } from '$lib/nodes';
  import { midiService } from '$lib/features/midi/midi-service';
  import { createFileActions } from './node-canvas/io/file-actions';
  import { LiveDOMSocketPosition } from './node-canvas/rete/live-socket-position';
  import { createReteAdapter, type GraphViewAdapter } from './node-canvas/adapters';
  import { createMinimapController } from './node-canvas/controllers/minimap-controller';
  import { createGroupController, type GroupFrame, type NodeGroup } from './node-canvas/controllers/group-controller';
  import { createFocusController } from './node-canvas/controllers/focus-controller';
  import { createGroupPortNodesController } from './node-canvas/controllers/group-port-nodes-controller';
  import { createClipboardController } from './node-canvas/controllers/clipboard-controller';
  import { createFrameDragController } from './node-canvas/controllers/frame-drag-controller';
  import {
    createLoopController,
    type LoopController,
  } from './node-canvas/controllers/loop-controller';
  import { createMidiHighlightController } from './node-canvas/controllers/midi-highlight-controller';
  import {
    createPickerController,
    type SocketData,
  } from './node-canvas/controllers/picker-controller';
  import { createReteBuilder } from './node-canvas/rete/rete-builder';
  import { createGraphSync, type GraphSyncController } from './node-canvas/rete/rete-sync';
  import { bindRetePipes } from './node-canvas/rete/rete-pipes';
  import { setupReteRenderPreset } from './node-canvas/rete/setup-rete-render';
  import { normalizeAreaTransform, readAreaTransform } from './node-canvas/utils/view-utils';
  import {
    customNodeIdFromMaterializedNodeId,
    internalNodeIdFromMaterialized,
    isMaterializedInternalNodeId,
    materializeInternalNodeId,
  } from './node-canvas/custom-nodes/custom-node-ids';
  import {
    createCustomNodeExpansion,
    type ExpandedCustomNodeFrame,
  } from './node-canvas/custom-nodes/custom-node-expansion';
  import { bindCustomNodeEvents } from './node-canvas/custom-nodes/custom-node-events';
  import { createCustomNodeHandlers } from './node-canvas/custom-nodes/custom-node-handlers';
  import { createCustomNodeActions } from './node-canvas/custom-nodes/custom-node-actions';
  import { deepestGroupIdContainingNode } from './node-canvas/groups/group-tree';
  import { bindGroupFrameEvents } from './node-canvas/groups/group-frame-events';
  import { createGroupEdgeFinder } from './node-canvas/groups/group-edge-finder';
  import { createGroupFrameHeaderHandlers } from './node-canvas/groups/group-frame-header';
  import { registerGroupFrameTranslatePipe } from './node-canvas/groups/group-frame-translate';
  import {
    buildGroupPortIndex,
    groupIdFromNode,
    isGroupPortNodeType,
  } from './node-canvas/utils/group-port-utils';
  import { initNodeCanvasRuntime } from './node-canvas/runtime/runtime-init';
  import { destroyNodeCanvasResources } from './node-canvas/lifecycle/cleanup';

  type ReteSchemes = ClassicPreset.Schemes;

  let container: HTMLDivElement | null = null;
  let editor: NodeEditor<ReteSchemes> | null = null;
  let areaPlugin: AreaPlugin<ReteSchemes> | null = null;
  let graphUnsub: (() => void) | null = null;
  let paramsUnsub: (() => void) | null = null;
  let tickUnsub: (() => void) | null = null;
  let runningUnsub: (() => void) | null = null;
  let groupDisabledUnsub: (() => void) | null = null;
  let groupNodesUnsub: (() => void) | null = null;
  let groupFramesUnsub: (() => void) | null = null;
  let groupUiStateUnsub: (() => void) | null = null;
  let keydownHandler: ((event: KeyboardEvent) => void) | null = null;
  let wheelHandler: ((event: WheelEvent) => void) | null = null;
  let contextMenuHandler: ((event: MouseEvent) => void) | null = null;
  let pointerDownHandler: ((event: PointerEvent) => void) | null = null;
  let pointerMoveHandler: ((event: PointerEvent) => void) | null = null;
  let dblclickHandler: ((event: MouseEvent) => void) | null = null;
  let toolbarMenuOutsideHandler: ((event: PointerEvent) => void) | null = null;
  let altDuplicateDragPointerId: number | null = null;
  let altDuplicateDragMoveHandler: ((event: PointerEvent) => void) | null = null;
  let altDuplicateDragUpHandler: ((event: PointerEvent) => void) | null = null;
  let proxyDragPointerId: number | null = null;
  let proxyDragMoveHandler: ((event: PointerEvent) => void) | null = null;
  let proxyDragUpHandler: ((event: PointerEvent) => void) | null = null;
  let groupFrameToggleHandler: ((event: Event) => void) | null = null;
  let groupFrameDisabledHandler: ((event: Event) => void) | null = null;
  let customNodeUncoupleHandler: ((event: Event) => void) | null = null;
  let customNodeExpandHandler: ((event: Event) => void) | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let socketPositionWatcher: LiveDOMSocketPosition | null = null;
  let managerUnsub: (() => void) | null = null;
  let displayBridgeUnsub: (() => void) | null = null;
  let loopDeployUnsub: (() => void) | null = null;

  const sockets = {
    number: new ClassicPreset.Socket('number'),
    boolean: new ClassicPreset.Socket('boolean'),
    string: new ClassicPreset.Socket('string'),
    asset: new ClassicPreset.Socket('asset'),
    color: new ClassicPreset.Socket('color'),
    audio: new ClassicPreset.Socket('audio'),
    image: new ClassicPreset.Socket('image'),
    video: new ClassicPreset.Socket('video'),
    scene: new ClassicPreset.Socket('scene'),
    effect: new ClassicPreset.Socket('effect'),
    client: new ClassicPreset.Socket('client'),
    command: new ClassicPreset.Socket('command'),
    fuzzy: new ClassicPreset.Socket('fuzzy'),
    array: new ClassicPreset.Socket('array'),
    any: new ClassicPreset.Socket('any'),
  } as const;

  const nodeMap = new Map<string, NodeInstance>();
  const connectionMap = new Map<string, EngineConnection>();
  const isSyncingRef = { value: false };

  let graphState: GraphState = { nodes: [], connections: [] };
  let nodeCount = 0;
  let lastGraphNodeCount = -1;
  let lastGraphConnKey = '';
  let selectedNodeId = '';
  let importGraphInputEl: HTMLInputElement | null = null;
  let importTemplatesInputEl: HTMLInputElement | null = null;
  let importCustomNodeInputEl: HTMLInputElement | null = null;
  let isToolbarMenuOpen = false;
  let toolbarMenuWrap: HTMLDivElement | null = null;
  let numberParamOptions: { path: string; label: string }[] = [];
  let pickerElement: HTMLDivElement | null = null;
  let lastPointerClient = { x: 0, y: 0 };
  let groupEdgeHighlight: { groupId: string; side: 'input' | 'output' } | null = null;
  let connectDraggingSocket: SocketData | null = null;

  // Project persistence: keep Group metadata in sync with ProjectManager autosave/restore.
  let syncingGroupsFromProject = false;
  let syncingGroupsToProject = false;
  let lastGroupsKeyFromProject = '';
  let lastGroupsKeyFromCanvas = '';

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

  // Manager-only visual state (not part of the graph runtime).
  // Used to restore UI state after imports when nodes may not be rendered yet.
  const pendingCollapsedByNodeId = new Map<string, boolean>();
  const forcedHiddenNodeIds = new Set<string>();

  const getNodeCollapsed = (nodeId: string): boolean =>
    Boolean(viewAdapter.getNodeVisualState(String(nodeId))?.collapsed);

  const flushPendingCollapsedNodes = async () => {
    if (pendingCollapsedByNodeId.size === 0) return;
    for (const [nodeId, collapsed] of Array.from(pendingCollapsedByNodeId.entries())) {
      if (!nodeMap.has(String(nodeId))) continue;
      pendingCollapsedByNodeId.delete(String(nodeId));
      await viewAdapter.setNodeVisualState(String(nodeId), { collapsed: Boolean(collapsed) });
    }
    requestFramesUpdate();
    minimapController?.requestUpdate();
  };

  const setNodeCollapsed = async (nodeId: string, collapsed: boolean) => {
    const id = String(nodeId ?? '');
    if (!id) return;
    pendingCollapsedByNodeId.set(id, Boolean(collapsed));
    await flushPendingCollapsedNodes();
  };

  // Invariant: NodeCanvas is composition-only. Keep behavior unchanged; delegate logic to modules.
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

  // UI helper: When a Group's gate input is wired (connection into group-gate.active), we treat it as "Gate mode"
  // and hide the "Gate: Open/Closed" badge (the wire + border state is enough).
  $: gateModeGroupIds = (() => {
    const nodes = Array.isArray(graphState.nodes) ? graphState.nodes : [];
    const connections = Array.isArray(graphState.connections) ? graphState.connections : [];

    const incomingTargetKeys = new Set<string>();
    for (const c of connections) {
      incomingTargetKeys.add(`${String(c.targetNodeId ?? '')}:${String(c.targetPortId ?? '')}`);
    }

    const result = new Set<string>();
    for (const node of nodes) {
      if (String(node.type ?? '') !== 'group-gate') continue;
      const nodeId = String(node.id ?? '');
      if (!nodeId) continue;
      if (!incomingTargetKeys.has(`${nodeId}:active`)) continue;
      const groupId = getString(asRecord(node.config).groupId, '');
      if (groupId) result.add(groupId);
    }

    return result;
  })();

  $: groupGateNodeIdByGroupId = (() => {
    const nodes = Array.isArray(graphState.nodes) ? graphState.nodes : [];
    const map = new Map<string, string>();

    for (const node of nodes) {
      if (String(node.type ?? '') !== 'group-gate') continue;
      const nodeId = String(node.id ?? '');
      if (!nodeId) continue;
      const groupId = getString(asRecord(node.config).groupId, '');
      if (!groupId) continue;
      if (!map.has(groupId)) map.set(groupId, nodeId);
    }

    return map;
  })();

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

  const syncSleepNodeSockets = (state: GraphState) => sleepNodeSockets.syncSleepNodeSockets(state);

  const resolveSleepOutputType = (nodeId: string) =>
    sleepNodeSockets.resolveSleepOutputType(nodeId);

  const applyClientNodeSelection = (nodeId: string, next: Record<string, unknown>) =>
    clientSelectionBinding.applyClientNodeSelection(nodeId, next);

  const syncClientNodesFromInputs = () => clientSelectionBinding.syncClientNodesFromInputs();

  const schedulePatchReconcile = (reason: string) => patchRuntime.scheduleReconcile(reason);

  const stopAllDeployedPatches = () => patchRuntime.stopAllDeployedPatches();

  const applyStoppedHighlights = (running: boolean) => patchRuntime.applyStoppedHighlights(running);

  const toggleExecutorLogs = () => patchRuntime.toggleExecutorLogs();

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

  let graphSync: GraphSyncController | null = null;

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
    addConnection: (conn) => nodeEngine.addConnection(conn),
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

  const toMiniX = (x: number) => {
    const m = get(minimap);
    return m.offsetX + (x - m.bounds.minX) * m.scale;
  };

  const toMiniY = (y: number) => {
    const m = get(minimap);
    return m.offsetY + (y - m.bounds.minY) * m.scale;
  };

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

  const setSelectedNode = (nextId: string) => {
    const prevId = selectedNodeId;
    if (prevId === nextId) return;

    selectedNodeId = nextId;
    if (nextId) selectedGroupId.set(null);

    if (prevId) {
      const prev = nodeMap.get(prevId);
      if (prev && prev.selected) {
        prev.selected = false;
        areaPlugin?.update?.('node', prevId);
      }
    }

    if (nextId) {
      const next = nodeMap.get(nextId);
      if (next && !next.selected) {
        next.selected = true;
        areaPlugin?.update?.('node', nextId);
      }
    }
  };

  const deleteNodeWithRules = (nodeId: string) => {
    const id = String(nodeId ?? '');
    if (!id) return;

    const node = nodeEngine.getNode(id);
    if (!node) return;

    const state = readCustomNodeState(asRecord(node.config));
    if (!state || state.role !== 'mother') {
      nodeEngine.removeNode(id);
      return;
    }

    const def = getCustomNodeDefinition(state.definitionId);
    const name = String(def?.name ?? 'Custom Node');

    const graph = nodeEngine.exportGraph();
    const coupledChildren = (graph.nodes ?? [])
      .map((n) => ({
        id: String(n.id ?? ''),
        state: readCustomNodeState(asRecord(n.config)),
      }))
      .filter((n) =>
        Boolean(
          n.id &&
          n.state &&
          String(n.state.definitionId) === state.definitionId &&
          n.state.role === 'child'
        )
      )
      .map((n) => String(n.id))
      .filter((cid: string) => cid !== id);

    const ok = confirm(
      `Delete mother "${name}"?\n\nThis will delete the Custom Node definition and ${coupledChildren.length} coupled child instance(s).`
    );
    if (!ok) return;

    for (const cid of coupledChildren) nodeEngine.removeNode(cid);
    nodeEngine.removeNode(id);
    removeCustomNodeDefinition(state.definitionId);

    if (selectedNodeId === id) setSelectedNode('');
  };

  type ExpandedCustomNodeFrame = {
    groupId: string;
    nodeId: string;
  };

  const expandedCustomByGroupId = new Map<string, ExpandedCustomNodeFrame>();
  let expandedCustomGroupIds: Set<string> = new Set();
  let customNodeExpansion: ReturnType<typeof createCustomNodeExpansion> | null = null;
  let customNodeActions: ReturnType<typeof createCustomNodeActions> | null = null;

  const customNodeHandlers = createCustomNodeHandlers({
    groupController,
    nodeEngine,
    expandedCustomByGroupId,
    readCustomNodeState,
    writeCustomNodeState,
    getCustomNodeDefinition,
    upsertCustomNodeDefinition,
    getCustomNodeActions: () => customNodeActions,
  });

  const refreshExpandedCustomGroupIds = () => {
    customNodeExpansion?.refreshExpandedCustomGroupIds();
  };

  const rehydrateExpandedCustomFrames = (state: GraphState) => {
    customNodeExpansion?.rehydrateExpandedCustomFrames(state);
  };

  const handleExpandCustomNode = (nodeId: string) => {
    customNodeExpansion?.handleExpandCustomNode(nodeId);
  };

  const handleCollapseCustomNodeFrame = (groupId: string) => {
    customNodeExpansion?.handleCollapseCustomNodeFrame(groupId);
  };


  const syncCoupledCustomNodesForDefinition = (definitionId: string) => {
    const id = String(definitionId ?? '');
    if (!id) return;

    const def = getCustomNodeDefinition(id);
    if (!def) return;

    const graph = nodeEngine.exportGraph();
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const connections = Array.isArray(graph.connections) ? graph.connections : [];

    const type = customNodeType(id);
    const instanceNodeIds = new Set<string>();
    for (const node of nodes) {
      if (String(node.type ?? '') !== type) continue;
      instanceNodeIds.add(String(node.id ?? ''));
    }

    const validPortIds = new Set<string>([
      'gate',
      ...(def.ports ?? []).map((p) => String(p?.portKey ?? '')).filter(Boolean),
    ]);

    for (const c of connections) {
      const connId = String(c.id ?? '');
      if (!connId) continue;

      const sourceNodeId = String(c.sourceNodeId ?? '');
      const sourcePortId = String(c.sourcePortId ?? '');
      const targetNodeId = String(c.targetNodeId ?? '');
      const targetPortId = String(c.targetPortId ?? '');

      const invalidSource = instanceNodeIds.has(sourceNodeId) && !validPortIds.has(sourcePortId);
      const invalidTarget = instanceNodeIds.has(targetNodeId) && !validPortIds.has(targetPortId);
      if (invalidSource || invalidTarget) nodeEngine.removeConnection(connId);
    }

    for (const nodeId of instanceNodeIds) {
      const node = nodeEngine.getNode(String(nodeId));
      if (!node) continue;
      const state = readCustomNodeState(asRecord(node.config));
      if (!state || state.role !== 'child') continue;

      const nextInternal = syncCustomNodeInternalGraph({
        current: state.internal,
        template: def.template,
        instanceGroupId: state.groupId,
      });

      nodeEngine.updateNodeConfig(
        nodeId,
        writeCustomNodeState(node.config ?? {}, { ...state, internal: nextInternal })
      );
    }

    // Also sync nested occurrences inside other Custom Node instances' internal graphs.
    for (const node of nodes) {
      const nodeId = String(node.id ?? '');
      if (!nodeId) continue;
      const instance = nodeEngine.getNode(nodeId);
      if (!instance) continue;
      const state = readCustomNodeState(asRecord(instance.config));
      if (!state) continue;

      const nested = syncNestedCustomNodesToDefinition({
        graph: state.internal,
        definitionId: id,
        definitionTemplate: def.template,
      });
      if (!nested.changed) continue;

      nodeEngine.updateNodeConfig(
        nodeId,
        writeCustomNodeState(instance.config ?? {}, { ...state, internal: nested.graph })
      );
    }
  };

  const {
    handleToggleGroupDisabled,
    handleRenameGroup,
    syncCustomGateInputs,
    handleNodalizeGroup,
    handleUncoupleCustomNode,
    handleDenodalizeGroup,
  } = customNodeHandlers;

  const generateId = () => `node-${crypto.randomUUID?.() ?? Date.now()}`;

  const groupPortNodesController = createGroupPortNodesController({
    nodeEngine,
    nodeRegistry,
    adapter: viewAdapter,
    groupController,
    getNodeCount: () => nodeCount,
    generateId,
  });

  customNodeActions = createCustomNodeActions({
    nodeEngine,
    nodeRegistry,
    groupController,
    groupPortNodesController,
    groupFrames,
    viewAdapter,
    buildGroupPortIndex,
    groupIdFromNode,
    customNodeType,
    addCustomNodeDefinition,
    removeCustomNodeDefinition,
    getCustomNodeDefinition,
    readCustomNodeState,
    writeCustomNodeState,
    expandedCustomByGroupId,
    forcedHiddenNodeIds,
    refreshExpandedCustomGroupIds,
    requestFramesUpdate,
    setSelectedNode,
  });


  customNodeExpansion = createCustomNodeExpansion({
    expandedCustomByGroupId,
    onExpandedGroupIdsChange: (next) => {
      expandedCustomGroupIds = next;
    },
    forcedHiddenNodeIds,
    nodeEngine,
    groupController,
    groupPortNodesController,
    groupFrames,
    nodeRegistry,
    requestFramesUpdate,
    readCustomNodeState,
    writeCustomNodeState,
    getCustomNodeDefinition,
    upsertCustomNodeDefinition,
    customNodeDefinitions,
    definitionsInCycles,
    buildGroupPortIndex,
    groupIdFromNode,
    isGroupPortNodeType,
    deepestGroupIdContainingNode,
    syncCoupledCustomNodesForDefinition,
    materializeInternalNodeId,
    isMaterializedInternalNodeId,
    internalNodeIdFromMaterialized,
    customNodeIdFromMaterializedNodeId,
  });
  expandedCustomGroupIds = customNodeExpansion.getExpandedGroupIds();


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

  function addNode(
    type: string,
    position?: { x: number; y: number },
    configPatch?: Record<string, unknown>
  ) {
    const fallback = { x: 120 + nodeCount * 10, y: 120 + nodeCount * 6 };

    if (String(type).startsWith(CUSTOM_NODE_TYPE_PREFIX)) {
      const definitionId = String(type).slice(CUSTOM_NODE_TYPE_PREFIX.length);
      const def = getCustomNodeDefinition(definitionId);
      if (!def) return;

      // Prevent cyclic nesting when creating custom nodes inside an expanded mother definition.
      if (position) {
        const frames = get(groupFrames) ?? [];
        let host: { groupId: string; nodeId: string } | null = null;
        let bestDepth = -1;
        for (const frame of frames) {
          const gid = String(frame?.group?.id ?? '');
          if (!gid) continue;
          const expanded = expandedCustomByGroupId.get(gid) ?? null;
          if (!expanded) continue;

          const left = Number(frame.left ?? 0);
          const top = Number(frame.top ?? 0);
          const width = Number(frame.width ?? 0);
          const height = Number(frame.height ?? 0);
          const right = left + width;
          const bottom = top + height;
          if (position.x < left || position.x > right || position.y < top || position.y > bottom)
            continue;

          const depth = Number(frame.depth ?? 0) || 0;
          if (depth <= bestDepth) continue;
          bestDepth = depth;
          host = { groupId: gid, nodeId: expanded.nodeId };
        }

        if (host) {
          const hostNode = nodeEngine.getNode(String(host.nodeId));
          const hostState = hostNode ? readCustomNodeState(asRecord(hostNode.config)) : null;
          if (hostState) {
            const defs = get(customNodeDefinitions) ?? [];
            if (wouldCreateCycle(defs, hostState.definitionId, definitionId)) {
              nodeEngine.lastError?.set?.('Cyclic custom node nesting is not allowed.');
              return;
            }
          }
        }
      }

      const groupId = generateCustomNodeGroupId();
      const internal = cloneInternalGraphForNewInstance(def.template, groupId);
      const state = {
        definitionId,
        groupId,
        role: 'child',
        manualGate: true,
        internal,
      };

      const newNode: NodeInstance = {
        id: generateId(),
        type,
        position: position ?? fallback,
        config: writeCustomNodeState({ ...(configPatch ?? {}) }, state),
        inputValues: {},
        outputValues: {},
      };
      nodeEngine.addNode(newNode);
      return newNode.id;
    }

    const def = nodeRegistry.get(type);
    if (!def) return;
    const config: Record<string, unknown> = {};
    for (const field of def.configSchema) {
      config[field.key] = field.defaultValue;
    }
    const newNode: NodeInstance = {
      id: generateId(),
      type,
      position: position ?? fallback,
      config: { ...config, ...(configPatch ?? {}) },
      inputValues: {},
      outputValues: {},
    };
    nodeEngine.addNode(newNode);
    return newNode.id;
  }

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

  const handleToggleEngine = () => {
    if (get(isRunningStore)) {
      nodeEngine.stop();
      loopController?.loopActions.stopAllClientEffects();
      loopController?.loopActions.stopAllDeployedLoops();
      stopAllDeployedPatches();
    } else {
      nodeEngine.start();
      schedulePatchReconcile('engine-start');
    }
  };

  const handleClear = () => {
    if (confirm('Clear all nodes?')) {
      nodeEngine.clear();
      resetGroups();
    }
  };

  function resetGroups() {
    groupController.nodeGroups.set([]);
    groupController.groupFrames.set([]);
    groupController.groupDisabledNodeIds.set(new Set());
    groupController.editModeGroupId.set(null);
    groupController.groupEditToast.set(null);
    groupController.clearSelection();
    groupController.scheduleHighlight();
  }

  const viewportCenterGraphPos = (): { x: number; y: number } => {
    if (!container) return { x: 120 + nodeCount * 10, y: 120 + nodeCount * 6 };
    const rect = container.getBoundingClientRect();
    return computeGraphPosition(rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const downloadJson = (payload: unknown, filename: string) => {
    if (typeof document === 'undefined') return;
    const data = JSON.stringify(payload, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sanitizeFileName = (name: string) => {
    const raw = String(name ?? '').trim() || 'custom-node';
    return raw
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .slice(0, 80);
  };

  const fileActions = createFileActions({
    nodeEngine,
    getNodePosition: (nodeId) => viewAdapter.getNodePosition(String(nodeId)),
    getNodeCollapsed,
    setNodeCollapsed,
    getImportGraphInput: () => importGraphInputEl,
    getImportTemplatesInput: () => importTemplatesInputEl,
    getNodeGroups: () => get(groupController.nodeGroups),
    appendNodeGroups: (groups) => groupController.appendGroups(groups),
    onSelectNodeIds: (nodeIds) => {
      const ids = (nodeIds ?? []).map((id) => String(id)).filter(Boolean);
      if (ids.length === 0) return;
      groupController.clearSelection();
      setSelectedNode('');
      groupController.groupSelectionNodeIds.set(new Set(ids));
      groupController.scheduleHighlight();
      requestFramesUpdate();
      minimapController?.requestUpdate();
      focusController.setPendingFocusNodeIds(ids);
    },
    getViewportCenterGraphPos: viewportCenterGraphPos,
  });

  const exportCustomNode = () => {
    if (!selectedNodeId) {
      nodeEngine.lastError?.set?.('Select a Custom Node mother instance to export.');
      return;
    }
    const node = nodeEngine.getNode(String(selectedNodeId));
    const state = node ? readCustomNodeState(asRecord(node.config)) : null;
    if (!state || state.role !== 'mother') {
      nodeEngine.lastError?.set?.('Only a Custom Node mother instance can be exported.');
      return;
    }

    const def = getCustomNodeDefinition(state.definitionId);
    if (!def) {
      nodeEngine.lastError?.set?.('Missing Custom Node definition.');
      return;
    }

    const file = buildCustomNodeFile(get(customNodeDefinitions) ?? [], state.definitionId);
    downloadJson(file, `${sanitizeFileName(def.name)}.shugu-node.json`);
  };

  const importCustomNode = () => {
    importCustomNodeInputEl?.click?.();
  };

  const cloneInternalGraphForMotherInstance = (graph: GraphState, groupId: string): GraphState => {
    const gid = String(groupId ?? '');
    const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
    const connections = Array.isArray(graph?.connections) ? graph.connections : [];
    return {
      nodes: nodes.map((node) => {
        let config = { ...(node.config ?? {}) };
        const inputValues = { ...(node.inputValues ?? {}) };
        if (gid && (node.type === 'group-proxy' || node.type === 'group-gate')) {
          config = { ...config, groupId: gid };
        }
        return { ...node, config, inputValues, outputValues: {} };
      }),
      connections: connections.map((c) => ({ ...c })),
    };
  };

  const handleImportCustomNodeChange = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      alert('Invalid JSON file.');
      return;
    }

    const parsedFile = parseCustomNodeFile(parsed);
    if (!parsedFile) {
      alert('Unsupported Custom Node file format.');
      return;
    }

    const ok = confirm('Import Custom Node definitions from file?');
    if (!ok) return;

    try {
      const importedDefs = parsedFile.definitions ?? [];
      const remapped = remapImportedDefinitions(importedDefs);

      const inCycleImported = definitionsInCycles(remapped.definitions);
      if (inCycleImported.size > 0) {
        const ids = Array.from(inCycleImported).map(String).filter(Boolean);
        alert(`Import rejected: cyclic Custom Node nesting detected.\n\n${ids.join(' → ')}`);
        return;
      }

      const existing = get(customNodeDefinitions) ?? [];
      const merged = [...existing, ...remapped.definitions];
      const inCycleMerged = definitionsInCycles(merged);
      if (inCycleMerged.size > 0) {
        const ids = Array.from(inCycleMerged).map(String).filter(Boolean);
        alert(`Import rejected: would introduce cyclic nesting.\n\n${ids.join(' → ')}`);
        return;
      }

      for (const def of remapped.definitions) {
        addCustomNodeDefinition(def);
      }

      const rootOld = String(parsedFile.rootDefinitionId ?? '');
      const rootId = remapped.idMap.get(rootOld) ?? '';
      const rootDef = rootId
        ? remapped.definitions.find((d) => String(d.definitionId) === rootId)
        : null;
      if (!rootDef) {
        nodeEngine.lastError?.set?.('Import failed: missing remapped root definition.');
        return;
      }

      // Determine which imported definitions already have a nested mother instance in any template.
      const nestedMothers = new Set<string>();
      for (const def of remapped.definitions) {
        const nodes = Array.isArray(def.template?.nodes) ? def.template.nodes : [];
        for (const node of nodes) {
          const st = readCustomNodeState(asRecord(node.config));
          if (st && st.role === 'mother') nestedMothers.add(String(st.definitionId));
        }
      }

      // Ensure each imported definition has exactly one mother instance somewhere.
      // Always materialize a mother for the root definition on the main graph.
      const toCreate = new Set<string>();
      toCreate.add(String(rootDef.definitionId));
      for (const def of remapped.definitions) {
        const did = String(def.definitionId ?? '');
        if (!did) continue;
        if (nestedMothers.has(did)) continue;
        toCreate.add(did);
      }

      const center = viewportCenterGraphPos();
      const defsToCreate = remapped.definitions.filter((d) => toCreate.has(String(d.definitionId)));
      defsToCreate.sort((a, b) => {
        if (String(a.definitionId) === String(rootDef.definitionId)) return -1;
        if (String(b.definitionId) === String(rootDef.definitionId)) return 1;
        return String(a.name ?? '').localeCompare(String(b.name ?? ''));
      });

      const createdNodeIds: string[] = [];
      const spacingX = 260;
      const spacingY = 180;
      let col = 0;
      let row = 0;
      for (const def of defsToCreate) {
        const did = String(def.definitionId ?? '');
        if (!did) continue;

        const groupId = generateCustomNodeGroupId();
        const internal = cloneInternalGraphForMotherInstance(def.template, groupId);
        const nodeId = generateId();
        const pos = {
          x: center.x + col * spacingX,
          y: center.y + row * spacingY,
        };
        col += 1;
        if (col >= 3) {
          col = 0;
          row += 1;
        }

        nodeEngine.addNode({
          id: nodeId,
          type: customNodeType(did),
          position: pos,
          config: writeCustomNodeState({}, {
            definitionId: did,
            groupId,
            role: 'mother',
            manualGate: true,
            internal,
          }),
          inputValues: {},
          outputValues: {},
        });
        createdNodeIds.push(nodeId);
      }

      if (createdNodeIds.length > 0) {
        groupController.clearSelection();
        setSelectedNode('');
        groupController.groupSelectionNodeIds.set(new Set(createdNodeIds));
        groupController.scheduleHighlight();
        requestFramesUpdate();
        minimapController?.requestUpdate();
        focusController.setPendingFocusNodeIds(createdNodeIds);
      }
    } catch (err) {
      console.error('[CustomNodeImport] failed', err);
      alert('Custom Node import failed. See console for details.');
    }
  };

  const closeToolbarMenu = () => {
    isToolbarMenuOpen = false;
  };

  const toggleToolbarMenu = () => {
    isToolbarMenuOpen = !isToolbarMenuOpen;
  };

  const handleToolbarMenuPick = (action: () => void) => {
    closeToolbarMenu();
    action();
  };

  $: if (selectedNodeId && !graphState.nodes.some((n) => n.id === selectedNodeId)) {
    setSelectedNode('');
  }

  const groupSnapshotKey = (groups: NodeGroup[]): string => {
    const sorted = Array.isArray(groups)
      ? [...groups].sort((a, b) => String(a.id ?? '').localeCompare(String(b.id ?? '')))
      : [];
    return sorted
      .map((g) => {
        const nodeIds = Array.isArray(g.nodeIds)
          ? Array.from(new Set(g.nodeIds.map((id) => String(id)).filter(Boolean)))
              .sort()
              .join(',')
          : '';
        const runtimeActive =
          typeof g.runtimeActive === 'boolean' ? (g.runtimeActive ? '1' : '0') : '';
        return [
          String(g.id ?? ''),
          String(g.parentId ?? ''),
          String(g.name ?? ''),
          g.disabled ? '1' : '0',
          g.minimized ? '1' : '0',
          runtimeActive,
          nodeIds,
        ].join(':');
      })
      .join('|');
  };

  const normalizeGroupsForSnapshot = (
    groups: Array<Record<string, unknown>> | null | undefined
  ): NodeGroup[] =>
    (Array.isArray(groups) ? groups : []).map((g) => {
      const record = asRecord(g);
      const nodeIds = Array.isArray(record.nodeIds) ? record.nodeIds : [];
      return {
        id: getString(record.id, ''),
        parentId: getString(record.parentId, '') || null,
        name: getString(record.name, ''),
        nodeIds: Array.from(new Set(nodeIds.map((id) => String(id)).filter(Boolean))),
        disabled: getBoolean(record.disabled, false),
        minimized: getBoolean(record.minimized, false),
        runtimeActive:
          typeof record.runtimeActive === 'boolean' ? Boolean(record.runtimeActive) : undefined,
      };
    });

  onMount(async () => {
    if (!container) return;

    if (import.meta.env.DEV && typeof window !== 'undefined') {
      const windowWithEngine = window as Window & { __shuguNodeEngine?: typeof nodeEngine };
      windowWithEngine.__shuguNodeEngine = nodeEngine;
    }

    midiController.start();

    refreshNumberParams();
    paramsUnsub = parameterRegistry.subscribe(() => refreshNumberParams());

    tickUnsub = nodeEngine.tickTime.subscribe(() => {
      groupPortNodesController.updateRuntimeActives();
      patchRuntime.onTick();
    });

    runningUnsub = isRunningStore.subscribe((running) => {
      patchRuntime.onRunningChanged(Boolean(running));
      if (!running) {
        loopController?.loopActions.stopAllClientEffects();
        loopController?.loopActions.stopAllDeployedLoops();
      }
    });

    loopDeployUnsub = deployedLoopIds.subscribe(() => {
      patchRuntime.onLoopDeployListChanged();
    });

    groupDisabledUnsub = groupController.groupDisabledNodeIds.subscribe((disabled) => {
      patchRuntime.onGroupDisabledChanged(disabled);
    });

    // Restore persisted groups (and keep them synced) so refresh doesn't lose Group frames.
    groupUiStateUnsub?.();
    groupUiStateUnsub = nodeGroupsState.subscribe((groups) => {
      if (syncingGroupsToProject) return;
      const nextKey = groupSnapshotKey(groups ?? []);
      if (nextKey === lastGroupsKeyFromProject || nextKey === lastGroupsKeyFromCanvas) return;
      lastGroupsKeyFromProject = nextKey;

      syncingGroupsFromProject = true;
      groupController.setGroups(
        normalizeGroupsForSnapshot(groups as Array<Record<string, unknown>>)
      );
      syncingGroupsFromProject = false;
    });

    editor = new NodeEditor('fluffy-rete');
    areaPlugin = new AreaPlugin(container);
    const connection = new ConnectionPlugin();
    const render = new SveltePlugin();
    const history = new HistoryPlugin();

    areaPlugin?.area?.setZoomHandler?.(null);

    editor.use(areaPlugin);
    areaPlugin.use(connection);
    areaPlugin.use(render);
    areaPlugin.use(history);

    connection.addPreset(ConnectionPresets.classic.setup());
    connection.addPipe((ctx: { type?: string; data?: unknown }) => {
      const ctxData = asRecord(ctx.data);
      if (ctx?.type === 'connectionpick') {
        const sock = asRecord(ctxData.socket);
        const nodeId = getString(sock.nodeId, '');
        const sideRaw = getString(sock.side, '');
        const key = getString(sock.key, '');
        if (nodeId && key && (sideRaw === 'input' || sideRaw === 'output')) {
          connectDraggingSocket = {
            nodeId,
            side: sideRaw,
            key,
          };
          const edge = groupEdgeFinder.findGroupProxyEdgeTargetAt(
            lastPointerClient.x,
            lastPointerClient.y
          );
          groupEdgeHighlight = edge ? { groupId: edge.groupId, side: edge.side } : null;
        }
      }
      if (ctx?.type === 'connectiondrop') {
        connectDraggingSocket = null;
        groupEdgeHighlight = null;

        const initial = asRecord(ctxData.initial);
        const socket = asRecord(ctxData.socket);
        const created = Boolean(ctxData.created);
        const initialNodeId = getString(initial.nodeId, '');
        const initialSide = getString(initial.side, '');
        const initialKey = getString(initial.key, '');
        const socketProvided = Object.keys(socket).length > 0;
        if (
          initialNodeId &&
          initialKey &&
          (initialSide === 'input' || initialSide === 'output') &&
          !socketProvided &&
          !created
        ) {
          const initialSocket: SocketData = {
            nodeId: initialNodeId,
            side: initialSide,
            key: initialKey,
          };

          const gateTarget = groupEdgeFinder.findGroupGateTargetAt(
            lastPointerClient.x,
            lastPointerClient.y
          );
          if (gateTarget && initialSocket.side === 'output') {
            const group =
              get(groupController.nodeGroups).find((g) => String(g.id) === gateTarget.groupId) ??
              null;
            if (group && (group.nodeIds ?? []).some((id) => String(id) === initialSocket.nodeId)) {
              nodeEngine.lastError.set('Group gate input cannot originate from inside the group.');
              return ctx;
            }

            const state = nodeEngine.exportGraph();
            const gateNodeId =
              state.nodes.find(
                (n) =>
                  String(n.type) === 'group-gate' &&
                  getString(asRecord(n.config).groupId, '') === gateTarget.groupId
              )?.id ?? '';
            if (gateNodeId) {
              const connId = `conn-${crypto.randomUUID?.() ?? Date.now()}`;
              nodeEngine.addConnection({
                id: connId,
                sourceNodeId: initialSocket.nodeId,
                sourcePortId: initialSocket.key,
                targetNodeId: String(gateNodeId),
                targetPortId: 'active',
              });
              groupPortNodesController.scheduleNormalizeProxies();
              return ctx;
            }
          }

          const edgeTarget = groupEdgeFinder.findGroupProxyEdgeTargetAt(
            lastPointerClient.x,
            lastPointerClient.y
          );
          if (edgeTarget) {
            const validTypes = new Set([
              'number',
              'boolean',
              'string',
              'asset',
              'color',
              'audio',
              'image',
              'video',
              'scene',
              'effect',
              'client',
              'command',
              'fuzzy',
              'array',
              'any',
            ]);
            const resolveTypeForSocket = (sock: SocketData) => {
              const node = nodeEngine.getNode(String(sock.nodeId));
              if (!node) return 'any';
              if (node.type === 'group-proxy') {
                const raw = getString(asRecord(node.config).portType, '');
                const t = raw ? raw : '';
                return validTypes.has(t) ? t : 'any';
              }
              const def = nodeRegistry.get(String(node.type ?? ''));
              const ports = sock.side === 'input' ? def?.inputs : def?.outputs;
              const port = (ports ?? []).find((p) => String(p.id) === String(sock.key));
              const t = String(port?.type ?? 'any');
              return validTypes.has(t) ? t : 'any';
            };

            const frame = edgeTarget.frame;
            const groupId = edgeTarget.groupId;
            const direction = edgeTarget.side === 'input' ? 'input' : 'output';
            const graphPos = computeGraphPosition(lastPointerClient.x, lastPointerClient.y);
            const left = Number(frame.left ?? 0);
            const top = Number(frame.top ?? 0);
            const width = Number(frame.width ?? 0);
            const height = Number(frame.height ?? 0);
            const right = left + width;
            const bottom = top + height;

            const clampY = (y: number) => {
              const isMinimized = Boolean(frame.group?.minimized);
              const topPad = isMinimized ? 44 + 6 + 28 / 2 : 56;
              const bottomPad = isMinimized ? 6 + 28 / 2 : 56;
              const minY = top + topPad;
              const maxY = bottom - bottomPad;
              if (!Number.isFinite(y)) return top + height / 2;
              if (!Number.isFinite(minY) || !Number.isFinite(maxY) || maxY <= minY)
                return top + height / 2;
              return Math.max(minY, Math.min(maxY, y));
            };

            const proxyWidth = 48;
            const proxyOutset = 10;
            const proxyEdgeNudge = 12;
            const isMinimized = Boolean(frame.group?.minimized);
            const x = isMinimized
              ? direction === 'input'
                ? left - proxyOutset
                : right + proxyOutset - proxyWidth
              : direction === 'input'
                ? left - proxyWidth / 2 - proxyEdgeNudge
                : right - proxyWidth / 2 + proxyEdgeNudge;
            const y = clampY(graphPos.y);
            const portType = resolveTypeForSocket(initialSocket);

            const proxyId = addNode(
              'group-proxy',
              { x, y: y - 10 },
              { groupId, direction, portType, pinned: true }
            );
            if (proxyId) {
              const connId = `conn-${crypto.randomUUID?.() ?? Date.now()}`;
              const conn: EngineConnection =
                initialSocket.side === 'output'
                  ? {
                      id: connId,
                      sourceNodeId: initialSocket.nodeId,
                      sourcePortId: initialSocket.key,
                      targetNodeId: proxyId,
                      targetPortId: 'in',
                    }
                  : {
                      id: connId,
                      sourceNodeId: proxyId,
                      sourcePortId: 'out',
                      targetNodeId: initialSocket.nodeId,
                      targetPortId: initialSocket.key,
                    };
              nodeEngine.addConnection(conn);
              groupPortNodesController.scheduleAlign();
              groupPortNodesController.scheduleNormalizeProxies();
              return ctx;
            }
          }

          const desiredSide = initialSocket.side === 'output' ? 'input' : 'output';
          const snapped = findPortRowSocketAt(
            lastPointerClient.x,
            lastPointerClient.y,
            desiredSide
          );
          if (snapped) {
            const connId = `conn-${crypto.randomUUID?.() ?? Date.now()}`;
            const engineConn: EngineConnection =
              initialSocket.side === 'output'
                ? {
                    id: connId,
                    sourceNodeId: initialSocket.nodeId,
                    sourcePortId: initialSocket.key,
                    targetNodeId: snapped.nodeId,
                    targetPortId: snapped.key,
                  }
                : {
                    id: connId,
                    sourceNodeId: snapped.nodeId,
                    sourcePortId: snapped.key,
                    targetNodeId: initialSocket.nodeId,
                    targetPortId: initialSocket.key,
                  };
            nodeEngine.addConnection(engineConn);
            groupPortNodesController.scheduleNormalizeProxies();
          } else {
            openConnectPicker(initialSocket);
          }
        }
      }
      return ctx;
    });

    socketPositionWatcher = setupReteRenderPreset({
      render,
      requestFramesUpdate,
      socketPositionWatcher,
      createSocketPositionWatcher: () => new LiveDOMSocketPosition(requestFramesUpdate),
      renderers: reteRenderers,
    });

    graphSync = createGraphSync({
      editor,
      areaPlugin,
      nodeMap,
      connectionMap,
      nodeRegistry,
      socketFor: reteBuilder.socketFor,
      buildReteNode: reteBuilder.buildReteNode,
      nodeLabel: reteBuilder.nodeLabel,
      applyMidiMapRangeConstraints: reteBuilder.applyMidiMapRangeConstraints,
      setGraphState: (state) => (graphState = state),
      setNodeCount: (count) => (nodeCount = count),
      getSelectedNodeId: () => selectedNodeId,
      onAfterSync: () => {
        void syncSleepNodeSockets(graphState);
        void flushPendingCollapsedNodes();
        minimapController.requestUpdate();
        requestFramesUpdate();
        void loopController?.applyHighlights();
        void groupController.applyHighlights();
        void midiController.applyHighlights();
        void applyStoppedHighlights(get(isRunningStore));
        syncPatchVisualState();

        focusController.flushPendingFocus();

        syncClientNodesFromInputs();
      },
      isSyncingRef,
    });

    await graphSync.schedule(get(graphStateStore));
    graphUnsub = graphStateStore?.subscribe((state) => {
      if ((state.nodes ?? []).some((n) => String(n.type).startsWith('midi-'))) {
        void midiService.init();
      }

      const nextNodeCount = state.nodes?.length ?? 0;
      const prevNodeCount = lastGraphNodeCount;
      lastGraphNodeCount = nextNodeCount;

      const nextConnKey = (state.connections ?? []).map((c) => String(c.id)).join('|');
      const connectionsChanged = nextConnKey !== lastGraphConnKey;
      lastGraphConnKey = nextConnKey;

      // Only reconcile on node removal to avoid interfering with imports (nodes are added one-by-one).
      if (prevNodeCount >= 0 && nextNodeCount < prevNodeCount) {
        const removedGroupIds = groupController.reconcileGraphNodes(state);
        if (removedGroupIds.length > 0) {
          // Removing group ports triggers another graphState update; skip syncing this stale snapshot.
          const removedPorts =
            groupPortNodesController.removeGroupPortNodesForGroupIds(removedGroupIds);
          if (removedPorts > 0) return;
        }
      }

      graphSync?.schedule(state);
      syncCustomGateInputs(state);
      if (connectionsChanged) groupPortNodesController.scheduleNormalizeProxies();
      patchRuntime.onGraphStateChanged();
      rehydrateExpandedCustomFrames(state);
    });

    groupNodesUnsub = groupController.nodeGroups.subscribe((groups) => {
      const nextKey = groupSnapshotKey(groups ?? []);
      lastGroupsKeyFromCanvas = nextKey;
      if (!syncingGroupsFromProject && nextKey !== lastGroupsKeyFromProject) {
        syncingGroupsToProject = true;
        nodeGroupsState.set(normalizeGroupsForSnapshot(groups as Array<Record<string, unknown>>));
        syncingGroupsToProject = false;
      }
      groupPortNodesController.ensureGroupPortNodes();
      groupPortNodesController.scheduleAlign();
      groupPortNodesController.scheduleNormalizeProxies();
    });

    groupFramesUnsub = groupFrames.subscribe(() => {
      groupPortNodesController.scheduleAlign();
    });

    let lastClientKey = '';
    managerUnsub = managerState.subscribe(($state) => {
      const clients = Array.isArray($state.clients) ? $state.clients : [];
      const clientsWithGroups = clients
        .map((client) => {
          const record = asRecord(client);
          return {
            connected: getBoolean(record.connected, true),
            id: getString(record.clientId, ''),
            group: getString(record.group, ''),
          };
        })
        .filter((c) => c.connected)
        .map(({ id, group }) => ({ id, group }))
        .filter((c) => Boolean(c.id));

      const audience = clientsWithGroups
        .filter((c) => String(c.group) !== 'display')
        .map((c) => String(c.id));

      const displayIdSet = new Set(
        clientsWithGroups
          .filter((c) => String(c.group) === 'display')
          .map((c) => String(c.id))
      );

      const nextClientKey = clientsWithGroups.map((c) => `${c.id}:${c.group}`).join('|');
      if (nextClientKey === lastClientKey) return;
      lastClientKey = nextClientKey;

      schedulePatchReconcile('manager-state');
      // Client node titles depend on online client count; refresh labels when client list changes.
      void graphSync?.schedule(get(graphStateStore));

      const engineState = get(graphStateStore);
      // If a project ever ended up with a Display clientId inside a Client node, clear it.
      if (displayIdSet.size > 0) {
        for (const node of engineState.nodes ?? []) {
          if (String(node.type) !== 'client-object') continue;
          const nodeId = String(node.id);
          const nodeInstance = nodeEngine.getNode(nodeId);
          const configuredClientId = getString(asRecord(nodeInstance?.config).clientId, '');
          if (configuredClientId && displayIdSet.has(configuredClientId)) {
            nodeEngine.updateNodeConfig(nodeId, { clientId: '' });
            if (nodeInstance?.outputValues) {
              nodeInstance.outputValues.out = { clientId: '', sensors: null };
              nodeEngine.tickTime.set(Date.now());
            }
          }
        }
      }

      if (audience.length === 0) {
        return;
      }

      syncClientNodesFromInputs();
    });

    // Patch targets can include local display (MessagePort), which is outside `managerState.clients`.
    // Reconcile patch deployment when the Display bridge connects/disconnects.
    let lastDisplayBridgeKey = '';
    displayBridgeUnsub = displayBridgeState.subscribe((s) => {
      const nextKey = `${s.status}|${s.ready ? 1 : 0}`;
      if (nextKey === lastDisplayBridgeKey) return;
      lastDisplayBridgeKey = nextKey;
      schedulePatchReconcile('display-bridge');
    });

    bindRetePipes({
      editor,
      areaPlugin,
      nodeEngine,
      nodeMap,
      connectionMap,
      isSyncing: () => isSyncingRef.value,
      setSelectedNode,
      groupSelectionNodeIds: groupController.groupSelectionNodeIds,
      isProgrammaticTranslate: groupController.isProgrammaticTranslate,
      handleDroppedNodesAfterDrag: groupController.handleDroppedNodesAfterDrag,
      requestFramesUpdate,
      requestMinimapUpdate: minimapController.requestUpdate,
    });

    const groupEvents = bindGroupFrameEvents({
      groupController,
      windowRef: window,
    });
    groupFrameToggleHandler = groupEvents.onGroupFrameToggle;
    groupFrameDisabledHandler = groupEvents.onGroupFrameToggleDisabled;

    const customNodeEvents = bindCustomNodeEvents({
      onUncouple: handleUncoupleCustomNode,
      onExpand: handleExpandCustomNode,
      windowRef: window,
    });
    customNodeUncoupleHandler = customNodeEvents.onCustomNodeUncouple;
    customNodeExpandHandler = customNodeEvents.onCustomNodeExpand;

    registerGroupFrameTranslatePipe({
      areaPlugin,
      nodeEngine,
      groupController,
      isSyncing: () => isSyncingRef.value,
      groupPortNodesController,
      requestFramesUpdate,
      requestMinimapUpdate: minimapController.requestUpdate,
    });

    if (areaPlugin) {
      await AreaExtensions.zoomAt(areaPlugin, Array.from(nodeMap.values()));
      minimapController.requestUpdate();
      requestFramesUpdate();
    }

    const onWheel = (event: WheelEvent) => {
      const target = event.target as HTMLElement | null;
      if (!container) return;
      const bounds = container.getBoundingClientRect();
      const hasBounds = bounds.width > 0 && bounds.height > 0;
      const within =
        hasBounds &&
        event.clientX >= bounds.left &&
        event.clientX <= bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY <= bounds.bottom;

      if (event.ctrlKey) {
        event.preventDefault();
        event.stopPropagation();
        if (!hasBounds) return;
      } else if (!within) {
        return;
      }

      if (target?.closest?.('.node-picker')) return;
      if (target?.closest?.('.minimap')) return;
      const tag = target?.tagName?.toLowerCase?.() ?? '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      const area = areaPlugin?.area;
      if (!area) return;
      normalizeAreaTransform(area);

      const current = Number(area.transform?.k ?? 1) || 1;
      let deltaY = event.deltaY;
      if (event.deltaMode === 1) deltaY *= 16;
      if (event.deltaMode === 2) deltaY *= container.clientHeight || 1;
      if (!deltaY) return;

      const abs = Math.abs(deltaY);
      const isFine = abs < 10;
      const speed = event.ctrlKey ? 0.02 : isFine ? 0.012 : 0.0022;
      const zoomFactor = Math.exp(-deltaY * speed);

      const minZoom = 0.2;
      const maxZoom = 2.5;
      const next = Math.max(minZoom, Math.min(maxZoom, current * zoomFactor));
      const ratio = next / current - 1;
      if (ratio === 0) return;

      const rectEl: HTMLElement | null = area?.content?.holder ?? container;
      const rect = rectEl?.getBoundingClientRect?.();
      if (!rect) return;

      if (!event.ctrlKey) {
        event.preventDefault();
        event.stopPropagation();
      }

      const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
      const clientX = within ? event.clientX : clamp(event.clientX, bounds.left, bounds.right);
      const clientY = within ? event.clientY : clamp(event.clientY, bounds.top, bounds.bottom);

      const ox = (rect.left - clientX) * ratio;
      const oy = (rect.top - clientY) * ratio;
      void area.zoom(next, ox, oy, 'wheel');
      minimapController.requestUpdate();
      requestFramesUpdate();
    };

    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    wheelHandler = onWheel;

    const onContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('.node-picker')) return;
      if (target?.closest?.('.minimap')) return;

      const tag = target?.tagName?.toLowerCase?.() ?? '';
      const isEditing =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        Boolean(target?.isContentEditable);
      if (isEditing) return;

      event.preventDefault();
      event.stopPropagation();
      openPicker({ clientX: event.clientX, clientY: event.clientY, mode: 'add' });
    };
    container.addEventListener('contextmenu', onContextMenu, { capture: true });
    contextMenuHandler = onContextMenu;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest?.('.group-frame-header')) selectedGroupId.set(null);

      // Feature: Group proxy ports can be dragged along the group edge (vertical only).
      if (event.button === 0 && !event.altKey && proxyDragPointerId === null) {
        const nodeEl = (target?.closest?.('.node') as HTMLElement | null) ?? null;
        const nodeId = String(nodeEl?.dataset?.reteNodeId ?? '');
        const isOnSocket = Boolean(target?.closest?.('.socket'));
        const isEditing =
          Boolean(target?.closest?.('input, textarea, select, button')) ||
          Boolean(target?.isContentEditable) ||
          Boolean(target?.closest?.('.port-control')) ||
          Boolean(target?.closest?.('.cmd-aggregator-controls'));

        if (nodeEl && nodeId && !isOnSocket && !isEditing) {
          const node = nodeEngine.getNode(nodeId);
          if (node?.type === 'group-proxy') {
            const groupId = getString(asRecord(node.config).groupId, '');
            if (!groupId) return;

            const frames = get(groupFrames) ?? [];
            const frame = frames.find((f) => String(f.group?.id ?? '') === groupId) ?? null;
            if (!frame) return;

            const direction =
              getString(asRecord(node.config).direction, 'output') === 'input' ? 'input' : 'output';
            const proxyWidth = 48;
            const proxyHalfHeight = 10;
            const proxyOutset = 10;
            const proxyEdgeNudge = 12;

            const left = Number(frame.left ?? 0);
            const top = Number(frame.top ?? 0);
            const width = Number(frame.width ?? 0);
            const height = Number(frame.height ?? 0);

            const isMinimized = Boolean(frame.group?.minimized);

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

            // Prevent the default Rete drag so the proxy stays constrained to its edge.
            event.preventDefault();
            event.stopPropagation();

            const startGraph = computeGraphPosition(event.clientX, event.clientY);
            const startPos =
              viewAdapter.getNodePosition(nodeId) ??
              ({
                x: Number(node.position?.x ?? 0),
                y: Number(node.position?.y ?? 0),
              } as const);

            const dragOffsetY = startGraph.y - startPos.y;

            const cleanup = () => {
              if (proxyDragMoveHandler) {
                window.removeEventListener('pointermove', proxyDragMoveHandler, {
                  capture: true,
                });
              }
              if (proxyDragUpHandler) {
                window.removeEventListener('pointerup', proxyDragUpHandler, {
                  capture: true,
                });
                window.removeEventListener('pointercancel', proxyDragUpHandler, {
                  capture: true,
                });
              }
              proxyDragPointerId = null;
              proxyDragMoveHandler = null;
              proxyDragUpHandler = null;
            };

            const onMove = (moveEvent: PointerEvent) => {
              if (proxyDragPointerId === null) return;
              if (moveEvent.pointerId !== proxyDragPointerId) return;

              const graphPos = computeGraphPosition(moveEvent.clientX, moveEvent.clientY);
              const desiredTopLeftY = graphPos.y - dragOffsetY;
              const desiredCenterY = desiredTopLeftY + proxyHalfHeight;
              const clampedCenterY = clampCenterY(desiredCenterY);
              const topLeftY = clampedCenterY - proxyHalfHeight;
              viewAdapter.setNodePosition(nodeId, fixedX, topLeftY);

              moveEvent.preventDefault();
              moveEvent.stopPropagation();
            };

            const onUp = (upEvent: PointerEvent) => {
              if (proxyDragPointerId === null) return;
              if (upEvent.pointerId !== proxyDragPointerId) return;

              cleanup();

              const pos = viewAdapter.getNodePosition(nodeId);
              if (pos) nodeEngine.updateNodePosition(nodeId, { x: pos.x, y: pos.y });
              nodeEngine.updateNodeConfig(nodeId, { pinned: true });
              groupPortNodesController.scheduleAlign();
            };

            proxyDragPointerId = event.pointerId;
            proxyDragMoveHandler = onMove;
            proxyDragUpHandler = onUp;
            window.addEventListener('pointermove', onMove, { capture: true });
            window.addEventListener('pointerup', onUp, { capture: true });
            window.addEventListener('pointercancel', onUp, { capture: true });

            return;
          }
        }
      }

      // New UX: Alt/Option + drag on a node duplicates it and drags the clone.
      if (event.button === 0 && event.altKey && altDuplicateDragPointerId === null) {
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

        if (nodeEl && nodeId && !isEditing) {
          // Prevent the default Rete drag so the original node stays put.
          event.preventDefault();
          event.stopPropagation();

          const initialNode = nodeEngine.getNode(nodeId);
          if (!initialNode) return;

          groupController.clearSelection();
          setSelectedNode(nodeId);

          const startClient = { x: event.clientX, y: event.clientY };
          const startGraph = computeGraphPosition(event.clientX, event.clientY);
          const startPos =
            viewAdapter.getNodePosition(nodeId) ??
            ({
              x: Number(initialNode.position?.x ?? 0),
              y: Number(initialNode.position?.y ?? 0),
            } as const);

          let didDuplicate = false;
          let duplicatedId: string | null = null;
          let dragOffset = { x: startGraph.x - startPos.x, y: startGraph.y - startPos.y };

          const MIN_DRAG_PX = 4;

          const cleanup = () => {
            if (altDuplicateDragMoveHandler)
              window.removeEventListener('pointermove', altDuplicateDragMoveHandler, {
                capture: true,
              });
            if (altDuplicateDragUpHandler) {
              window.removeEventListener('pointerup', altDuplicateDragUpHandler, {
                capture: true,
              });
              window.removeEventListener('pointercancel', altDuplicateDragUpHandler, {
                capture: true,
              });
            }
            altDuplicateDragPointerId = null;
            altDuplicateDragMoveHandler = null;
            altDuplicateDragUpHandler = null;
          };

          const onMove = (moveEvent: PointerEvent) => {
            if (altDuplicateDragPointerId === null) return;
            if (moveEvent.pointerId !== altDuplicateDragPointerId) return;

            const dx = moveEvent.clientX - startClient.x;
            const dy = moveEvent.clientY - startClient.y;
            const dist = Math.hypot(dx, dy);

            if (!didDuplicate) {
              if (dist < MIN_DRAG_PX) return;

              const source = nodeEngine.getNode(nodeId);
              if (!source) {
                cleanup();
                return;
              }

              const basePos =
                viewAdapter.getNodePosition(nodeId) ??
                ({
                  x: Number(source.position?.x ?? 0),
                  y: Number(source.position?.y ?? 0),
                } as const);

              const newId = generateId();
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

              nodeEngine.addNode(clone);

              didDuplicate = true;
              duplicatedId = newId;
              dragOffset = { x: startGraph.x - basePos.x, y: startGraph.y - basePos.y };

              groupController.clearSelection();
              setSelectedNode(newId);
            }

            if (!duplicatedId) return;

            const graphPos = computeGraphPosition(moveEvent.clientX, moveEvent.clientY);
            const desiredX = graphPos.x - dragOffset.x;
            const desiredY = graphPos.y - dragOffset.y;
            viewAdapter.setNodePosition(duplicatedId, desiredX, desiredY);

            moveEvent.preventDefault();
            moveEvent.stopPropagation();
          };

          const onUp = (upEvent: PointerEvent) => {
            if (altDuplicateDragPointerId === null) return;
            if (upEvent.pointerId !== altDuplicateDragPointerId) return;

            const finalId = duplicatedId;
            cleanup();

            if (finalId) {
              const pos = viewAdapter.getNodePosition(finalId);
              if (pos) nodeEngine.updateNodePosition(finalId, { x: pos.x, y: pos.y });
              groupController.handleDroppedNodesAfterDrag([finalId]);
            }
          };

          altDuplicateDragPointerId = event.pointerId;
          altDuplicateDragMoveHandler = onMove;
          altDuplicateDragUpHandler = onUp;
          window.addEventListener('pointermove', onMove, { capture: true });
          window.addEventListener('pointerup', onUp, { capture: true });
          window.addEventListener('pointercancel', onUp, { capture: true });

          return;
        }
      }

      groupController.onPointerDown(event);
    };
    container.addEventListener('pointerdown', onPointerDown, { capture: true });
    pointerDownHandler = onPointerDown;

    const onPointerMove = (event: PointerEvent) => {
      lastPointerClient = { x: event.clientX, y: event.clientY };
      if (connectDraggingSocket) {
        const edge = groupEdgeFinder.findGroupProxyEdgeTargetAt(event.clientX, event.clientY);
        groupEdgeHighlight = edge ? { groupId: edge.groupId, side: edge.side } : null;
      } else if (groupEdgeHighlight) {
        groupEdgeHighlight = null;
      }
    };
    container.addEventListener('pointermove', onPointerMove, { capture: true });
    pointerMoveHandler = onPointerMove;

    const onDblClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('.node')) return;
      if (target?.closest?.('.node-picker')) return;
      if (target?.closest?.('.marquee-actions')) return;
      if (target?.closest?.('.minimap')) return;
      if (target?.closest?.('.executor-logs')) return;
      if (target?.closest?.('.loop-frame-header')) return;
      if (target?.closest?.('.group-frame-header')) return;

      const tag = target?.tagName?.toLowerCase?.() ?? '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      const t = readAreaTransform(areaPlugin);
      if (!t) return;
      const gx = (x - t.tx) / t.k;
      const gy = (y - t.ty) / t.k;

      const frames = get(groupFrames) ?? [];
      let picked: GroupFrame | null = null;
      let bestDepth = -1;
      let bestArea = Number.POSITIVE_INFINITY;

      for (const frame of frames) {
        const left = Number(frame?.left);
        const top = Number(frame?.top);
        const width = Number(frame?.width);
        const height = Number(frame?.height);
        if (
          !Number.isFinite(left) ||
          !Number.isFinite(top) ||
          !Number.isFinite(width) ||
          !Number.isFinite(height)
        )
          continue;

        const inside = gx >= left && gx <= left + width && gy >= top && gy <= top + height;
        if (!inside) continue;

        const depth = Number(frame?.depth ?? 0);
        const area = width * height;
        if (depth > bestDepth || (depth === bestDepth && area < bestArea)) {
          picked = frame;
          bestDepth = depth;
          bestArea = area;
        }
      }

      if (!picked?.group?.id) return;
      event.preventDefault();
      event.stopPropagation();
      groupController.toggleGroupEditMode(String(picked.group.id));
    };

    container.addEventListener('dblclick', onDblClick, { capture: true });
    dblclickHandler = onDblClick;

    resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const area = areaPlugin?.area;
      if (!area) return;
      normalizeAreaTransform(area);
      area.update?.();
      minimapController.handleContainerResize();
      requestFramesUpdate();
    });
    resizeObserver.observe(container);

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      const lowerKey = key.toLowerCase();
      if (key === 'Escape' && isToolbarMenuOpen) {
        event.preventDefault();
        closeToolbarMenu();
        return;
      }
      if (key === 'Escape' && get(isPickerOpen)) {
        event.preventDefault();
        closePicker();
        return;
      }
      if (
        key === 'Escape' &&
        (get(groupController.groupSelectionNodeIds).size > 0 ||
          Boolean(get(groupController.selectedGroupId)))
      ) {
        event.preventDefault();
        groupController.clearSelection();
        return;
      }

      const el = (event.target as HTMLElement | null) ?? document.activeElement;
      const tag = el?.tagName?.toLowerCase?.() ?? '';
      const isEditing =
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        Boolean(el?.isContentEditable);
      if (isEditing) return;

      if ((event.metaKey || event.ctrlKey) && lowerKey === 'c') {
        if (clipboardController.copySelectedNodes()) {
          event.preventDefault();
        }
        return;
      }

      if ((event.metaKey || event.ctrlKey) && lowerKey === 'v') {
        if (clipboardController.pasteCopiedNodes()) {
          event.preventDefault();
        }
        return;
      }

      if (key !== 'Backspace' && key !== 'Delete') return;

      const selectedIds = get(groupController.groupSelectionNodeIds);
      if (selectedIds.size > 0) {
        event.preventDefault();
        for (const id of selectedIds) {
          deleteNodeWithRules(id);
        }
        groupController.clearSelection();
        return;
      }

      if (!selectedNodeId) return;
      event.preventDefault();
      deleteNodeWithRules(selectedNodeId);
    };

    window.addEventListener('keydown', onKeyDown);
    keydownHandler = onKeyDown;

    const onWindowPointerDown = (event: PointerEvent) => {
      if (!isToolbarMenuOpen) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (toolbarMenuWrap?.contains(target)) return;
      closeToolbarMenu();
    };
    window.addEventListener('pointerdown', onWindowPointerDown, { capture: true });
    toolbarMenuOutsideHandler = onWindowPointerDown;
  });

  onDestroy(() => {
    destroyNodeCanvasResources({
      container,
      graphUnsub,
      groupNodesUnsub,
      groupFramesUnsub,
      groupUiStateUnsub,
      paramsUnsub,
      tickUnsub,
      runningUnsub,
      loopDeployUnsub,
      groupDisabledUnsub,
      managerUnsub,
      displayBridgeUnsub,
      midiController,
      patchRuntime,
      loopController,
      frameDragController,
      groupController,
      groupPortNodesController,
      minimapController,
      keydownHandler,
      wheelHandler,
      contextMenuHandler,
      pointerDownHandler,
      pointerMoveHandler,
      dblclickHandler,
      toolbarMenuOutsideHandler,
      altDuplicateDragMoveHandler,
      altDuplicateDragUpHandler,
      proxyDragMoveHandler,
      proxyDragUpHandler,
      groupFrameToggleHandler,
      groupFrameDisabledHandler,
      customNodeUncoupleHandler,
      customNodeExpandHandler,
      resizeObserver,
      socketPositionWatcher,
      areaPlugin,
      editor,
      nodeMap,
      connectionMap,
      nodeEngine,
      windowRef: typeof window === 'undefined' ? undefined : window,
      isDev: import.meta.env.DEV,
      setAltDuplicateDragPointerId: (value) => {
        altDuplicateDragPointerId = value;
      },
      setAltDuplicateDragMoveHandler: (handler) => {
        altDuplicateDragMoveHandler = handler;
      },
      setAltDuplicateDragUpHandler: (handler) => {
        altDuplicateDragUpHandler = handler;
      },
      setProxyDragPointerId: (value) => {
        proxyDragPointerId = value;
      },
      setProxyDragMoveHandler: (handler) => {
        proxyDragMoveHandler = handler;
      },
      setProxyDragUpHandler: (handler) => {
        proxyDragUpHandler = handler;
      },
    });
  });
</script>

<NodeCanvasLayout
  bind:container
  isRunning={$isRunningStore}
  edgeShadowsEnabled={$nodeGraphEdgeShadows}
  gridScale={canvasTransform.k}
  gridOffset={{ x: canvasTransform.tx, y: canvasTransform.ty }}
>
  <svelte:fragment slot="toolbar">
    <input
      bind:this={importGraphInputEl}
      type="file"
      accept="application/json"
      on:change={fileActions.handleImportGraphChange}
      style="display: none;"
    />
    <input
      bind:this={importTemplatesInputEl}
      type="file"
      accept="application/json"
      on:change={fileActions.handleImportTemplatesChange}
      style="display: none;"
    />
    <input
      bind:this={importCustomNodeInputEl}
      type="file"
      accept="application/json"
      on:change={handleImportCustomNodeChange}
      style="display: none;"
    />
    <NodeCanvasToolbar
      bind:toolbarMenuWrap
      isRunning={$isRunningStore}
      {nodeCount}
      groups={$nodeGroups}
      onFocusGroup={focusController.focusGroupById}
      lastError={$lastErrorStore}
      isMenuOpen={isToolbarMenuOpen}
      onToggleEngine={handleToggleEngine}
      onToggleExecutorLogs={toggleExecutorLogs}
      onClear={handleClear}
      onToggleMenu={toggleToolbarMenu}
      onMenuPick={handleToolbarMenuPick}
      onImportGraph={fileActions.importGraph}
      onExportGraph={fileActions.exportGraph}
      onImportCustomNode={importCustomNode}
      onExportCustomNode={exportCustomNode}
      onImportTemplates={fileActions.importTemplates}
      onExportTemplates={fileActions.exportTemplates}
    />
  </svelte:fragment>

  <svelte:fragment slot="logs">
    {#if $showExecutorLogs && $logsClientId}
      {@const logsStatus = $executorStatusByClient.get($logsClientId)}
      <ExecutorLogsPanel
        clientId={$logsClientId}
        status={logsStatus}
        onClose={() => showExecutorLogs.set(false)}
      />
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="overlays">
    {#if $nodeGraphPerfConsole}
      <PerformanceDebugConsole
        enabled={true}
        {nodeCount}
        connectionCount={graphState.connections?.length ?? 0}
        rendererType="rete"
        shadowsEnabled={$nodeGraphEdgeShadows}
      />
    {/if}

    {#if $canvasToast}
      <div class="canvas-toast" aria-live="polite">{$canvasToast}</div>
    {/if}

    <NodePickerOverlay
      isOpen={$isPickerOpen}
      mode={$pickerMode}
      initialSocket={$pickerInitialSocket}
      connectTypeLabel={$pickerInitialSocket
        ? (reteBuilder.getPortDefForSocket($pickerInitialSocket)?.type ?? 'any')
        : 'any'}
      anchor={$pickerAnchor}
      bind:query={$pickerQuery}
      categories={$pickerCategories}
      bind:selectedCategory={$pickerSelectedCategory}
      items={$pickerItems}
      onClose={closePicker}
      onPick={handlePickerPick}
      bind:pickerElement
    />

    <GroupFramesOverlay
      frames={$groupFrames}
      areaTransform={canvasTransform}
      isRunning={$isRunningStore}
      editModeGroupId={$editModeGroupId}
      selectedGroupId={$selectedGroupId}
      toast={$groupEditToast}
      edgeHighlight={groupEdgeHighlight}
      {gateModeGroupIds}
      groupGateNodeIdByGroupId={groupGateNodeIdByGroupId}
      customNodeGroupIds={expandedCustomGroupIds}
      onToggleDisabled={handleToggleGroupDisabled}
      onToggleMinimized={groupController.toggleGroupMinimized}
      onToggleEditMode={groupController.toggleGroupEditMode}
      onNodalize={handleNodalizeGroup}
      onDenodalize={handleDenodalizeGroup}
      onCollapseCustomNode={handleCollapseCustomNodeFrame}
      onDisassemble={groupPortNodesController.disassembleGroupAndPorts}
      onRename={handleRenameGroup}
      onHeaderPointerDown={groupFrameHeaderHandlers.handleGroupHeaderPointerDown}
    />

    <LoopFramesOverlay
      frames={$loopFrames}
      areaTransform={canvasTransform}
      deployedLoopIds={$deployedLoopIds}
      getLoopClientId={loopController.loopActions.getLoopClientId}
      executorStatusByClient={$executorStatusByClient}
      showExecutorLogs={$showExecutorLogs}
      logsClientId={$logsClientId}
      isRunning={$isRunningStore}
      onToggleLogs={loopController.toggleLoopLogs}
      onStop={loopController.loopActions.stopLoop}
      onDeploy={loopController.loopActions.deployLoop}
      isLoopDeploying={loopController.isLoopDeploying}
      loopHasDisabledNodes={loopController.loopHasDisabledNodes}
      onHeaderPointerDown={frameDragController.startLoopHeaderDrag}
    />

    <MarqueeOverlay
      marqueeRect={$marqueeRect}
      selectionBounds={$groupSelectionBounds}
      selectionCount={$groupSelectionNodeIds.size}
      onCreateGroup={groupController.createGroupFromSelection}
    />
  </svelte:fragment>

  <svelte:fragment slot="minimap">
    <NodeCanvasMinimap
      minimapUi={$minimapUi}
      minimap={$minimap}
      zoomStep={30}
      {toMiniX}
      {toMiniY}
      onZoom={minimapController.zoom}
      onMovePointerDown={minimapController.handleMovePointerDown}
      onMovePointerMove={minimapController.handleMovePointerMove}
      onMovePointerUp={minimapController.handleMovePointerUp}
      onPointerDown={minimapController.handlePointerDown}
      onPointerMove={minimapController.handlePointerMove}
      onPointerUp={minimapController.handlePointerUp}
    />
  </svelte:fragment>
</NodeCanvasLayout>

<style>
  .canvas-toast {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 40;
    padding: 8px 14px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.92);
    background: rgba(2, 6, 23, 0.66);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow:
      0 10px 28px rgba(0, 0, 0, 0.38),
      0 0 0 1px rgba(59, 130, 246, 0.12);
    backdrop-filter: blur(14px);
    pointer-events: none;
    max-width: min(520px, calc(100% - 48px));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* --- Rete Classic preset overrides --- */
  :global(.node-canvas-container .node) {
    background: rgba(17, 24, 39, 0.92) !important;
    border: 1px solid rgba(99, 102, 241, 0.35) !important;
    border-radius: 12px !important;
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.38) !important;
    width: 230px !important;
  }

  :global(.node-canvas-container .node:hover) {
    border-color: rgba(99, 102, 241, 0.6) !important;
  }

  :global(.node-canvas-container .node.selected) {
    border-color: rgba(99, 102, 241, 0.95) !important;
    box-shadow: 0 18px 52px rgba(99, 102, 241, 0.18) !important;
  }

  :global(.node-canvas-container .node.local-loop) {
    border-color: rgba(236, 72, 153, 0.85) !important;
    box-shadow: 0 18px 56px rgba(236, 72, 153, 0.16) !important;
  }

  :global(.node-canvas-container .node.deployed-loop) {
    border-color: rgba(20, 184, 166, 0.95) !important;
    box-shadow: 0 18px 56px rgba(20, 184, 166, 0.16) !important;
  }

  :global(.node-canvas-container .node .title) {
    color: rgba(255, 255, 255, 0.92) !important;
    font-size: 14px !important;
    padding: 10px 12px !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
    letter-spacing: 0.2px;
  }

  :global(.node-canvas-container .node .input-title),
  :global(.node-canvas-container .node .output-title) {
    color: rgba(255, 255, 255, 0.78) !important;
    font-size: 12px !important;
    margin: 4px 8px !important;
    line-height: 18px !important;
  }

  :global(.node-canvas-container .socket) {
    width: 14px !important;
    height: 14px !important;
    border-radius: 999px !important;
    margin: 6px !important;
    border: 2px solid rgba(255, 255, 255, 0.35) !important;
    background: rgba(99, 102, 241, 0.95) !important;
  }

  :global(.node-canvas-container .socket[title='number']) {
    background: rgba(34, 197, 94, 0.92) !important;
  }

  :global(.node-canvas-container .socket[title='boolean']) {
    background: rgba(245, 158, 11, 0.95) !important;
  }

  :global(.node-canvas-container .socket[title='string']) {
    background: rgba(59, 130, 246, 0.95) !important;
  }

  :global(.node-canvas-container .socket[title='color']) {
    background: rgba(236, 72, 153, 0.95) !important;
  }

  :global(.node-canvas-container .socket[title='audio']) {
    background: rgba(14, 165, 233, 0.95) !important;
  }

  :global(.node-canvas-container .socket[title='image']) {
    background: rgba(244, 114, 182, 0.95) !important;
  }

  :global(.node-canvas-container .socket[title='video']) {
    background: rgba(34, 211, 238, 0.95) !important;
  }

  :global(.node-canvas-container .socket[title='client']) {
    background: rgba(168, 85, 247, 0.95) !important;
  }

  :global(.node-canvas-container .socket[title='command']) {
    background: rgba(239, 68, 68, 0.92) !important;
  }

  :global(.node-canvas-container .socket[title='fuzzy']) {
    background: rgba(20, 184, 166, 0.95) !important;
  }

  :global(.node-canvas-container .socket[title='any']) {
    background: rgba(99, 102, 241, 0.95) !important;
  }

  :global(.node-canvas-container .socket:hover) {
    border-width: 3px !important;
  }

  :global(.node-canvas-container .output-socket) {
    margin-right: -10px !important;
  }

  :global(.node-canvas-container .input-socket) {
    margin-left: -10px !important;
  }

</style>
