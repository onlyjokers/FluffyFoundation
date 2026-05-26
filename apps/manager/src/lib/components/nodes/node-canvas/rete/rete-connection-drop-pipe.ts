// Connection-pick/drop pipe for group gate, group proxy, and socket snapping behavior.
import { get } from 'svelte/store';
import type { Readable } from 'svelte/store';

import type { Connection as EngineConnection } from '$lib/nodes/types';
import { asRecord, getString } from '$lib/utils/value-guards';
import type { SocketData } from '../controllers/picker-controller';

type ReteConnectionDropPipeOptions = {
  getLastPointerClient: () => { x: number; y: number };
  setConnectDraggingSocket: (socket: SocketData | null) => void;
  setGroupEdgeHighlight: (highlight: { groupId: string; side: 'input' | 'output' } | null) => void;
  groupEdgeFinder: {
    findGroupProxyEdgeTargetAt: (clientX: number, clientY: number) => {
      groupId: string;
      side: 'input' | 'output';
      frame: {
        left?: number;
        top?: number;
        width?: number;
        height?: number;
        group?: { minimized?: boolean };
      };
    } | null;
    findGroupFrameForNodeAt?: (
      nodeId: string,
      clientX: number,
      clientY: number
    ) => {
      groupId: string;
      side: 'input' | 'output';
      frame: {
        left?: number;
        top?: number;
        width?: number;
        height?: number;
        group?: { minimized?: boolean };
      };
    } | null;
    findGroupFrameForNode?: (
      nodeId: string,
      side: 'input' | 'output'
    ) => {
      groupId: string;
      side: 'input' | 'output';
      frame: {
        left?: number;
        top?: number;
        width?: number;
        height?: number;
        group?: { minimized?: boolean };
      };
    } | null;
    findGroupFrameAt?: (
      clientX: number,
      clientY: number,
      side: 'input' | 'output'
    ) => {
      groupId: string;
      side: 'input' | 'output';
      frame: {
        left?: number;
        top?: number;
        width?: number;
        height?: number;
        group?: { minimized?: boolean };
      };
    } | null;
    findGroupGateTargetAt: (clientX: number, clientY: number) => { groupId: string } | null;
  };
  groupController: {
    nodeGroups: Readable<Array<{ id?: string; nodeIds?: unknown[] }>>;
  };
  nodeEngine: {
    exportGraph: () => {
      nodes?: Array<{ id?: string; type?: string; config?: unknown }>;
      connections?: Array<{
        id?: string;
        sourceNodeId?: string;
        sourcePortId?: string;
        targetNodeId?: string;
        targetPortId?: string;
      }>;
    };
    getNode: (nodeId: string) => { type?: string; config?: unknown } | null | undefined;
    lastError: { set: (message: string) => void };
  };
  nodeRegistry: {
    get: (
      type: string
    ) =>
      | {
          inputs?: Array<{ id?: string; type?: string }>;
          outputs?: Array<{ id?: string; type?: string }>;
        }
      | null
      | undefined;
  };
  canvasCommands: {
    connect: (connection: EngineConnection) => unknown;
    disconnect?: (connectionId: string) => unknown;
  };
  groupPortNodesController: {
    scheduleAlign: () => void;
    scheduleNormalizeProxies: () => void;
  };
  computeGraphPosition: (clientX: number, clientY: number) => { x: number; y: number };
  addNode: (
    type: string,
    position?: { x: number; y: number },
    configPatch?: Record<string, unknown>
  ) => string | undefined;
  findPortRowSocketAt: (
    clientX: number,
    clientY: number,
    desiredSide: 'input' | 'output'
  ) => SocketData | null;
  openConnectPicker: (socket: SocketData) => void;
  isProjectionId?: (id: string) => boolean;
  translateProjectionConnection?: (connection: EngineConnection) => EngineConnection | null;
};

const validPortTypes = new Set([
  'number',
  'boolean',
  'pulse',
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

const connectionId = () => `conn-${crypto.randomUUID?.() ?? Date.now()}`;

export function createReteConnectionDropPipe(options: ReteConnectionDropPipeOptions) {
  const isProjectionId = options.isProjectionId ?? (() => false);

  const resolveTypeForSocket = (sock: SocketData) => {
    const node = options.nodeEngine.getNode(String(sock.nodeId));
    if (!node) return 'any';
    if (node.type === 'group-proxy') {
      const raw = getString(asRecord(node.config).portType, '');
      const t = raw ? raw : '';
      return validPortTypes.has(t) ? t : 'any';
    }
    const def = options.nodeRegistry.get(String(node.type ?? ''));
    const ports = sock.side === 'input' ? def?.inputs : def?.outputs;
    const port = (ports ?? []).find((p) => String(p.id) === String(sock.key));
    const t = String(port?.type ?? 'any');
    return validPortTypes.has(t) ? t : 'any';
  };

  const handleConnectionDrop = (ctx: { type?: string; data?: unknown }) => {
    const ctxData = asRecord(ctx.data);
    options.setConnectDraggingSocket(null);
    options.setGroupEdgeHighlight(null);

    const initial = asRecord(ctxData.initial);
    const socket = asRecord(ctxData.socket);
    const created = Boolean(ctxData.created);
    const initialNodeId = getString(initial.nodeId, '');
    const initialSide = getString(initial.side, '');
    const initialKey = getString(initial.key, '');
    const socketProvided = Object.keys(socket).length > 0;
    if (!initialNodeId || !initialKey || (initialSide !== 'input' && initialSide !== 'output')) {
      return ctx;
    }

    const initialSocket: SocketData = {
      nodeId: initialNodeId,
      side: initialSide,
      key: initialKey,
    };
    const pointer = options.getLastPointerClient();
    const droppedSocket: SocketData | null = socketProvided
      ? {
          nodeId: getString(socket.nodeId, ''),
          side: getString(socket.side, '') as 'input' | 'output',
          key: getString(socket.key, ''),
        }
      : null;
    const hasValidDroppedSocket =
      droppedSocket &&
      droppedSocket.nodeId &&
      droppedSocket.key &&
      (droppedSocket.side === 'input' || droppedSocket.side === 'output');
    const directCreatedConnection =
      created && hasValidDroppedSocket
        ? initialSocket.side === 'output' && droppedSocket.side === 'input'
          ? {
              sourceNodeId: initialSocket.nodeId,
              sourcePortId: initialSocket.key,
              targetNodeId: droppedSocket.nodeId,
              targetPortId: droppedSocket.key,
            }
          : initialSocket.side === 'input' && droppedSocket.side === 'output'
            ? {
                sourceNodeId: droppedSocket.nodeId,
                sourcePortId: droppedSocket.key,
                targetNodeId: initialSocket.nodeId,
                targetPortId: initialSocket.key,
              }
            : null
        : null;

    const gateTarget = options.groupEdgeFinder.findGroupGateTargetAt(pointer.x, pointer.y);
    if (gateTarget && initialSocket.side === 'output') {
      const group =
        get(options.groupController.nodeGroups).find((g) => String(g.id) === gateTarget.groupId) ??
        null;
      if (group && (group.nodeIds ?? []).some((id) => String(id) === initialSocket.nodeId)) {
        options.nodeEngine.lastError.set('Group gate input cannot originate from inside the group.');
        return ctx;
      }

      const state = options.nodeEngine.exportGraph();
      const gateNodeId =
        state.nodes?.find(
          (n) =>
            String(n.type) === 'group-gate' &&
            getString(asRecord(n.config).groupId, '') === gateTarget.groupId
        )?.id ?? '';
      if (gateNodeId) {
        options.canvasCommands.connect({
          id: connectionId(),
          sourceNodeId: initialSocket.nodeId,
          sourcePortId: initialSocket.key,
          targetNodeId: String(gateNodeId),
          targetPortId: 'active',
        });
        options.groupPortNodesController.scheduleNormalizeProxies();
        return ctx;
      }
    }

    const explicitEdgeTarget =
      !created && !socketProvided
        ? options.groupEdgeFinder.findGroupProxyEdgeTargetAt(pointer.x, pointer.y)
        : null;
    const groupExitTarget =
      initialSocket.side === 'output'
        ? (options.groupEdgeFinder.findGroupFrameForNodeAt?.(
            initialSocket.nodeId,
            pointer.x,
            pointer.y
          ) ?? null)
        : null;
    const groupEntryTarget =
      directCreatedConnection && hasValidDroppedSocket && droppedSocket?.side === 'input'
        ? (options.groupEdgeFinder.findGroupFrameForNode?.(droppedSocket.nodeId, 'input') ?? null)
        : null;
    const groupInteriorInputTarget =
      !created && !socketProvided && initialSocket.side === 'output'
        ? (options.groupEdgeFinder.findGroupFrameAt?.(pointer.x, pointer.y, 'input') ?? null)
        : null;
    const edgeTarget =
      explicitEdgeTarget ?? groupExitTarget ?? groupEntryTarget ?? groupInteriorInputTarget;
    if (edgeTarget) {
      const frame = edgeTarget.frame;
      const groupId = edgeTarget.groupId;
      const direction = edgeTarget.side === 'input' ? 'input' : 'output';
      const graphPos = options.computeGraphPosition(pointer.x, pointer.y);
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
      const proxyPortSource =
        edgeTarget.side === 'input' && hasValidDroppedSocket && droppedSocket
          ? droppedSocket
          : initialSocket;
      const portType = resolveTypeForSocket(proxyPortSource);

      const proxyId = options.addNode(
        'group-proxy',
        { x, y: y - 10 },
        { groupId, direction, portType, pinned: true }
      );
      if (proxyId) {
        if (directCreatedConnection) {
          const graph = options.nodeEngine.exportGraph();
          const directConnectionId =
            (graph.connections ?? []).find(
              (conn) =>
                String(conn.sourceNodeId) === directCreatedConnection.sourceNodeId &&
                String(conn.sourcePortId) === directCreatedConnection.sourcePortId &&
                String(conn.targetNodeId) === directCreatedConnection.targetNodeId &&
                String(conn.targetPortId) === directCreatedConnection.targetPortId
            )?.id ?? '';
          if (directConnectionId) {
            options.canvasCommands.disconnect?.(String(directConnectionId));
          }
        }
        const conn: EngineConnection =
          initialSocket.side === 'output'
            ? {
                id: connectionId(),
                sourceNodeId: initialSocket.nodeId,
                sourcePortId: initialSocket.key,
                targetNodeId: proxyId,
                targetPortId: 'in',
              }
            : {
                id: connectionId(),
                sourceNodeId: proxyId,
                sourcePortId: 'out',
                targetNodeId: initialSocket.nodeId,
                targetPortId: initialSocket.key,
              };
        const isProjectionConnection =
          isProjectionId(conn.sourceNodeId) || isProjectionId(conn.targetNodeId);
        const connectionToCreate = isProjectionConnection
          ? (options.translateProjectionConnection?.(conn) ?? null)
          : conn;
        if (
          connectionToCreate &&
          !isProjectionId(connectionToCreate.sourceNodeId) &&
          !isProjectionId(connectionToCreate.targetNodeId)
        ) {
          options.canvasCommands.connect(connectionToCreate);
        }
        const desiredSide = initialSocket.side === 'output' ? 'input' : 'output';
        const snapped =
          hasValidDroppedSocket && droppedSocket?.side === desiredSide
            ? droppedSocket
            : options.findPortRowSocketAt(pointer.x, pointer.y, desiredSide);
        if (
          snapped &&
          initialSocket.side === 'output' &&
          snapped.side === 'input' &&
          String(snapped.nodeId) !== String(proxyId) &&
          !isProjectionId(proxyId) &&
          !isProjectionId(snapped.nodeId)
        ) {
          options.canvasCommands.connect({
            id: connectionId(),
            sourceNodeId: proxyId,
            sourcePortId: 'out',
            targetNodeId: snapped.nodeId,
            targetPortId: snapped.key,
          });
        }
        if (
          snapped &&
          initialSocket.side === 'input' &&
          snapped.side === 'output' &&
          String(snapped.nodeId) !== String(proxyId) &&
          !isProjectionId(proxyId) &&
          !isProjectionId(snapped.nodeId)
        ) {
          options.canvasCommands.connect({
            id: connectionId(),
            sourceNodeId: snapped.nodeId,
            sourcePortId: snapped.key,
            targetNodeId: proxyId,
            targetPortId: 'in',
          });
        }
        options.groupPortNodesController.scheduleAlign();
        options.groupPortNodesController.scheduleNormalizeProxies();
        return ctx;
      }
      options.groupPortNodesController.scheduleAlign();
      options.groupPortNodesController.scheduleNormalizeProxies();
      return ctx;
    }

    if (created || socketProvided) {
      return ctx;
    }

    const desiredSide = initialSocket.side === 'output' ? 'input' : 'output';
    const snapped = options.findPortRowSocketAt(pointer.x, pointer.y, desiredSide);
    if (snapped) {
      const engineConn: EngineConnection =
        initialSocket.side === 'output'
          ? {
              id: connectionId(),
              sourceNodeId: initialSocket.nodeId,
              sourcePortId: initialSocket.key,
              targetNodeId: snapped.nodeId,
              targetPortId: snapped.key,
            }
          : {
              id: connectionId(),
              sourceNodeId: snapped.nodeId,
              sourcePortId: snapped.key,
              targetNodeId: initialSocket.nodeId,
              targetPortId: initialSocket.key,
            };
      const connectionToCreate = isProjectionId(snapped.nodeId)
        ? (options.translateProjectionConnection?.(engineConn) ?? null)
        : engineConn;
      if (!connectionToCreate) {
        return ctx;
      }
      options.canvasCommands.connect(connectionToCreate);
      options.groupPortNodesController.scheduleNormalizeProxies();
    } else {
      options.openConnectPicker(initialSocket);
    }

    return ctx;
  };

  return (ctx: { type?: string; data?: unknown }) => {
    const ctxData = asRecord(ctx.data);
    if (ctx?.type === 'connectionpick') {
      const sock = asRecord(ctxData.socket);
      const nodeId = getString(sock.nodeId, '');
      const sideRaw = getString(sock.side, '');
      const key = getString(sock.key, '');
      if (nodeId && key && (sideRaw === 'input' || sideRaw === 'output')) {
        options.setConnectDraggingSocket({ nodeId, side: sideRaw, key });
        const pointer = options.getLastPointerClient();
        const edge = options.groupEdgeFinder.findGroupProxyEdgeTargetAt(pointer.x, pointer.y);
        options.setGroupEdgeHighlight(edge ? { groupId: edge.groupId, side: edge.side } : null);
      }
    }
    if (ctx?.type === 'connectiondrop') return handleConnectionDrop(ctx);
    return ctx;
  };
}
