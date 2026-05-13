// Purpose: Top-level NodeCanvas toolbar actions with injected runtime dependencies.
import { get, type Readable, type Writable } from 'svelte/store';
import type { nodeEngine as managerNodeEngine } from '$lib/nodes/engine';
import type { GroupController } from '../controllers/group-controller';
import type { LoopController } from '../controllers/loop-controller';

type CanvasActionsOptions = {
  nodeEngine: typeof managerNodeEngine;
  isRunningStore: Readable<boolean>;
  getLoopController: () => LoopController | null;
  groupController: GroupController;
  getContainer: () => HTMLDivElement | null;
  getNodeCount: () => number;
  computeGraphPosition: (clientX: number, clientY: number) => { x: number; y: number };
  schedulePatchReconcile: (reason: string) => void;
  stopAllDeployedPatches: () => void;
  confirm: (message?: string) => boolean;
};

export function createCanvasActions(opts: CanvasActionsOptions) {
  const resetGroups = () => {
    opts.groupController.nodeGroups.set([]);
    opts.groupController.groupFrames.set([]);
    opts.groupController.groupDisabledNodeIds.set(new Set());
    opts.groupController.editModeGroupId.set(null);
    opts.groupController.groupEditToast.set(null);
    opts.groupController.clearSelection();
    opts.groupController.scheduleHighlight();
  };

  const handleToggleEngine = () => {
    const loopController = opts.getLoopController();
    if (get(opts.isRunningStore)) {
      opts.nodeEngine.stop();
      loopController?.loopActions.stopAllClientEffects();
      loopController?.loopActions.stopAllDeployedLoops();
      opts.stopAllDeployedPatches();
    } else {
      opts.nodeEngine.start();
      opts.schedulePatchReconcile('engine-start');
    }
  };

  const handleClear = () => {
    if (!opts.confirm('Clear all nodes?')) return;
    opts.nodeEngine.clear();
    resetGroups();
  };

  const viewportCenterGraphPos = (): { x: number; y: number } => {
    const container = opts.getContainer();
    const nodeCount = opts.getNodeCount();
    if (!container) return { x: 120 + nodeCount * 10, y: 120 + nodeCount * 6 };
    const rect = container.getBoundingClientRect();
    return opts.computeGraphPosition(rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  return { handleToggleEngine, handleClear, resetGroups, viewportCenterGraphPos };
}
