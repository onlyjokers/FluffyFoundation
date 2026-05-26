/**
 * Purpose: Port compatibility and matching helpers for Rete graph interactions.
 */
import type { NodeInstance, NodePort, PortType } from '$lib/nodes/types';
import type { NodeRegistry } from '@shugu/node-core';
import { getProxyPortType } from './rete-node-build-options';

export function isCompatiblePortType(sourceType: PortType, targetType: PortType): boolean {
  if (sourceType === 'asset' || targetType === 'asset') {
    return sourceType === 'asset' && targetType === 'asset';
  }
  if (sourceType === 'audio' || targetType === 'audio') {
    return sourceType === 'audio' && targetType === 'audio';
  }
  if (sourceType === 'image' || targetType === 'image') {
    return sourceType === 'image' && targetType === 'image';
  }
  if (sourceType === 'video' || targetType === 'video') {
    return sourceType === 'video' && targetType === 'video';
  }
  return sourceType === 'any' || targetType === 'any' || sourceType === targetType;
}

export function bestMatchingPort(
  ports: NodePort[],
  requiredType: PortType,
  portSide: 'input' | 'output'
): NodePort | null {
  let best: NodePort | null = null;
  let bestScore = -1;

  for (const port of ports) {
    const portType = (port.type ?? 'any') as PortType;
    const ok =
      portSide === 'input'
        ? isCompatiblePortType(requiredType, portType)
        : isCompatiblePortType(portType, requiredType);
    if (!ok) continue;
    const exact = portType === requiredType ? 2 : 1;
    if (exact > bestScore) {
      bestScore = exact;
      best = port;
    }
  }

  return best;
}

export function getPortDefForSocket(
  nodeRegistry: NodeRegistry,
  getNode: ((nodeId: string) => NodeInstance | undefined) | undefined,
  socket: { nodeId: string; side: 'input' | 'output'; key: string }
): NodePort | null {
  const instance = getNode?.(socket.nodeId);
  if (!instance) return null;
  const def = nodeRegistry.get(instance.type);
  if (!def) return null;
  const port =
    socket.side === 'output'
      ? ((def.outputs ?? []).find((p) => p.id === socket.key) ?? null)
      : ((def.inputs ?? []).find((p) => p.id === socket.key) ?? null);
  const proxyPortType = getProxyPortType(instance);
  return port && proxyPortType ? { ...port, type: proxyPortType as PortType } : port;
}

export function inputAllowsMultiple(
  nodeRegistry: NodeRegistry,
  getNode: ((nodeId: string) => NodeInstance | undefined) | undefined,
  nodeId: string,
  inputKey: string
): boolean {
  const instance = getNode?.(nodeId);
  if (!instance) return false;
  const def = nodeRegistry.get(instance.type);
  const port = def?.inputs?.find((p) => p.id === inputKey);
  return port?.kind === 'sink';
}
