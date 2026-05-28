<!-- Presentation shell for NodeCanvas toolbar, overlays, and minimap. -->
<script lang="ts">
  import NodeCanvasLayout from './NodeCanvasLayout.svelte';
  import ExecutorLogsPanel from './panels/ExecutorLogsPanel.svelte';
  import ModelDistributionPanel from './panels/ModelDistributionPanel.svelte';
  import GroupFramesOverlay from './overlays/GroupFramesOverlay.svelte';
  import LoopFramesOverlay from './overlays/LoopFramesOverlay.svelte';
  import type { LoopFrame } from '../controllers/loop-controller';
  import MarqueeOverlay from './overlays/MarqueeOverlay.svelte';
  import NodeCanvasMinimap from './NodeCanvasMinimap.svelte';
  import NodeCanvasToolbar from './NodeCanvasToolbar.svelte';
  import NodePickerOverlay from './NodePickerOverlay.svelte';
  import PerformanceDebugConsole from './PerformanceDebugConsole.svelte';
  import NodeCanvasReteStyles from '../styles/NodeCanvasReteStyles.svelte';
  import type { GroupFrame, NodeGroup } from '../controllers/group-types';

  export let container: HTMLDivElement | null = null;
  export let importGraphInputEl: HTMLInputElement | null = null;
  export let importTemplatesInputEl: HTMLInputElement | null = null;
  export let importCustomNodeInputEl: HTMLInputElement | null = null;
  export let toolbarMenuWrap: HTMLDivElement | null = null;
  export let pickerElement: HTMLDivElement | null = null;

  export let isRunning = false;
  export let edgeShadowsEnabled = false;
  export let gridScale = 1;
  export let gridOffset = { x: 0, y: 0 };
  export let nodeCount = 0;
  export let groups: NodeGroup[] = [];
  export let graphConnectionCount = 0;
  export let lastError = null;
  export let isToolbarMenuOpen = false;
  export let showPerfConsole = false;
  export let canvasToast = null;
  export let isModelDistributionPanelOpen = false;
  export let onCloseModelDistributionPanel = () => {};

  export let fileActions;
  export let handleImportCustomNodeChange;
  export let importCustomNode;
  export let exportCustomNode;
  export let focusGroupById;
  export let handleToggleEngine;
  export let toggleExecutorLogs;
  export let handleClear;
  export let toggleToolbarMenu;
  export let handleToolbarMenuPick;
  export let toggleModelDistributionPanel;

  export let showExecutorLogs = false;
  export let logsClientId = '';
  export let executorStatusByClient = new Map();
  export let onCloseExecutorLogs = () => {};

  export let picker;

  export let groupFrames: GroupFrame[] = [];
  export let editModeGroupId = null;
  export let customNodeEditGroupId = null;
  export let selectedGroupId = null;
  export let groupEditToast = null;
  export let groupEdgeHighlight = null;
  export let expandedCustomGroupIds: Set<string> = new Set();
  export let groupOverlayActions;

  export let loopFrames: LoopFrame[] = [];
  export let deployedLoopIds: Set<string> = new Set();
  export let loopController;
  export let frameDragController;

  export let marqueeRect = null;
  export let groupSelectionBounds = null;
  export let groupSelectionCount = 0;
  export let createGroupFromSelection;
  export let createAiSpaceFromSelection;

  export let minimapUi;
  export let minimap;
  export let toMiniX;
  export let toMiniY;
  export let minimapController;
</script>

<NodeCanvasLayout bind:container {isRunning} {edgeShadowsEnabled} {gridScale} {gridOffset}>
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
      {isRunning}
      {nodeCount}
      {groups}
      onFocusGroup={focusGroupById}
      {lastError}
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
      onToggleModelDistributionPanel={toggleModelDistributionPanel}
    />
  </svelte:fragment>

  <svelte:fragment slot="logs">
    {#if showExecutorLogs && logsClientId}
      {@const logsStatus = executorStatusByClient.get(logsClientId)}
      <ExecutorLogsPanel
        clientId={logsClientId}
        status={logsStatus}
        onClose={onCloseExecutorLogs}
      />
    {/if}
  </svelte:fragment>

  <svelte:fragment slot="overlays">
    {#if showPerfConsole}
      <PerformanceDebugConsole
        enabled={true}
        {nodeCount}
        connectionCount={graphConnectionCount}
        rendererType="rete"
        shadowsEnabled={edgeShadowsEnabled}
      />
    {/if}

    {#if canvasToast}
      <div class="canvas-toast" aria-live="polite">{canvasToast}</div>
    {/if}

    {#if isModelDistributionPanelOpen}
      <ModelDistributionPanel onClose={onCloseModelDistributionPanel} />
    {/if}

    <NodePickerOverlay
      isOpen={picker.isOpen}
      mode={picker.mode}
      initialSocket={picker.initialSocket}
      connectTypeLabel={picker.connectTypeLabel ?? 'any'}
      anchor={picker.anchor}
      query={picker.query}
      onQueryChange={picker.onQueryChange}
      categories={picker.categories}
      selectedCategory={picker.selectedCategory}
      onSelectedCategoryChange={picker.onSelectedCategoryChange}
      items={picker.items}
      onClose={picker.onClose}
      onPick={picker.onPick}
      bind:pickerElement
    />

    <GroupFramesOverlay
      frames={groupFrames}
      areaTransform={{ k: gridScale, tx: gridOffset.x, ty: gridOffset.y }}
      {isRunning}
      {editModeGroupId}
      {customNodeEditGroupId}
      {selectedGroupId}
      toast={groupEditToast}
      edgeHighlight={groupEdgeHighlight}
      customNodeGroupIds={expandedCustomGroupIds}
      onToggleDisabled={groupOverlayActions.onToggleDisabled}
      onToggleMinimized={groupOverlayActions.onToggleMinimized}
      onToggleEditMode={groupOverlayActions.onToggleEditMode}
      onToggleCustomNodeEditMode={groupOverlayActions.onToggleCustomNodeEditMode}
      onNodelize={groupOverlayActions.onNodelize}
      onDenodelize={groupOverlayActions.onDenodelize}
      onCollapseCustomNode={groupOverlayActions.onCollapseCustomNode}
      onDisassemble={groupOverlayActions.onDisassemble}
      onRename={groupOverlayActions.onRename}
      onHeaderPointerDown={groupOverlayActions.onHeaderPointerDown}
    />

    <LoopFramesOverlay
      frames={loopFrames}
      areaTransform={{ k: gridScale, tx: gridOffset.x, ty: gridOffset.y }}
      {deployedLoopIds}
      getLoopClientId={loopController.loopActions.getLoopClientId}
      {executorStatusByClient}
      {showExecutorLogs}
      {logsClientId}
      {isRunning}
      onToggleLogs={loopController.toggleLoopLogs}
      onStop={loopController.loopActions.stopLoop}
      onDeploy={loopController.loopActions.deployLoop}
      isLoopDeploying={loopController.isLoopDeploying}
      loopHasDisabledNodes={loopController.loopHasDisabledNodes}
      onHeaderPointerDown={frameDragController.startLoopHeaderDrag}
    />

    <MarqueeOverlay
      {marqueeRect}
      selectionBounds={groupSelectionBounds}
      selectionCount={groupSelectionCount}
      onCreateGroup={createGroupFromSelection}
      onCreateAiSpace={createAiSpaceFromSelection}
    />
  </svelte:fragment>

  <svelte:fragment slot="minimap">
    <NodeCanvasMinimap
      {minimapUi}
      {minimap}
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

<NodeCanvasReteStyles />

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
</style>
