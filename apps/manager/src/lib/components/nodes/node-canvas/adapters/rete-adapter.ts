/**
 * ReteAdapter - GraphViewAdapter implementation for Rete.js renderer.
 *
 * Wraps existing Rete areaPlugin, nodeViews, and connectionMap to provide
 * a renderer-agnostic interface for controllers.
 */
import type { BaseSchemes } from 'rete';
import type { AreaPlugin } from 'rete-area-plugin';
import type {
  GraphViewAdapter,
  ViewportTransform,
  NodeBounds,
  NodeVisualState,
  ConnectionVisualState,
} from './graph-view-adapter';
import { normalizeAreaTransform } from '../utils/view-utils';

type AnyAreaPlugin = AreaPlugin<BaseSchemes, unknown>;
type AnyRecord = Record<string, unknown>;

export interface ReteAdapterOptions {
  getContainer: () => HTMLDivElement | null;
  getAreaPlugin: () => AnyAreaPlugin | null;
  getNodeMap: () => Map<string, AnyRecord>;
  getConnectionMap: () => Map<string, AnyRecord>;
  requestFramesUpdate: () => void;
}

export function createReteAdapter(opts: ReteAdapterOptions): GraphViewAdapter {
  const { getContainer, getAreaPlugin, getNodeMap, getConnectionMap, requestFramesUpdate } = opts;

  const arraysEqual = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((v, i) => v === b[i]);

  const normalizeStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    const next = value.map((v) => String(v)).filter(Boolean);
    next.sort();
    return next;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Viewport
  // ─────────────────────────────────────────────────────────────────────────────

  const getViewportTransform = (): ViewportTransform => {
    const areaPlugin = getAreaPlugin();
    if (!areaPlugin?.area) return { k: 1, tx: 0, ty: 0 };
    const area = areaPlugin.area;
    normalizeAreaTransform(area);
    return {
      k: Number(area.transform?.k ?? 1) || 1,
      tx: Number(area.transform?.x ?? 0) || 0,
      ty: Number(area.transform?.y ?? 0) || 0,
    };
  };

  const setViewportTransform = (transform: ViewportTransform): void => {
    const areaPlugin = getAreaPlugin();
    const area = areaPlugin?.area;
    if (!area) return;
    area.transform = { k: transform.k, x: transform.tx, y: transform.ty };
    // Force area update (update() is private in Rete types)
    (area as { update?: () => void }).update?.();
    requestFramesUpdate();
  };

  const zoomToNodes = async (nodeIds: string[]): Promise<void> => {
    const areaPlugin = getAreaPlugin();
    if (!areaPlugin) return;
    const nodeMap = getNodeMap();
    const nodes = nodeIds.map((id) => nodeMap.get(id)).filter(Boolean);
    if (nodes.length === 0) return;

    // Use Rete's zoomAt extension if available
    try {
      const { AreaExtensions } = await import('rete-area-plugin');
      await AreaExtensions.zoomAt(areaPlugin, nodes);
      requestFramesUpdate();
    } catch {
      // Fallback: do nothing
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Node Position & Bounds
  // ─────────────────────────────────────────────────────────────────────────────

  const getNodePosition = (nodeId: string): { x: number; y: number } | null => {
    const areaPlugin = getAreaPlugin();
    if (!areaPlugin?.nodeViews) return null;
    const view = areaPlugin.nodeViews.get(String(nodeId));
    const pos = view?.position as { x: number; y: number } | undefined;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return null;
    return { x: pos.x, y: pos.y };
  };

  const setNodePosition = (nodeId: string, x: number, y: number): void => {
    const areaPlugin = getAreaPlugin();
    if (!areaPlugin?.nodeViews) return;
    const view = areaPlugin.nodeViews.get(String(nodeId));
    if (!view) return;
    void areaPlugin.translate(nodeId, { x, y });
    requestFramesUpdate();
  };

  const getNodeBounds = (nodeId: string): NodeBounds | null => {
    const areaPlugin = getAreaPlugin();
    if (!areaPlugin?.nodeViews) return null;
    const view = areaPlugin.nodeViews.get(String(nodeId));
    const el = view?.element as HTMLElement | undefined;
    const pos = view?.position as { x: number; y: number } | undefined;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return null;

    const width = el?.clientWidth ?? 230;
    const height = el?.clientHeight ?? 100;
    return { left: pos.x, top: pos.y, right: pos.x + width, bottom: pos.y + height };
  };

  const translateNodes = (nodeIds: string[], dx: number, dy: number): void => {
    const areaPlugin = getAreaPlugin();
    if (!areaPlugin?.nodeViews) return;

    for (const nodeId of nodeIds) {
      const pos = getNodePosition(nodeId);
      if (!pos) continue;
      void areaPlugin.translate(nodeId, { x: pos.x + dx, y: pos.y + dy });
    }
    requestFramesUpdate();
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Visual State
  // ─────────────────────────────────────────────────────────────────────────────

  const getNodeVisualState = (nodeId: string): NodeVisualState | null => {
    const node = getNodeMap().get(String(nodeId));
    if (!node) return null;
    return {
      selected: Boolean((node as AnyRecord).selected),
      collapsed: Boolean((node as AnyRecord).collapsed),
      hidden: Boolean((node as AnyRecord).hidden),
      groupMinimized: Boolean((node as AnyRecord).groupMinimized),
      groupDisabled: Boolean((node as AnyRecord).groupDisabled),
      groupSelected: Boolean((node as AnyRecord).groupSelected),
      localLoop: Boolean((node as AnyRecord).localLoop),
      deployedLoop: Boolean((node as AnyRecord).deployedLoop),
      deployedPatch: Boolean((node as AnyRecord).deployedPatch),
      stopped: Boolean((node as AnyRecord).stopped),
      active: Boolean((node as AnyRecord).active),
      activeInputs: normalizeStringArray((node as AnyRecord).activeInputs),
      activeOutputs: normalizeStringArray((node as AnyRecord).activeOutputs),
    };
  };

  const setNodeVisualState = async (nodeId: string, patch: Partial<NodeVisualState>): Promise<void> => {
    const areaPlugin = getAreaPlugin();
    if (!areaPlugin) return;

    const node = getNodeMap().get(String(nodeId));
    if (!node) return;

    let changed = false;

    if ('collapsed' in patch) {
      const next = Boolean(patch.collapsed);
      if (Boolean((node as AnyRecord).collapsed) !== next) {
        (node as AnyRecord).collapsed = next;
        changed = true;
      }
    }

    if ('hidden' in patch) {
      const next = Boolean(patch.hidden);
      if (Boolean((node as AnyRecord).hidden) !== next) {
        (node as AnyRecord).hidden = next;
        changed = true;
      }
    }

    if ('selected' in patch) {
      const next = Boolean(patch.selected);
      if (Boolean((node as AnyRecord).selected) !== next) {
        (node as AnyRecord).selected = next;
        changed = true;
      }
    }

    if ('groupDisabled' in patch) {
      const next = Boolean(patch.groupDisabled);
      if (Boolean((node as AnyRecord).groupDisabled) !== next) {
        (node as AnyRecord).groupDisabled = next;
        changed = true;
      }
    }

    if ('groupSelected' in patch) {
      const next = Boolean(patch.groupSelected);
      if (Boolean((node as AnyRecord).groupSelected) !== next) {
        (node as AnyRecord).groupSelected = next;
        changed = true;
      }
    }

    if ('groupMinimized' in patch) {
      const next = Boolean(patch.groupMinimized);
      if (Boolean((node as AnyRecord).groupMinimized) !== next) {
        (node as AnyRecord).groupMinimized = next;
        changed = true;
      }
    }

    if ('localLoop' in patch) {
      const next = Boolean(patch.localLoop);
      if (Boolean((node as AnyRecord).localLoop) !== next) {
        (node as AnyRecord).localLoop = next;
        changed = true;
      }
    }

    if ('deployedLoop' in patch) {
      const next = Boolean(patch.deployedLoop);
      if (Boolean((node as AnyRecord).deployedLoop) !== next) {
        (node as AnyRecord).deployedLoop = next;
        changed = true;
      }
    }

    if ('deployedPatch' in patch) {
      const next = Boolean(patch.deployedPatch);
      if (Boolean((node as AnyRecord).deployedPatch) !== next) {
        (node as AnyRecord).deployedPatch = next;
        changed = true;
      }
    }

    if ('stopped' in patch) {
      const next = Boolean(patch.stopped);
      if (Boolean((node as AnyRecord).stopped) !== next) {
        (node as AnyRecord).stopped = next;
        changed = true;
      }
    }

    if ('active' in patch) {
      const next = Boolean(patch.active);
      if (Boolean((node as AnyRecord).active) !== next) {
        (node as AnyRecord).active = next;
        changed = true;
      }
    }

    if ('activeInputs' in patch) {
      const next = normalizeStringArray(patch.activeInputs);
      const prev = normalizeStringArray((node as AnyRecord).activeInputs);
      if (!arraysEqual(prev, next)) {
        (node as AnyRecord).activeInputs = next;
        changed = true;
      }
    }

    if ('activeOutputs' in patch) {
      const next = normalizeStringArray(patch.activeOutputs);
      const prev = normalizeStringArray((node as AnyRecord).activeOutputs);
      if (!arraysEqual(prev, next)) {
        (node as AnyRecord).activeOutputs = next;
        changed = true;
      }
    }

    if (changed) await areaPlugin.update('node', String(nodeId));
  };

  const getConnectionVisualState = (connId: string): ConnectionVisualState | null => {
    const conn = getConnectionMap().get(String(connId));
    if (!conn) return null;
    return {
      hidden: Boolean((conn as AnyRecord).hidden),
      localLoop: Boolean((conn as AnyRecord).localLoop),
      deployedLoop: Boolean((conn as AnyRecord).deployedLoop),
      active: Boolean((conn as AnyRecord).active),
    };
  };

  const setConnectionVisualState = async (
    connId: string,
    patch: Partial<ConnectionVisualState>
  ): Promise<void> => {
    const areaPlugin = getAreaPlugin();
    if (!areaPlugin) return;

    const conn = getConnectionMap().get(String(connId));
    if (!conn) return;

    let changed = false;

    if ('hidden' in patch) {
      const next = Boolean(patch.hidden);
      if (Boolean((conn as AnyRecord).hidden) !== next) {
        (conn as AnyRecord).hidden = next;
        changed = true;
      }
    }

    if ('localLoop' in patch) {
      const next = Boolean(patch.localLoop);
      if (Boolean((conn as AnyRecord).localLoop) !== next) {
        (conn as AnyRecord).localLoop = next;
        changed = true;
      }
    }

    if ('deployedLoop' in patch) {
      const next = Boolean(patch.deployedLoop);
      if (Boolean((conn as AnyRecord).deployedLoop) !== next) {
        (conn as AnyRecord).deployedLoop = next;
        changed = true;
      }
    }

    if ('active' in patch) {
      const next = Boolean(patch.active);
      if (Boolean((conn as AnyRecord).active) !== next) {
        (conn as AnyRecord).active = next;
        changed = true;
      }
    }

    if (changed) await areaPlugin.update('connection', String(connId));
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Hit Testing
  // ─────────────────────────────────────────────────────────────────────────────

  const getNodesInRect = (rect: NodeBounds): string[] => {
    const areaPlugin = getAreaPlugin();
    if (!areaPlugin?.nodeViews) return [];

    const result: string[] = [];
    for (const [nodeId] of areaPlugin.nodeViews) {
      const bounds = getNodeBounds(nodeId);
      if (!bounds) continue;

      // Check intersection
      const intersects =
        bounds.left < rect.right && bounds.right > rect.left && bounds.top < rect.bottom && bounds.bottom > rect.top;

      if (intersects) {
        result.push(nodeId);
      }
    }
    return result;
  };

  const clientToGraph = (clientX: number, clientY: number): { x: number; y: number } => {
    const container = getContainer();
    const t = getViewportTransform();
    if (!container) return { x: 0, y: 0 };

    const rect = container.getBoundingClientRect();
    const x = (clientX - rect.left - t.tx) / t.k;
    const y = (clientY - rect.top - t.ty) / t.k;
    return { x, y };
  };

  const graphToClient = (graphX: number, graphY: number): { x: number; y: number } => {
    const container = getContainer();
    const t = getViewportTransform();
    if (!container) return { x: 0, y: 0 };

    const rect = container.getBoundingClientRect();
    const x = graphX * t.k + t.tx + rect.left;
    const y = graphY * t.k + t.ty + rect.top;
    return { x, y };
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Return adapter
  // ─────────────────────────────────────────────────────────────────────────────

  return {
    getViewportTransform,
    setViewportTransform,
    zoomToNodes,
    getNodePosition,
    setNodePosition,
    getNodeBounds,
    translateNodes,
    getNodeVisualState,
    setNodeVisualState,
    getConnectionVisualState,
    setConnectionVisualState,
    getNodesInRect,
    clientToGraph,
    graphToClient,
    requestUpdate: requestFramesUpdate,
    getContainer,
  };
}
