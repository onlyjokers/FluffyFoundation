/**
 * Purpose: Apply downstream numeric port constraints to MIDI map range controls.
 */
import { ClassicPreset, type BaseSchemes } from 'rete';
import type { AreaPlugin } from 'rete-area-plugin';
import type { Connection as EngineConnection, NodeInstance } from '$lib/nodes/types';
import type { NodeRegistry } from '@shugu/node-core';

type AnyAreaPlugin = AreaPlugin<BaseSchemes, unknown>;

type NumberControlLike = ClassicPreset.Control & {
  min?: number;
  max?: number;
  value?: number;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clampNumber(value: number, min: number | undefined, max: number | undefined): number {
  let next = value;
  if (typeof min === 'number' && Number.isFinite(min)) next = Math.max(min, next);
  if (typeof max === 'number' && Number.isFinite(max)) next = Math.min(max, next);
  return next;
}

export async function applyMidiMapRangeConstraintsToReteNodes(
  opts: {
    nodeRegistry: NodeRegistry;
    updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  },
  state: { nodes: NodeInstance[]; connections: EngineConnection[] },
  areaPlugin: AnyAreaPlugin | null | undefined,
  nodeMap: Map<string, ClassicPreset.Node>
): Promise<void> {
  if (!areaPlugin) return;

  const byId = new Map(state.nodes.map((n) => [String(n.id), n]));

  for (const node of state.nodes) {
    if (node.type !== 'midi-map') continue;

    const def = opts.nodeRegistry.get(node.type);
    const minField = def?.configSchema?.find((f) => f.key === 'min');
    const maxField = def?.configSchema?.find((f) => f.key === 'max');

    const baseMinCandidates = [minField?.min, maxField?.min].filter(isFiniteNumber);
    const baseMaxCandidates = [minField?.max, maxField?.max].filter(isFiniteNumber);
    const baseMin = baseMinCandidates.length > 0 ? Math.max(...baseMinCandidates) : undefined;
    const baseMax = baseMaxCandidates.length > 0 ? Math.min(...baseMaxCandidates) : undefined;

    const conns = state.connections.filter(
      (c) => String(c.sourceNodeId) === String(node.id) && String(c.sourcePortId) === 'out'
    );

    let downMin: number | undefined;
    let downMax: number | undefined;

    for (const c of conns) {
      const target = byId.get(String(c.targetNodeId));
      const targetDef = target ? opts.nodeRegistry.get(target.type) : null;
      const port = targetDef?.inputs?.find((p) => p.id === c.targetPortId);
      if (!port || port.type !== 'number') continue;

      if (isFiniteNumber(port.min)) {
        downMin = downMin === undefined ? port.min : Math.max(downMin, port.min);
      }
      if (isFiniteNumber(port.max)) {
        downMax = downMax === undefined ? port.max : Math.min(downMax, port.max);
      }
    }

    if (downMin !== undefined && downMax !== undefined && downMax < downMin) {
      downMin = undefined;
      downMax = undefined;
    }

    const nextMinLimit =
      baseMin !== undefined && downMin !== undefined ? Math.max(baseMin, downMin) : (baseMin ?? downMin);
    const nextMaxLimit =
      baseMax !== undefined && downMax !== undefined ? Math.min(baseMax, downMax) : (baseMax ?? downMax);

    const reteNode = nodeMap.get(String(node.id));
    const minCtrl = reteNode?.controls?.min as NumberControlLike | undefined;
    const maxCtrl = reteNode?.controls?.max as NumberControlLike | undefined;
    let needsNodeUpdate = false;

    if (minCtrl) {
      if (minCtrl.min !== nextMinLimit) {
        minCtrl.min = nextMinLimit;
        needsNodeUpdate = true;
      }
      if (minCtrl.max !== nextMaxLimit) {
        minCtrl.max = nextMaxLimit;
        needsNodeUpdate = true;
      }
    }

    if (maxCtrl) {
      if (maxCtrl.min !== nextMinLimit) {
        maxCtrl.min = nextMinLimit;
        needsNodeUpdate = true;
      }
      if (maxCtrl.max !== nextMaxLimit) {
        maxCtrl.max = nextMaxLimit;
        needsNodeUpdate = true;
      }
    }

    const rawMin = Number(node.config?.min ?? minField?.defaultValue ?? 0);
    const rawMax = Number(node.config?.max ?? maxField?.defaultValue ?? 1);
    const effectiveRawMin = Number.isFinite(rawMin) ? rawMin : 0;
    const effectiveRawMax = Number.isFinite(rawMax) ? rawMax : 1;
    const clampedMin = clampNumber(effectiveRawMin, nextMinLimit, nextMaxLimit);
    const clampedMax = clampNumber(effectiveRawMax, nextMinLimit, nextMaxLimit);

    const updates: Record<string, number> = {};
    if (clampedMin !== effectiveRawMin) updates.min = clampedMin;
    if (clampedMax !== effectiveRawMax) updates.max = clampedMax;
    if (Object.keys(updates).length > 0) {
      opts.updateNodeConfig(String(node.id), updates);
      if (minCtrl) minCtrl.value = clampedMin;
      if (maxCtrl) maxCtrl.value = clampedMax;
      needsNodeUpdate = true;
    }

    if (needsNodeUpdate) await areaPlugin.update('node', String(node.id));
  }
}
