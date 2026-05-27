// Purpose: Create and wire the Rete editor stack for NodeCanvas.
import { get } from 'svelte/store';
import { NodeEditor } from 'rete';
import { AreaPlugin, AreaExtensions } from 'rete-area-plugin';
import { ConnectionPlugin, Presets as ConnectionPresets } from 'rete-connection-plugin';
import { HistoryPlugin } from 'rete-history-plugin';
import { SveltePlugin } from 'rete-svelte-plugin';
import { LiveDOMSocketPosition } from '../rete/live-socket-position';
import { createReteConnectionDropPipe } from '../rete/rete-connection-drop-pipe';
import { createGraphSync } from '../rete/rete-sync';
import { bindRetePipes } from '../rete/rete-pipes';
import { setupReteRenderPreset } from '../rete/setup-rete-render';
import { registerGroupFrameTranslatePipe } from '../groups/group-frame-translate';
import type { Connection as EngineConnection, GraphState } from '$lib/nodes/types';
import type { SocketData } from '../controllers/picker-controller';

type AnyRecord = Record<string, unknown>;

export async function initReteCanvas(opts: {
  container: HTMLDivElement;
  editorId: string;
  nodeMap: Map<string, any>;
  connectionMap: Map<string, any>;
  nodeRegistry: any;
  nodeEngine: any;
  canvasCommands: any;
  groupController: any;
  groupPortNodesController: any;
  groupEdgeFinder: any;
  reteBuilder: any;
  graphStateStore: any;
  isRunningStore: any;
  isSyncingRef: { value: boolean };
  renderers: any;
  socketPositionWatcher: LiveDOMSocketPosition | null;
  getLastPointerClient: () => { x: number; y: number };
  setConnectDraggingSocket: (socket: unknown) => void;
  setGroupEdgeHighlight: (highlight: unknown) => void;
  computeGraphPosition: (clientX: number, clientY: number) => { x: number; y: number };
  addNode: (type: string, position?: { x: number; y: number }) => string | undefined;
  findPortRowSocketAt: (
    clientX: number,
    clientY: number,
    desiredSide: 'input' | 'output'
  ) => unknown;
  openConnectPicker: (...args: any[]) => unknown;
  setGraphState: (state: unknown) => void;
  setNodeCount: (count: number) => void;
  getProjectionState?: () => unknown;
  isProjectionId?: (id: string) => boolean;
  isProjectionEditable?: (id: string) => boolean;
  translateProjectionConnection?: (...args: any[]) => unknown;
  updateProjectionNodePosition?: (...args: any[]) => unknown;
  getSelectedNodeId: () => string;
  syncSleepNodeSockets: (state: unknown) => void | Promise<void>;
  flushPendingCollapsedNodes: () => void | Promise<void>;
  minimapController: any;
  requestFramesUpdate: () => void;
  loopController: any;
  midiController: any;
  applyStoppedHighlights: (running: boolean) => void;
  syncPatchVisualState: () => void;
  focusController: any;
  syncClientNodesFromInputs: () => void;
  setSelectedNode: (id: string) => void;
}) {
  const editor = new NodeEditor();
  const areaPlugin = new AreaPlugin(opts.container);
  const connection = new ConnectionPlugin();
  const render = new SveltePlugin();
  const history = new HistoryPlugin();

  areaPlugin?.area?.setZoomHandler?.(null);

  editor.use(areaPlugin);
  areaPlugin.use(connection as unknown as Parameters<typeof areaPlugin.use>[0]);
  areaPlugin.use(render as unknown as Parameters<typeof areaPlugin.use>[0]);
  areaPlugin.use(history as unknown as Parameters<typeof areaPlugin.use>[0]);

  connection.addPreset(ConnectionPresets.classic.setup());
  const connectionDropPipe = createReteConnectionDropPipe({
    getLastPointerClient: opts.getLastPointerClient,
    setConnectDraggingSocket: opts.setConnectDraggingSocket,
    setGroupEdgeHighlight: opts.setGroupEdgeHighlight,
    groupEdgeFinder: opts.groupEdgeFinder,
    groupController: opts.groupController,
    nodeEngine: opts.nodeEngine,
    nodeRegistry: opts.nodeRegistry,
    canvasCommands: opts.canvasCommands,
    groupPortNodesController: opts.groupPortNodesController,
    computeGraphPosition: opts.computeGraphPosition,
    addNode: opts.addNode,
    findPortRowSocketAt: opts.findPortRowSocketAt as (
      clientX: number,
      clientY: number,
      desiredSide: 'input' | 'output'
    ) => SocketData | null,
    openConnectPicker: opts.openConnectPicker as (socket: SocketData) => void,
    isProjectionId: opts.isProjectionId,
    isProjectionEditable: opts.isProjectionEditable,
    translateProjectionConnection: opts.translateProjectionConnection as
      | ((connection: EngineConnection) => EngineConnection | null)
      | undefined,
  });
  connection.addPipe(connectionDropPipe as unknown as Parameters<typeof connection.addPipe>[0]);

  const socketPositionWatcher = setupReteRenderPreset({
    render: render as unknown as Parameters<typeof setupReteRenderPreset>[0]['render'],
    requestFramesUpdate: opts.requestFramesUpdate,
    socketPositionWatcher: opts.socketPositionWatcher,
    createSocketPositionWatcher: () => new LiveDOMSocketPosition(opts.requestFramesUpdate),
    renderers: opts.renderers,
  });

  const graphSync = createGraphSync({
    editor,
    areaPlugin,
    nodeMap: opts.nodeMap,
    connectionMap: opts.connectionMap,
    nodeRegistry: opts.nodeRegistry,
    socketFor: opts.reteBuilder.socketFor,
    buildReteNode: opts.reteBuilder.buildReteNode,
    nodeLabel: opts.reteBuilder.nodeLabel,
    applyMidiMapRangeConstraints: opts.reteBuilder.applyMidiMapRangeConstraints,
    setGraphState: opts.setGraphState,
    setNodeCount: opts.setNodeCount,
    getProjectionState: opts.getProjectionState as (() => GraphState) | undefined,
    getSelectedNodeId: opts.getSelectedNodeId,
    onAfterSync: () => {
      const graphState = get(opts.graphStateStore);
      void opts.syncSleepNodeSockets(graphState);
      void opts.flushPendingCollapsedNodes();
      opts.minimapController.requestUpdate();
      opts.requestFramesUpdate();
      void opts.loopController?.applyHighlights();
      void opts.groupController.applyHighlights();
      void opts.midiController.applyHighlights();
      void opts.applyStoppedHighlights(get(opts.isRunningStore));
      opts.syncPatchVisualState();
      opts.focusController.flushPendingFocus();
      opts.syncClientNodesFromInputs();
    },
    isSyncingRef: opts.isSyncingRef,
  });

  await graphSync.schedule(get(opts.graphStateStore));

  bindRetePipes({
    editor,
    areaPlugin,
    nodeEngine: opts.nodeEngine,
    canvasCommands: opts.canvasCommands,
    nodeMap: opts.nodeMap,
    connectionMap: opts.connectionMap,
    isSyncing: () => opts.isSyncingRef.value,
    setSelectedNode: opts.setSelectedNode,
    groupSelectionNodeIds: opts.groupController.groupSelectionNodeIds,
    isProgrammaticTranslate: opts.groupController.isProgrammaticTranslate,
    handleDroppedNodesAfterDrag: opts.groupController.handleDroppedNodesAfterDrag,
    requestFramesUpdate: opts.requestFramesUpdate,
    requestMinimapUpdate: opts.minimapController.requestUpdate,
    isProjectionId: opts.isProjectionId,
    isProjectionEditable: opts.isProjectionEditable,
    translateProjectionConnection: opts.translateProjectionConnection as
      | ((connection: EngineConnection) => EngineConnection | null)
      | undefined,
    updateProjectionNodePosition: opts.updateProjectionNodePosition as
      | ((nodeId: string, position: { x: number; y: number }) => boolean)
      | undefined,
  });

  registerGroupFrameTranslatePipe({
    areaPlugin,
    nodeEngine: opts.nodeEngine,
    groupController: opts.groupController,
    isSyncing: () => opts.isSyncingRef.value,
    groupPortNodesController: opts.groupPortNodesController,
    requestFramesUpdate: opts.requestFramesUpdate,
    requestMinimapUpdate: opts.minimapController.requestUpdate,
  });

  await AreaExtensions.zoomAt(
    areaPlugin,
    Array.from(opts.nodeMap.values()) as unknown as Parameters<typeof AreaExtensions.zoomAt>[1]
  );
  opts.minimapController.requestUpdate();
  opts.requestFramesUpdate();

  return { editor, areaPlugin, graphSync, socketPositionWatcher };
}
