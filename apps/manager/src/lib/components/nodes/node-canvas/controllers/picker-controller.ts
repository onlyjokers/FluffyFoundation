/**
 * Purpose: Node picker controller (add/connect) for the node canvas.
 */
import { derived, get, writable, type Readable } from 'svelte/store';
import { tick } from 'svelte';
import type { NodeRegistry } from '@shugu/node-core';
import type { Connection as EngineConnection, GraphState, NodeInstance, NodePort, PortType } from '$lib/nodes/types';
import { CUSTOM_NODE_TYPE_PREFIX } from '$lib/nodes/custom-nodes/store';
import { readCustomNodeState } from '$lib/nodes/custom-nodes/instance';

export type PickerMode = 'add' | 'connect';
export type SocketData = { nodeId: string; side: 'input' | 'output'; key: string };

export type PickerItem = {
  type: string;
  label: string;
  category: string;
  matchPort?: { id: string; label: string; side: 'input' | 'output'; type: PortType };
};

type UsageEntry = { count: number; lastUsed: number };
type UsageMap = Record<string, UsageEntry>;

type PickerControllerOptions = {
  nodeRegistry: NodeRegistry;
  getContainer: () => HTMLDivElement | null;
  computeGraphPosition: (clientX: number, clientY: number) => { x: number; y: number };
  getLastPointerClient: () => { x: number; y: number };
  getPortDefForSocket: (socket: SocketData) => NodePort | null;
  bestMatchingPort: (ports: NodePort[], requiredType: PortType, side: 'input' | 'output') => NodePort | null;
  addNode: (type: string, position?: { x: number; y: number }) => string | undefined;
  addConnection: (conn: EngineConnection) => void;
  graphStateStore: Readable<GraphState>;
};

const PICKER_HISTORY_KEY = 'shugu.nodePickerHistory.v1';

const normalizeSearchQuery = (raw: string): string => {
  const q = raw.trim().toLowerCase();
  if (!q) return '';
  // Common typos to make search forgiving (e.g. "Bollean" -> "Boolean").
  return q.replace(/bollean/g, 'boolean').replace(/boolen/g, 'boolean').replace(/bolean/g, 'boolean');
};

const readUsageMap = (): UsageMap => {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(PICKER_HISTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as UsageMap;
  } catch {
    return {};
  }
};

const writeUsageMap = (next: UsageMap) => {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PICKER_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
};

export function createPickerController(opts: PickerControllerOptions) {
  const isOpen = writable(false);
  const mode = writable<PickerMode>('add');
  const anchor = writable({ x: 0, y: 0 });
  const graphPos = writable({ x: 0, y: 0 });
  const selectedCategory = writable('Objects');
  const query = writable('');
  const initialSocket = writable<SocketData | null>(null);
  const usageMap = writable<UsageMap>(readUsageMap());

  let pickerElement: HTMLDivElement | null = null;
  let lastConnectPickerOpenedAt = 0;

  const itemsByCategory = derived(
    [mode, query, initialSocket, opts.graphStateStore],
    ([$mode, $query, $initialSocket, $graphState]) => {
    const map = new Map<string, PickerItem[]>();
    const q = normalizeSearchQuery($query);
    const nodes = Array.isArray($graphState?.nodes) ? ($graphState.nodes as NodeInstance[]) : [];
    const motherDefinitions = new Set<string>();
    for (const node of nodes) {
      const state = readCustomNodeState(node?.config ?? {});
      if (state?.role === 'mother') motherDefinitions.add(String(state.definitionId));
    }
    const isCustomNodeAvailable = (type: string): boolean => {
      if (!String(type).startsWith(CUSTOM_NODE_TYPE_PREFIX)) return true;
      const defId = String(type).slice(CUSTOM_NODE_TYPE_PREFIX.length);
      return Boolean(defId && motherDefinitions.has(defId));
    };

    const addItem = (item: PickerItem) => {
      if (q) {
        const hay = `${item.label} ${item.type} ${item.category}`.toLowerCase();
        if (!hay.includes(q)) return;
      }
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    };

    if ($mode === 'connect' && $initialSocket) {
      const initial = $initialSocket;
      const initialPort = opts.getPortDefForSocket(initial);
      const requiredType = (initialPort?.type ?? 'any') as PortType;
      const neededSide: 'input' | 'output' = initial.side === 'output' ? 'input' : 'output';

      for (const def of opts.nodeRegistry.list()) {
        if (String(def.category ?? '') === 'Internal') continue;
        if (!isCustomNodeAvailable(def.type)) continue;
        const ports = (neededSide === 'input' ? def.inputs : def.outputs) ?? [];
        const match = opts.bestMatchingPort(ports, requiredType, neededSide);
        if (!match) continue;

        addItem({
          type: def.type,
          label: def.label,
          category: def.category,
          matchPort: {
            id: match.id,
            label: match.label ?? match.id,
            side: neededSide,
            type: (match.type ?? 'any') as PortType,
          },
        });
      }
    } else {
      for (const def of opts.nodeRegistry.list()) {
        if (String(def.category ?? '') === 'Internal') continue;
        if (!isCustomNodeAvailable(def.type)) continue;
        addItem({ type: def.type, label: def.label, category: def.category });
      }
    }

    for (const [cat, list] of map) {
      list.sort((a, b) => a.label.localeCompare(b.label));
      map.set(cat, list);
    }

    return map;
  });

  const CATEGORY_ORDER = [
    'Objects',
    'Assets',
    'Audio',
    'MIDI',
    'Values',
    'Generators',
    'Gate',
    'Logic',
    'Parameters',
    'Processors',
    'Scene',
    'Effect',
    'Player',
    'Other',
  ] as const;

  const categories = derived(itemsByCategory, ($itemsByCategory) => {
    const cats = Array.from($itemsByCategory.keys());
    const normalized = cats.filter((c) => c && typeof c === 'string');
    const ordered = CATEGORY_ORDER.filter((c) => normalized.includes(c));
    const rest = normalized
      .filter((c) => !ordered.includes(c))
      .sort((a, b) => a.localeCompare(b));
    return [...ordered, ...rest];
  });

  const items = derived(
    [itemsByCategory, selectedCategory, usageMap],
    ([$itemsByCategory, $selectedCategory, $usageMap]) => {
      if (!$selectedCategory) {
        const flat: PickerItem[] = [];
        for (const list of $itemsByCategory.values()) {
          for (const item of list) flat.push(item);
        }

        return flat.sort((a, b) => {
          const aUsage = $usageMap[a.type];
          const bUsage = $usageMap[b.type];
          const aCount = aUsage?.count ?? 0;
          const bCount = bUsage?.count ?? 0;
          if (aCount !== bCount) return bCount - aCount;
          const aLast = aUsage?.lastUsed ?? 0;
          const bLast = bUsage?.lastUsed ?? 0;
          if (aLast !== bLast) return bLast - aLast;
          return a.label.localeCompare(b.label);
        });
      }

      return $itemsByCategory.get($selectedCategory) ?? [];
    }
  );

  categories.subscribe((cats) => {
    const current = get(selectedCategory);
    if (!current) return; // allow "All"
    if (cats.length > 0 && !cats.includes(current)) selectedCategory.set(cats[0] ?? '');
  });

  const clampPickerToBounds = async () => {
    await tick();
    const container = opts.getContainer();
    if (!container || !pickerElement) return;
    const bounds = container.getBoundingClientRect();
    const w = pickerElement.offsetWidth;
    const h = pickerElement.offsetHeight;
    const pad = 10;

    let x = get(anchor).x;
    let y = get(anchor).y;

    if (x + w + pad > bounds.width) x = bounds.width - w - pad;
    if (y + h + pad > bounds.height) y = bounds.height - h - pad;
    if (x < pad) x = pad;
    if (y < pad) y = pad;

    anchor.set({ x, y });
  };

  const openPicker = (optsOpen: {
    clientX: number;
    clientY: number;
    mode: PickerMode;
    initialSocket?: SocketData | null;
  }) => {
    const container = opts.getContainer();
    if (!container) return;
    const rect = container.getBoundingClientRect();
    anchor.set({ x: optsOpen.clientX - rect.left, y: optsOpen.clientY - rect.top });
    graphPos.set(opts.computeGraphPosition(optsOpen.clientX, optsOpen.clientY));
    mode.set(optsOpen.mode);
    initialSocket.set(optsOpen.initialSocket ?? null);
    query.set('');
    selectedCategory.set(optsOpen.mode === 'connect' ? '' : 'Objects');
    isOpen.set(true);
    void clampPickerToBounds();
  };

  const openConnectPicker = (initial: SocketData) => {
    const now = Date.now();
    if (now - lastConnectPickerOpenedAt < 80) return;
    lastConnectPickerOpenedAt = now;
    const { x, y } = opts.getLastPointerClient();
    openPicker({ clientX: x, clientY: y, mode: 'connect', initialSocket: initial });
  };

  const closePicker = () => {
    isOpen.set(false);
    initialSocket.set(null);
  };

  const handlePick = (item: PickerItem) => {
    const nodeId = opts.addNode(item.type, get(graphPos));
    if (!nodeId) return;

    const currentUsage = get(usageMap);
    const prev = currentUsage[item.type] ?? { count: 0, lastUsed: 0 };
    const nextUsage = {
      ...currentUsage,
      [item.type]: { count: prev.count + 1, lastUsed: Date.now() },
    };
    usageMap.set(nextUsage);
    writeUsageMap(nextUsage);

    const initial = get(initialSocket);
    if (get(mode) === 'connect' && initial && item.matchPort) {
      const connId = `conn-${crypto.randomUUID?.() ?? Date.now()}`;
      const engineConn: EngineConnection =
        initial.side === 'output'
          ? {
              id: connId,
              sourceNodeId: initial.nodeId,
              sourcePortId: initial.key,
              targetNodeId: nodeId,
              targetPortId: item.matchPort.id,
            }
          : {
              id: connId,
              sourceNodeId: nodeId,
              sourcePortId: item.matchPort.id,
              targetNodeId: initial.nodeId,
              targetPortId: initial.key,
            };
      opts.addConnection(engineConn);
    }

    closePicker();
  };

  const setPickerElement = (el: HTMLDivElement | null) => {
    pickerElement = el;
  };

  return {
    isOpen,
    mode,
    anchor,
    graphPos,
    selectedCategory,
    query,
    initialSocket,
    items,
    categories,
    setPickerElement,
    openPicker,
    openConnectPicker,
    closePicker,
    handlePick,
  };
}
