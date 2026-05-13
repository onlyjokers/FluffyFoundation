// Purpose: Derive Custom Node boundary ports from expanded group proxy nodes.
import type { Connection, NodeInstance } from '$lib/nodes/types';
import type { CustomNodeDefinition } from '$lib/nodes/custom-nodes/types';
import type { NodeRegistry } from '@shugu/node-core';
import type { NodeGroup } from '../controllers/group-controller';
import { asRecord, getBoolean, getString } from '../../../../utils/value-guards';

const validPortTypes = new Set([
  'number',
  'boolean',
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

function resolvePortLabel(
  nodeRegistry: NodeRegistry,
  nodeType: string,
  side: 'input' | 'output',
  portId: string
): string {
  const def = nodeRegistry.get(String(nodeType ?? ''));
  const ports = side === 'input' ? def?.inputs : def?.outputs;
  const port = (ports ?? []).find((p) => String(p.id) === String(portId)) ?? null;
  return String(port?.label ?? portId);
}

export function collectCustomNodeIdsFromMaterializedNodes(
  nodes: NodeInstance[],
  customNodeIdFromMaterializedNodeId: (nodeId: string) => string | null
): Set<string> {
  const customNodeIds = new Set<string>();
  for (const n of nodes) {
    const customId = customNodeIdFromMaterializedNodeId(String(n.id ?? ''));
    if (customId) customNodeIds.add(customId);
  }
  return customNodeIds;
}

export function collectSubtreeGroupIds(rootGroupId: string, groupsSnapshot: NodeGroup[]): Set<string> {
  const subtreeGroupIds = new Set<string>();
  const stack = [rootGroupId];
  while (stack.length > 0) {
    const gid = String(stack.pop() ?? '');
    if (!gid || subtreeGroupIds.has(gid)) continue;
    subtreeGroupIds.add(gid);
    for (const g of groupsSnapshot) {
      if (String(g.parentId ?? '') !== gid) continue;
      stack.push(String(g.id ?? ''));
    }
  }
  return subtreeGroupIds;
}

export function deriveCustomNodePortsFromProxies(opts: {
  rootProxyNodes: NodeInstance[];
  packedNodes: NodeInstance[];
  packedConnections: Connection[];
  originY: number;
  nodeRegistry: NodeRegistry;
  internalIdForMain: (mainId: string) => string;
}): CustomNodeDefinition['ports'] {
  const ports: CustomNodeDefinition['ports'] = [];

  for (const proxy of opts.rootProxyNodes) {
    const proxyMainId = String(proxy.id ?? '');
    if (!proxyMainId) continue;

    const internalProxyId = opts.internalIdForMain(proxyMainId);
    const config = asRecord(proxy.config);
    const directionRaw = getString(config.direction, 'output');
    const side: 'input' | 'output' = directionRaw === 'input' ? 'input' : 'output';
    const bindingPortId = side === 'input' ? 'in' : 'out';
    const portKey = `p:${internalProxyId}`;

    const portTypeRaw = getString(config.portType, 'any');
    const type = validPortTypes.has(portTypeRaw) ? portTypeRaw : 'any';
    const pinned = getBoolean(config.pinned, false);

    const pos = proxy.position ?? { x: 0, y: 0 };
    const y = Number(pos?.y ?? 0) - opts.originY;

    const label = deriveProxyPortLabel({
      side,
      internalProxyId,
      packedConnections: opts.packedConnections,
      packedNodes: opts.packedNodes,
      nodeRegistry: opts.nodeRegistry,
    });

    ports.push({
      portKey,
      side,
      label,
      type,
      pinned,
      y: Number.isFinite(y) ? y : 0,
      binding: { nodeId: internalProxyId, portId: bindingPortId },
    });
  }

  return ports;
}

function deriveProxyPortLabel(opts: {
  side: 'input' | 'output';
  internalProxyId: string;
  packedConnections: Connection[];
  packedNodes: NodeInstance[];
  nodeRegistry: NodeRegistry;
}): string {
  if (opts.side === 'input') {
    const inner = opts.packedConnections.find(
      (c) => String(c.sourceNodeId) === opts.internalProxyId && String(c.sourcePortId) === 'out'
    );
    if (!inner) return 'In';
    const targetNode = opts.packedNodes.find((n) => String(n.id) === String(inner.targetNodeId));
    if (!targetNode) return String(inner.targetPortId ?? 'In');
    return resolvePortLabel(opts.nodeRegistry, String(targetNode.type), 'input', String(inner.targetPortId));
  }

  const inner = opts.packedConnections.find(
    (c) => String(c.targetNodeId) === opts.internalProxyId && String(c.targetPortId) === 'in'
  );
  if (!inner) return 'Out';
  const sourceNode = opts.packedNodes.find((n) => String(n.id) === String(inner.sourceNodeId));
  if (!sourceNode) return String(inner.sourcePortId ?? 'Out');
  return resolvePortLabel(opts.nodeRegistry, String(sourceNode.type), 'output', String(inner.sourcePortId));
}
