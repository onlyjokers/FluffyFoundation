// Purpose: Pure formatting and port inference helpers for the Rete node renderer.

export type AnyRecord = Record<string, unknown>;

export type BypassPorts = { inId: string; outId: string; portType: string };

export type PortDefinitionLike = {
  id: string;
  type: string;
  kind?: string;
};

export type NodeDefinitionLike = {
  inputs: PortDefinitionLike[];
  outputs: PortDefinitionLike[];
};

export type ConnectionLike = {
  sourceNodeId?: unknown;
  sourcePortId?: unknown;
  targetNodeId?: unknown;
  targetPortId?: unknown;
};

export type NodeLike = {
  id?: unknown;
  type?: unknown;
  config?: AnyRecord;
  position?: { x?: number; y?: number };
};

export type GroupFrameProxyPort = {
  id: string;
  direction: 'input' | 'output';
  portType: string;
  centerY: number;
  label: string;
};

export function sortByIndex<K, I extends undefined | { index?: number }>(entries: [K, I][]) {
  entries.sort((a, b) => ((a[1] && a[1].index) || 0) - ((b[1] && b[1].index) || 0));
  return entries as [K, Exclude<I, undefined>][];
}

export function resolveRenderedNodeType(instanceType: unknown, dataType: unknown): string {
  const fromInstance = typeof instanceType === 'string' ? instanceType.trim() : '';
  if (fromInstance) return fromInstance;
  return typeof dataType === 'string' ? dataType.trim() : '';
}

export function formatNumber(value: number, maxDecimals = 3): string {
  if (!Number.isFinite(value)) return '--';
  const fixed = value.toFixed(maxDecimals);
  return fixed.replace(/\.?0+$/, '');
}

function formatAnyValue(value: unknown): string {
  const MAX_LEN = 160;
  const clamp = (raw: string): string => {
    const singleLine = raw.replace(/\s+/g, ' ').trim();
    if (!singleLine) return '--';
    return singleLine.length <= MAX_LEN ? singleLine : `${singleLine.slice(0, MAX_LEN - 1)}…`;
  };

  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? clamp(formatNumber(value)) : '--';
  if (typeof value === 'string') return clamp(value);

  try {
    const json = JSON.stringify(value);
    if (typeof json === 'string') return clamp(json);
  } catch {
    // Fall back to String(value) below.
  }

  try {
    return clamp(String(value));
  } catch {
    return '--';
  }
}

export function formatPortValue(portType: string, value: unknown): string | null {
  if (portType === 'number' || portType === 'fuzzy') {
    if (typeof value !== 'number') return '--';
    return formatNumber(value, portType === 'fuzzy' ? 3 : 3);
  }

  if (value === null || value === undefined) return null;

  if (portType === 'any') return formatAnyValue(value);
  if (portType === 'boolean')
    return typeof value === 'boolean' ? (value ? 'true' : 'false') : null;
  if (portType === 'string' || portType === 'asset') return typeof value === 'string' ? value : null;
  if (portType === 'color') return typeof value === 'string' ? value : null;
  if (portType === 'client' && typeof value === 'object' && value) {
    const clientIds = (value as AnyRecord).clientIds;
    if (Array.isArray(clientIds) && clientIds.length > 0) {
      return clientIds.map(String).filter(Boolean).join(', ');
    }
    const clientId = (value as AnyRecord).clientId;
    return clientId ? String(clientId) : null;
  }

  return null;
}

export function hasPortValueText(value: string | null | undefined): value is string {
  return value !== null && value !== undefined;
}

type PortValueText = {
  inputs: Record<string, string | null>;
  outputs: Record<string, string | null>;
};

function sortedRecordSignature(record: Record<string, string | null>): string {
  return Object.keys(record)
    .sort()
    .map((key) => `${key}:${String(record[key])}`)
    .join('|');
}

export function shouldUpdatePortValueText(
  previous: PortValueText,
  next: PortValueText
): boolean {
  return (
    sortedRecordSignature(previous.inputs) !== sortedRecordSignature(next.inputs) ||
    sortedRecordSignature(previous.outputs) !== sortedRecordSignature(next.outputs)
  );
}

function bypassCandidate(inPort: PortDefinitionLike, outPort: PortDefinitionLike): BypassPorts | null {
  if (String(inPort.type) !== String(outPort.type)) return null;
  if (inPort.type === 'command' || inPort.type === 'client') return null;
  return {
    inId: String(inPort.id),
    outId: String(outPort.id),
    portType: String(inPort.type),
  };
}

export function inferBypassPorts(def: NodeDefinitionLike | null | undefined): BypassPorts | null {
  if (!def) return null;

  const inPort = def.inputs.find((p) => String(p.id) === 'in') ?? null;
  const outPort = def.outputs.find((p) => String(p.id) === 'out') ?? null;
  if (inPort && outPort) {
    const candidate = bypassCandidate(inPort, outPort);
    if (candidate) return candidate;
  }

  if (def.inputs.length === 1 && def.outputs.length === 1) {
    const candidate = bypassCandidate(def.inputs[0], def.outputs[0]);
    if (candidate) return candidate;
  }

  const sinkInputs = def.inputs.filter((p) => p.kind === 'sink');
  const sinkOutputs = def.outputs.filter((p) => p.kind === 'sink');
  if (sinkInputs.length === 1 && sinkOutputs.length === 1) {
    return bypassCandidate(sinkInputs[0], sinkOutputs[0]);
  }

  return null;
}

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

export function resolveProxyPortType(node: NodeLike): string {
  const raw = node?.config?.portType;
  const t = typeof raw === 'string' ? raw : raw ? String(raw) : '';
  return validPortTypes.has(t) ? t : 'any';
}

export function buildGroupFrameProxyPorts(opts: {
  nodes: NodeLike[];
  connections: ConnectionLike[];
  groupId: string;
  groupTop: number;
  getPortLabel: (nodeId: string, side: 'input' | 'output', portId: string) => string;
}): { ports: GroupFrameProxyPort[]; areaHeight: number } {
  const nodeById = new Map(opts.nodes.map((node) => [String(node.id ?? ''), node] as const));
  const incomingToProxy = new Map<string, ConnectionLike>();
  const outgoingFromProxy = new Map<string, ConnectionLike[]>();

  for (const c of opts.connections) {
    const targetId = String(c.targetNodeId ?? '');
    const sourceId = String(c.sourceNodeId ?? '');
    const targetPortId = String(c.targetPortId ?? '');
    const sourcePortId = String(c.sourcePortId ?? '');
    if (!targetId || !sourceId || !targetPortId || !sourcePortId) continue;

    const targetNode = nodeById.get(targetId);
    const sourceNode = nodeById.get(sourceId);

    if (String(targetNode?.type ?? '') === 'group-proxy' && targetPortId === 'in') {
      incomingToProxy.set(targetId, c);
    }
    if (String(sourceNode?.type ?? '') === 'group-proxy' && sourcePortId === 'out') {
      const list = outgoingFromProxy.get(sourceId) ?? [];
      list.push(c);
      outgoingFromProxy.set(sourceId, list);
    }
  }

  const proxyHalfHeight = 10;
  const ports: GroupFrameProxyPort[] = [];
  for (const node of opts.nodes) {
    if (String(node.type ?? '') !== 'group-proxy') continue;
    const proxyId = String(node.id ?? '');
    if (!proxyId) continue;
    const proxyGroupId = String(node.config?.groupId ?? '');
    if (!proxyGroupId || proxyGroupId !== opts.groupId) continue;

    const direction = String(node.config?.direction ?? 'output') === 'input' ? 'input' : 'output';
    const portType = resolveProxyPortType(node);
    const centerY = Number(node.position?.y ?? 0) + proxyHalfHeight;

    let label = '';
    if (direction === 'input') {
      const internal = outgoingFromProxy.get(proxyId) ?? [];
      const first = internal[0] ?? null;
      if (first) {
        label = opts.getPortLabel(String(first.targetNodeId), 'input', String(first.targetPortId));
      }
    } else {
      const internal = incomingToProxy.get(proxyId) ?? null;
      if (internal) {
        label = opts.getPortLabel(String(internal.sourceNodeId), 'output', String(internal.sourcePortId));
      }
    }
    if (!label) label = portType;

    ports.push({
      id: proxyId,
      direction,
      portType,
      centerY: Number.isFinite(opts.groupTop) ? centerY - opts.groupTop : centerY,
      label,
    });
  }

  ports.sort((a, b) => a.centerY - b.centerY || a.id.localeCompare(b.id));

  const inputCount = ports.filter((p) => p.direction === 'input').length;
  const outputCount = ports.length - inputCount;
  const rowCount = Math.max(1, Math.max(inputCount, outputCount));
  const areaHeight = rowCount * 28 + 12;

  return { ports, areaHeight };
}
