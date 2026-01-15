/**
 * Purpose: Minimap state + interactions for the node canvas.
 */
import { get, writable, type Writable } from 'svelte/store';
import type { MinimapPreferences } from '$lib/project/uiState';
import { minimapPreferences } from '$lib/project/uiState';
import type { GraphViewAdapter } from '../adapters';
import type { GraphState, NodeInstance } from '$lib/nodes/types';

type MiniNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  selected: boolean;
};

type MiniConnection = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  localLoop: boolean;
  deployedLoop: boolean;
};

export type MinimapState = {
  size: number;
  nodes: MiniNode[];
  connections: MiniConnection[];
  viewport: { x: number; y: number; width: number; height: number };
  bounds: { minX: number; minY: number; width: number; height: number };
  scale: number;
  offsetX: number;
  offsetY: number;
};

export type MinimapUiState = { x: number; y: number; size: number };

const DEFAULT_MINIMAP_SIZE = 190;
const MIN_MINIMAP_SIZE = 120;
const MAX_MINIMAP_SIZE = 360;
const MINIMAP_BAR_WIDTH = 22;
const MINIMAP_MARGIN = 12;

export type MinimapController = {
  minimap: Writable<MinimapState>;
  minimapUi: Writable<MinimapUiState>;
  requestUpdate: () => void;
  zoom: (delta: number) => void;
  handlePointerDown: (event: PointerEvent) => void;
  handlePointerMove: (event: PointerEvent) => void;
  handlePointerUp: (event: PointerEvent) => void;
  handleMovePointerDown: (event: PointerEvent) => void;
  handleMovePointerMove: (event: PointerEvent) => void;
  handleMovePointerUp: (event: PointerEvent) => void;
  handleContainerResize: () => void;
  destroy: () => void;
};

type MinimapControllerOptions = {
  getContainer: () => HTMLDivElement | null;
  getAdapter: () => GraphViewAdapter | null;
  getGraphState: () => GraphState;
  getSelectedNodeId: () => string;
  getLocalLoopConnIds: () => Set<string>;
  getDeployedConnIds: () => Set<string>;
};

export function createMinimapController(opts: MinimapControllerOptions): MinimapController {
  const minimap = writable<MinimapState>({
    size: DEFAULT_MINIMAP_SIZE,
    nodes: [],
    connections: [],
    viewport: { x: 0, y: 0, width: 1, height: 1 },
    bounds: { minX: 0, minY: 0, width: 1, height: 1 },
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });
  const minimapUi = writable<MinimapUiState>({ x: 0, y: 0, size: DEFAULT_MINIMAP_SIZE });

  let minimapRaf = 0;
  let pendingPrefs: MinimapPreferences | null = null;
  let prefsUnsub: (() => void) | null = null;

  let isMinimapDragging = false;
  let minimapDragPointerId = -1;
  let minimapDragStart = { x: 0, y: 0, originX: 0, originY: 0 };

  let isMinimapViewportDragging = false;
  let minimapViewportPointerId = -1;
  let minimapViewportGrabOffset = { x: 0, y: 0 };

  const isContainerReady = () => {
    const container = opts.getContainer();
    if (!container) return false;
    return container.clientWidth > 50 && container.clientHeight > 50;
  };

  const clampSize = (size: number): number => {
    const next = Math.floor(size);
    return Math.max(MIN_MINIMAP_SIZE, Math.min(MAX_MINIMAP_SIZE, next));
  };

  const clampPosition = (next: MinimapUiState): MinimapUiState => {
    const container = opts.getContainer();
    if (!container) return next;
    const width = next.size + MINIMAP_BAR_WIDTH;
    const height = next.size;
    const maxX = Math.max(0, container.clientWidth - width);
    const maxY = Math.max(0, container.clientHeight - height);
    return {
      ...next,
      x: Math.max(0, Math.min(maxX, next.x)),
      y: Math.max(0, Math.min(maxY, next.y)),
    };
  };

  const commitPrefs = () => {
    const ui = get(minimapUi);
    const prev = get(minimapPreferences);
    if (prev.x === ui.x && prev.y === ui.y && prev.size === ui.size) return;
    minimapPreferences.set({ x: ui.x, y: ui.y, size: ui.size });
  };

  const applyPrefs = (prefs: MinimapPreferences) => {
    const container = opts.getContainer();
    if (!container) return;
    const size = clampSize(prefs.size);

    if (!isContainerReady()) {
      pendingPrefs = prefs;
      minimapUi.set(clampPosition({ ...get(minimapUi), size }));
      requestUpdate();
      return;
    }
    pendingPrefs = null;

    let x = Number(prefs.x);
    let y = Number(prefs.y);
    const useDefault = !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0;
    if (useDefault) {
      x = container.clientWidth - (size + MINIMAP_BAR_WIDTH) - MINIMAP_MARGIN;
      y = container.clientHeight - size - MINIMAP_MARGIN;
    }

    minimapUi.set(clampPosition({ x, y, size }));
    requestUpdate();
  };

  const computeMinimap = () => {
    const container = opts.getContainer();
    const adapter = opts.getAdapter();
    if (!container || !adapter) return;
    const t = adapter.getViewportTransform();
    const k = Number(t.k ?? 1) || 1;
    const tx = Number(t.tx ?? 0) || 0;
    const ty = Number(t.ty ?? 0) || 0;

    const viewport = {
      x: -tx / k,
      y: -ty / k,
      width: container.clientWidth / k,
      height: container.clientHeight / k,
    };

    const nodes: MiniNode[] = [];
    const graphState = opts.getGraphState();
    for (const n of graphState.nodes ?? []) {
      const node = n as NodeInstance;
      const id = String(node?.id ?? '');
      if (!id) continue;

      const bounds = adapter.getNodeBounds(id);
      const width = bounds ? Math.max(1, bounds.right - bounds.left) : 230;
      const height = bounds ? Math.max(1, bounds.bottom - bounds.top) : 100;
      const x = bounds ? bounds.left : Number(node?.position?.x ?? 0) || 0;
      const y = bounds ? bounds.top : Number(node?.position?.y ?? 0) || 0;

      nodes.push({
        id,
        x,
        y,
        width,
        height,
        selected: id === opts.getSelectedNodeId(),
      });
    }

    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const connections: MiniConnection[] = [];
    const localLoopConnIds = opts.getLocalLoopConnIds();
    const deployedConnIds = opts.getDeployedConnIds();
    for (const c of graphState.connections ?? []) {
      const source = nodeById.get(String(c.sourceNodeId));
      const target = nodeById.get(String(c.targetNodeId));
      if (!source || !target) continue;
      const id = String(c.id);
      connections.push({
        id,
        x1: source.x + source.width,
        y1: source.y + source.height / 2,
        x2: target.x,
        y2: target.y + target.height / 2,
        localLoop: localLoopConnIds.has(id),
        deployedLoop: deployedConnIds.has(id),
      });
    }

    const hasNodes = nodes.length > 0;
    let minX = hasNodes ? (nodes[0]?.x ?? 0) : viewport.x;
    let minY = hasNodes ? (nodes[0]?.y ?? 0) : viewport.y;
    let maxX = hasNodes ? (nodes[0]?.x ?? 0) + (nodes[0]?.width ?? 0) : viewport.x + viewport.width;
    let maxY = hasNodes
      ? (nodes[0]?.y ?? 0) + (nodes[0]?.height ?? 0)
      : viewport.y + viewport.height;

    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    }

    minX = Math.min(minX, viewport.x);
    minY = Math.min(minY, viewport.y);
    maxX = Math.max(maxX, viewport.x + viewport.width);
    maxY = Math.max(maxY, viewport.y + viewport.height);

    const padding = 120;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);

    const size = get(minimapUi).size;
    const margin = 10;
    const extent = Math.max(width, height, 1);
    const scale = (size - margin * 2) / extent;
    const offsetX = (size - width * scale) / 2;
    const offsetY = (size - height * scale) / 2;

    minimap.set({
      size,
      nodes,
      connections,
      viewport,
      bounds: { minX, minY, width, height },
      scale,
      offsetX,
      offsetY,
    });
  };

  const requestUpdate = () => {
    if (typeof requestAnimationFrame === 'undefined') return;
    if (minimapRaf) return;
    minimapRaf = requestAnimationFrame(() => {
      minimapRaf = 0;
      computeMinimap();
    });
  };

  const zoom = (delta: number) => {
    const ui = get(minimapUi);
    const size = clampSize(ui.size + delta);
    minimapUi.set(clampPosition({ ...ui, size }));
    requestUpdate();
    commitPrefs();
  };

  const handlePointerDown = (event: PointerEvent) => {
    const container = opts.getContainer();
    const adapter = opts.getAdapter();
    if (!container || !adapter) return;
    event.preventDefault();
    event.stopPropagation();

    const el = event.currentTarget as HTMLElement | null;
    const rect = el?.getBoundingClientRect?.();
    if (!rect) return;
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;

    const m = get(minimap);
    const graphX = m.bounds.minX + (mx - m.offsetX) / m.scale;
    const graphY = m.bounds.minY + (my - m.offsetY) / m.scale;

    const viewportX = m.offsetX + (m.viewport.x - m.bounds.minX) * m.scale;
    const viewportY = m.offsetY + (m.viewport.y - m.bounds.minY) * m.scale;
    const viewportW = Math.max(4, m.viewport.width * m.scale);
    const viewportH = Math.max(4, m.viewport.height * m.scale);
    const hitSlop = 8;
    const hitViewport =
      mx >= viewportX - hitSlop &&
      mx <= viewportX + viewportW + hitSlop &&
      my >= viewportY - hitSlop &&
      my <= viewportY + viewportH + hitSlop;

    if (hitViewport) {
      isMinimapViewportDragging = true;
      minimapViewportPointerId = event.pointerId;

      const centerX = m.viewport.x + m.viewport.width / 2;
      const centerY = m.viewport.y + m.viewport.height / 2;
      minimapViewportGrabOffset = { x: graphX - centerX, y: graphY - centerY };

      try {
        el?.setPointerCapture?.(event.pointerId);
      } catch {
        // ignore
      }
      return;
    }

    const t = adapter.getViewportTransform();
    const k = Number(t.k ?? 1) || 1;
    const cx = container.clientWidth / 2;
    const cy = container.clientHeight / 2;
    adapter.setViewportTransform({ k, tx: cx - graphX * k, ty: cy - graphY * k });
    requestUpdate();
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!isMinimapViewportDragging) return;
    if (event.pointerId !== minimapViewportPointerId) return;
    if (event.pointerType === 'mouse' && event.buttons === 0) {
      isMinimapViewportDragging = false;
      minimapViewportPointerId = -1;
      requestUpdate();
      return;
    }
    const container = opts.getContainer();
    const adapter = opts.getAdapter();
    if (!container || !adapter) return;

    event.preventDefault();
    event.stopPropagation();

    const el = event.currentTarget as HTMLElement | null;
    const rect = el?.getBoundingClientRect?.();
    if (!rect) return;
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;

    const m = get(minimap);
    const graphX = m.bounds.minX + (mx - m.offsetX) / m.scale;
    const graphY = m.bounds.minY + (my - m.offsetY) / m.scale;

    const desiredCenterX = graphX - minimapViewportGrabOffset.x;
    const desiredCenterY = graphY - minimapViewportGrabOffset.y;

    const t = adapter.getViewportTransform();
    const k = Number(t.k ?? 1) || 1;
    const cx = container.clientWidth / 2;
    const cy = container.clientHeight / 2;
    adapter.setViewportTransform({ k, tx: cx - desiredCenterX * k, ty: cy - desiredCenterY * k });
    requestUpdate();
  };

  const handlePointerUp = (event: PointerEvent) => {
    if (!isMinimapViewportDragging) return;
    if (event.pointerId !== minimapViewportPointerId) return;
    isMinimapViewportDragging = false;
    minimapViewportPointerId = -1;
    requestUpdate();
  };

  const handleMovePointerDown = (event: PointerEvent) => {
    const container = opts.getContainer();
    if (!container) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const ui = get(minimapUi);
    isMinimapDragging = true;
    minimapDragPointerId = event.pointerId;
    minimapDragStart = {
      x: event.clientX,
      y: event.clientY,
      originX: ui.x,
      originY: ui.y,
    };
    const el = event.currentTarget as HTMLElement | null;
    try {
      el?.setPointerCapture?.(event.pointerId);
    } catch {
      // ignore
    }
  };

  const handleMovePointerMove = (event: PointerEvent) => {
    if (!isMinimapDragging) return;
    if (event.pointerId !== minimapDragPointerId) return;
    if (event.pointerType === 'mouse' && event.buttons === 0) {
      isMinimapDragging = false;
      minimapDragPointerId = -1;
      commitPrefs();
      return;
    }
    const dx = event.clientX - minimapDragStart.x;
    const dy = event.clientY - minimapDragStart.y;
    const ui = get(minimapUi);
    minimapUi.set(
      clampPosition({
        ...ui,
        x: minimapDragStart.originX + dx,
        y: minimapDragStart.originY + dy,
      })
    );
  };

  const handleMovePointerUp = (event: PointerEvent) => {
    if (!isMinimapDragging) return;
    if (event.pointerId !== minimapDragPointerId) return;
    isMinimapDragging = false;
    minimapDragPointerId = -1;
    commitPrefs();
  };

  const handleContainerResize = () => {
    if (!isContainerReady()) return;
    minimapUi.set(clampPosition(get(minimapUi)));
    if (pendingPrefs && isContainerReady()) {
      applyPrefs(pendingPrefs);
      pendingPrefs = null;
    } else {
      requestUpdate();
    }
  };

  prefsUnsub = minimapPreferences.subscribe((prefs) => {
    applyPrefs(prefs);
  });

  return {
    minimap,
    minimapUi,
    requestUpdate,
    zoom,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleMovePointerDown,
    handleMovePointerMove,
    handleMovePointerUp,
    handleContainerResize,
    destroy: () => {
      prefsUnsub?.();
      if (minimapRaf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(minimapRaf);
      minimapRaf = 0;
    },
  };
}
