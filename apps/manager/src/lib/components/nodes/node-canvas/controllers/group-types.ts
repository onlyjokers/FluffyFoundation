/**
 * Purpose: Shared contracts for NodeCanvas group controller modules.
 */
import type { Writable } from 'svelte/store';
import type { LocalLoop } from '$lib/nodes';
import type { GraphState } from '$lib/nodes/types';
import type { GraphViewAdapter, NodeBounds } from '../adapters';

export type NodeGroup = {
  id: string;
  parentId: string | null;
  name: string;
  nodeIds: string[];
  disabled: boolean;
  /** When true, the group frame collapses into a node-like form and hides its subtree nodes/connections. */
  minimized: boolean;
  /** Runtime gate from Group Gate port; defaults to true when unset. */
  runtimeActive?: boolean;
};

export type GroupFrame = {
  group: NodeGroup;
  left: number;
  top: number;
  width: number;
  height: number;
  effectiveDisabled: boolean;
  depth: number;
};

export type GroupEditToast = { groupId: string; message: string } | null;

export type FrameInfo = {
  id: string;
  kind: 'group' | 'loop';
  nodeIds: Set<string>;
  bounds: NodeBounds;
};

export type FrameMoveContext = {
  frameById: Map<string, FrameInfo>;
  nodeToFrameIds: Map<string, string[]>;
  movedFrameIds: Set<string>;
};

export type GroupControllerOptions = {
  getContainer: () => HTMLDivElement | null;
  getAdapter: () => GraphViewAdapter | null;
  getGraphState: () => GraphState;
  /** Extra hidden nodes owned by host UI (e.g. expanded Custom Node mother instances). */
  getForcedHiddenNodeIds?: () => Set<string>;
  getLocalLoops: () => LocalLoop[];
  getLoopConstraintLoops: () => LocalLoop[];
  getDeployedLoopIds: () => Set<string>;
  setNodesDisabled: (ids: string[], disabled: boolean) => void;
  requestLoopFramesUpdate: () => void;
  requestMinimapUpdate: () => void;
  isSyncingGraph: () => boolean;
  stopAndRemoveLoop: (loop: LocalLoop) => void;
};

export type GroupController = {
  nodeGroups: Writable<NodeGroup[]>;
  groupFrames: Writable<GroupFrame[]>;
  groupSelectionNodeIds: Writable<Set<string>>;
  groupSelectionBounds: Writable<{ left: number; top: number; width: number; height: number } | null>;
  selectedGroupId: Writable<string | null>;
  editModeGroupId: Writable<string | null>;
  canvasToast: Writable<string | null>;
  groupEditToast: Writable<GroupEditToast>;
  groupDisabledNodeIds: Writable<Set<string>>;
  marqueeRect: Writable<{ left: number; top: number; width: number; height: number } | null>;
  requestFramesUpdate: () => void;
  setGroups: (groups: NodeGroup[]) => void;
  appendGroups: (groups: NodeGroup[]) => void;
  /** Reconcile group membership after nodes are removed from the graph. Returns removed group IDs. */
  reconcileGraphNodes: (graph?: GraphState) => string[];
  setRuntimeActiveByGroupId: (activeById: Map<string, boolean>) => void;
  applyHighlights: () => Promise<void>;
  scheduleHighlight: () => void;
  clearSelection: () => void;
  createGroupFromSelection: () => void;
  toggleGroupDisabled: (groupId: string) => void;
  toggleGroupMinimized: (groupId: string) => void;
  disassembleGroup: (groupId: string) => void;
  renameGroup: (groupId: string, name: string) => void;
  toggleGroupEditMode: (groupId: string) => void;
  autoAddNodeToGroupFromPosition: (nodeId: string, graphPos: { x: number; y: number }) => void;
  autoAddNodeToGroupFromConnectDrop: (
    initialNodeId: string,
    newNodeId: string,
    dropGraphPos: { x: number; y: number }
  ) => void;
  handleDroppedNodesAfterDrag: (nodeIds: string[]) => void;
  onPointerDown: (event: PointerEvent) => void;
  destroy: () => void;
  isProgrammaticTranslate: () => boolean;
  beginProgrammaticTranslate: () => void;
  endProgrammaticTranslate: () => void;
  computeLoopFrameBounds: (loop: LocalLoop) => NodeBounds | null;
  pushNodesOutOfBounds: (bounds: NodeBounds, excludeNodeIds: Set<string>, frameMoves?: FrameMoveContext) => void;
};
