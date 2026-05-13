// Purpose: Compose NodeCanvas graph/template and custom-node file actions.
import { get } from 'svelte/store';
import { createFileActions } from './file-actions';
import { createCustomNodeFileActions } from '../custom-nodes/custom-node-file-actions';

export function createNodeCanvasFileActionBundle(opts: {
  nodeEngine: any;
  viewAdapter: any;
  getNodeCollapsed: (nodeId: string) => boolean;
  setNodeCollapsed: (nodeId: string, collapsed: boolean) => Promise<void>;
  getImportGraphInput: () => HTMLInputElement | null;
  getImportTemplatesInput: () => HTMLInputElement | null;
  getSelectedNodeId: () => string;
  getViewportCenterGraphPos: () => { x: number; y: number };
  generateId: () => string;
  addCustomNodeDefinition: (definition: unknown) => void;
  addNodeCommand: (node: unknown) => void;
  groupController: any;
  requestFramesUpdate: () => void;
  requestMinimapUpdate: () => void;
  setSelectedNode: (id: string) => void;
  focusController: any;
}) {
  const fileActions = createFileActions({
    nodeEngine: opts.nodeEngine,
    getNodePosition: (nodeId: string) => opts.viewAdapter.getNodePosition(String(nodeId)),
    getNodeCollapsed: opts.getNodeCollapsed,
    setNodeCollapsed: opts.setNodeCollapsed,
    getImportGraphInput: opts.getImportGraphInput,
    getImportTemplatesInput: opts.getImportTemplatesInput,
    getNodeGroups: () => get(opts.groupController.nodeGroups),
    appendNodeGroups: (groups: unknown[]) => opts.groupController.appendGroups(groups),
    onSelectNodeIds: (nodeIds: unknown[]) => {
      const ids = (nodeIds ?? []).map((id) => String(id)).filter(Boolean);
      if (ids.length === 0) return;
      opts.groupController.clearSelection();
      opts.setSelectedNode('');
      opts.groupController.groupSelectionNodeIds.set(new Set(ids));
      opts.groupController.scheduleHighlight();
      opts.requestFramesUpdate();
      opts.requestMinimapUpdate();
      opts.focusController.setPendingFocusNodeIds(ids);
    },
    getViewportCenterGraphPos: opts.getViewportCenterGraphPos,
  });

  const customNodeFileActions = createCustomNodeFileActions({
    getSelectedNodeId: opts.getSelectedNodeId,
    getViewportCenterGraphPos: opts.getViewportCenterGraphPos,
    generateId: opts.generateId,
    nodeEngine: opts.nodeEngine,
    addCustomNodeDefinition: opts.addCustomNodeDefinition,
    addNode: opts.addNodeCommand,
    clearSelection: () => opts.groupController.clearSelection(),
    setSelectedNode: opts.setSelectedNode,
    selectNodeIds: (nodeIds: string[]) => {
      opts.groupController.groupSelectionNodeIds.set(new Set(nodeIds));
      opts.groupController.scheduleHighlight();
    },
    requestFramesUpdate: opts.requestFramesUpdate,
    requestMinimapUpdate: opts.requestMinimapUpdate,
    setPendingFocusNodeIds: (nodeIds: string[]) => opts.focusController.setPendingFocusNodeIds(nodeIds),
  });

  return {
    fileActions,
    exportCustomNode: customNodeFileActions.exportCustomNode,
    handleImportCustomNodeChange: customNodeFileActions.handleImportCustomNodeChange,
  };
}
