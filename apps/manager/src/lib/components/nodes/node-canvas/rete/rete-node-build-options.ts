/**
 * Purpose: Small node-type specific build options used when creating Rete nodes.
 */
import type { NodeInstance, NodePort } from '$lib/nodes/types';

export function getProxyPortType(instance: NodeInstance): string | null {
  if (instance.type !== 'group-proxy') return null;
  const raw = (instance.config as Record<string, unknown>)?.portType;
  return typeof raw === 'string' && raw ? raw : raw ? String(raw) : 'any';
}

export function getCmdAggregatorInputCount(instance: NodeInstance): number | null {
  if (instance.type !== 'cmd-aggregator') return null;
  const raw = (instance.config as Record<string, unknown>)?.inCount;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1;
}

export function shouldRenderInputPort(input: NodePort, cmdAggInputCount: number | null): boolean {
  if (cmdAggInputCount === null) return true;
  const match = /^in(\d+)$/.exec(String(input.id));
  if (!match) return true;
  const idx = Number(match[1]);
  return Number.isFinite(idx) && idx > 0 && idx <= cmdAggInputCount;
}
