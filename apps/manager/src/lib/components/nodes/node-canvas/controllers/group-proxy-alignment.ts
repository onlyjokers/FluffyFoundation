/**
 * Purpose: Align Group Proxy nodes against group frame boundaries.
 */
import type { GraphViewAdapter } from '../adapters';
import type { GroupFrame } from './group-types';

type AnyRecord = Record<string, unknown>;

export type GroupProxyAlignmentOptions = {
  frame: GroupFrame;
  proxyIds: string[];
  nodeById: Map<string, AnyRecord>;
  connections: AnyRecord[];
  adapter: Pick<GraphViewAdapter, 'getNodeBounds' | 'getNodePosition' | 'setNodePosition'>;
};

type ProxyItem = {
  id: string;
  direction: 'input' | 'output';
  pinned: boolean;
  desiredCenterY: number;
};

const PROXY_NODE_WIDTH = 48;
const PROXY_NODE_HALF_HEIGHT = 10;
const PROXY_MIN_SPACING = 20;
const PROXY_SOCKET_OUTSET = 10;
const PROXY_EDGE_NUDGE = 12;

export function alignGroupProxyNodes(options: GroupProxyAlignmentOptions): void {
  const { frame, proxyIds, nodeById, connections, adapter } = options;
  if (proxyIds.length === 0) return;

  const centerY = frame.top + frame.height / 2;
  const isMinimized = Boolean(frame.group?.minimized);
  const { minCenterY, maxCenterY } = computeVerticalRange(frame, centerY, isMinimized);
  const clampCenterY = (y: number) => {
    if (!Number.isFinite(y)) return centerY;
    if (!Number.isFinite(minCenterY) || !Number.isFinite(maxCenterY) || maxCenterY <= minCenterY) return centerY;
    return Math.max(minCenterY, Math.min(maxCenterY, y));
  };

  const nodeCenterY = (nodeId: string) => {
    const b = adapter.getNodeBounds(String(nodeId));
    if (b) return (b.top + b.bottom) / 2;
    const pos = adapter.getNodePosition(String(nodeId));
    return pos ? pos.y : centerY;
  };

  const inputSide: ProxyItem[] = [];
  const outputSide: ProxyItem[] = [];

  for (const proxyIdRaw of proxyIds) {
    const proxyId = String(proxyIdRaw ?? '');
    if (!proxyId) continue;
    const proxyNode = nodeById.get(proxyId);
    if (!proxyNode) continue;
    const item = buildProxyItem(proxyId, proxyNode, connections, adapter, nodeCenterY, centerY, clampCenterY);
    if (item.direction === 'input') inputSide.push(item);
    else outputSide.push(item);
  }

  distributeProxyItems(inputSide, minCenterY, maxCenterY, clampCenterY);
  distributeProxyItems(outputSide, minCenterY, maxCenterY, clampCenterY);
  applyProxyPositions([...inputSide, ...outputSide], frame, isMinimized, adapter);
}

function computeVerticalRange(frame: GroupFrame, centerY: number, isMinimized: boolean) {
  const minimizedHeaderHeight = 44;
  const minimizedRowHeight = 28;
  const minimizedPad = 6;
  const pad = (() => {
    const h = Number(frame.height ?? 0);
    if (!Number.isFinite(h) || h <= 0) return 56;
    const halfMinus = Math.max(0, h / 2 - 18);
    return Math.max(24, Math.min(56, halfMinus));
  })();

  return {
    minCenterY: isMinimized ? frame.top + minimizedHeaderHeight + minimizedPad + minimizedRowHeight / 2 : frame.top + pad,
    maxCenterY: isMinimized ? frame.top + frame.height - minimizedPad - minimizedRowHeight / 2 : frame.top + frame.height - pad,
    centerY,
  };
}

function buildProxyItem(
  proxyId: string,
  proxyNode: AnyRecord,
  connections: AnyRecord[],
  adapter: Pick<GraphViewAdapter, 'getNodePosition'>,
  nodeCenterY: (nodeId: string) => number,
  centerY: number,
  clampCenterY: (y: number) => number
): ProxyItem {
  const direction = String(proxyNode?.config?.direction ?? 'output') === 'input' ? 'input' : 'output';
  const pinned = Boolean(proxyNode?.config?.pinned);
  const cur = adapter.getNodePosition(proxyId);
  const curCenterY = cur ? cur.y + PROXY_NODE_HALF_HEIGHT : centerY;
  let desiredCenterY = centerY;

  if (pinned) {
    desiredCenterY = curCenterY;
  } else if (direction === 'input') {
    const internal = connections.filter((c) => String(c.sourceNodeId) === proxyId && String(c.sourcePortId) === 'out');
    desiredCenterY =
      internal.length > 0
        ? internal.map((c) => nodeCenterY(String(c.targetNodeId))).reduce((sum, y) => sum + y, 0) / internal.length
        : curCenterY;
  } else {
    const internal = connections.find((c) => String(c.targetNodeId) === proxyId && String(c.targetPortId) === 'in');
    desiredCenterY = internal ? nodeCenterY(String(internal.sourceNodeId)) : curCenterY;
  }

  return { id: proxyId, direction, pinned, desiredCenterY: clampCenterY(desiredCenterY) };
}

function distributeProxyItems(
  items: ProxyItem[],
  minCenterY: number,
  maxCenterY: number,
  clampCenterY: (y: number) => number
): void {
  if (items.length <= 1) return;

  const available = maxCenterY - minCenterY;
  const maxSpacing = available / (items.length - 1);
  const spacing = Math.max(14, Math.min(PROXY_MIN_SPACING, maxSpacing));
  items.sort((a, b) => a.desiredCenterY - b.desiredCenterY || a.id.localeCompare(b.id));
  const ys = items.map((item) => clampCenterY(item.desiredCenterY));

  for (let i = 1; i < ys.length; i += 1) ys[i] = Math.max(ys[i], ys[i - 1] + spacing);

  const overflow = ys[ys.length - 1] - maxCenterY;
  if (overflow > 0) {
    for (let i = 0; i < ys.length; i += 1) ys[i] -= overflow;
    for (let i = ys.length - 2; i >= 0; i -= 1) ys[i] = Math.min(ys[i], ys[i + 1] - spacing);
    const underflow = minCenterY - ys[0];
    if (underflow > 0) for (let i = 0; i < ys.length; i += 1) ys[i] += underflow;
  }

  for (let i = 0; i < items.length; i += 1) items[i].desiredCenterY = clampCenterY(ys[i]);
}

function applyProxyPositions(
  items: ProxyItem[],
  frame: GroupFrame,
  isMinimized: boolean,
  adapter: Pick<GraphViewAdapter, 'getNodePosition' | 'setNodePosition'>
): void {
  const right = frame.left + frame.width;
  for (const item of items) {
    const desiredX = isMinimized
      ? item.direction === 'input'
        ? frame.left - PROXY_SOCKET_OUTSET
        : right + PROXY_SOCKET_OUTSET - PROXY_NODE_WIDTH
      : item.direction === 'input'
        ? frame.left - PROXY_NODE_WIDTH / 2 - PROXY_EDGE_NUDGE
        : right - PROXY_NODE_WIDTH / 2 + PROXY_EDGE_NUDGE;
    const topLeftY = item.desiredCenterY - PROXY_NODE_HALF_HEIGHT;
    const cur = adapter.getNodePosition(item.id);
    if (!cur || Math.abs(cur.x - desiredX) > 1 || Math.abs(cur.y - topLeftY) > 1) {
      adapter.setNodePosition(item.id, desiredX, topLeftY);
    }
  }
}
