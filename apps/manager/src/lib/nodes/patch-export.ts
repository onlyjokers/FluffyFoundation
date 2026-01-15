/**
 * Purpose: Patch export helpers (Max/MSP style).
 *
 * Exports a subgraph rooted at an output sink node (e.g. `audio-out`).
 * This is used to deploy a "patch" to the client without relying on loop detection.
 */

import type { GraphState } from './types';
import type { NodeRegistry } from '@shugu/node-core';

export type PatchExportResult = {
  rootNodeIds: string[];
  graph: Pick<GraphState, 'nodes' | 'connections'>;
  assetRefs: string[];
};

type PatchExportOptions = {
  rootType?: string;
  /**
   * Multi-root patch export. When provided, the exported patch is the union of all subgraphs rooted at
   * these nodes (Max/MSP style), with manager-only routing still excluded.
   */
  rootNodeIds?: string[];
  nodeRegistry?: NodeRegistry;
  isNodeEnabled?: (nodeId: string) => boolean;
};

function normalizeAssetRef(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.startsWith('asset:')) {
    const id = s.slice('asset:'.length).trim().split(/[?#]/)[0]?.trim() ?? '';
    return id ? `asset:${id}` : null;
  }
  const p = 'shugu://asset/';
  if (s.startsWith(p)) {
    const id = s.slice(p.length).trim().split(/[?#]/)[0]?.trim() ?? '';
    return id ? `asset:${id}` : null;
  }
  return null;
}

function collectAssetRefs(value: unknown, out: string[], seen: Set<string>): void {
  if (typeof value === 'string') {
    const normalized = normalizeAssetRef(value);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectAssetRefs(item, out, seen);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const v of Object.values(value as Record<string, unknown>)) collectAssetRefs(v, out, seen);
}

export function exportGraphForPatch(
  state: GraphState,
  opts: PatchExportOptions = {}
): PatchExportResult {
  const rootType = opts.rootType ?? 'audio-out';
  const requestedRootNodeIds = (opts.rootNodeIds ?? []).map(String).filter(Boolean);
  const registry = opts.nodeRegistry ?? null;
  const isNodeEnabled = opts.isNodeEnabled ?? null;
  const nodes = (state.nodes ?? []).slice();
  const connections = (state.connections ?? []).slice();
  const byId = new Map(nodes.map((n) => [String(n.id), n]));

  const normalizeAssetPickerValue = (raw: unknown): string | null => {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return normalizeAssetRef(trimmed) ?? `asset:${trimmed}`;
  };

  const isManagerOnlyNodeType = (type: string): boolean => type.startsWith('midi-');

  const rootNodeIds = (() => {
    if (requestedRootNodeIds.length > 0) {
      const uniq = Array.from(new Set(requestedRootNodeIds));
      for (const id of uniq) {
        if (!byId.has(id)) throw new Error(`Invalid patch root id: ${id}`);
      }
      uniq.sort((a, b) => a.localeCompare(b));
      return uniq;
    }

    const roots = nodes.filter((n) => n.type === rootType);
    if (roots.length === 0) {
      throw new Error(`No patch root node found (${rootType}). Add an "${rootType}" node first.`);
    }
    if (roots.length > 1) {
      throw new Error(`Multiple patch root nodes found (${rootType}). Keep only one for deploy.`);
    }
    return [String(roots[0]!.id)];
  })();

  const incomingByTarget = new Map<string, { sourceNodeId: string; targetPortId: string }[]>();
  for (const c of connections) {
    const targetNodeId = String(c.targetNodeId);
    const list = incomingByTarget.get(targetNodeId) ?? [];
    list.push({ sourceNodeId: String(c.sourceNodeId), targetPortId: String(c.targetPortId) });
    incomingByTarget.set(targetNodeId, list);
  }
  for (const list of incomingByTarget.values()) {
    list.sort(
      (a, b) =>
        a.targetPortId.localeCompare(b.targetPortId) || a.sourceNodeId.localeCompare(b.sourceNodeId)
    );
  }

  const shouldTraverse = (targetNodeId: string, targetPortId: string): boolean => {
    if (!registry) return true;
    const node = nodes.find((n) => String(n.id) === String(targetNodeId));
    if (!node) return true;
    const def = registry.get(String(node.type));
    const port = def?.inputs?.find((p) => String(p.id) === String(targetPortId));
    const type = (port?.type ?? 'any') as string;
    // Patch deploy only follows signal/control-rate dependencies (audio/number/etc).
    // Manager-only routing (client) and command sinks must be excluded from the deployed patch.
    if (type === 'client' || type === 'command') return false;
    return true;
  };

  const keep = new Set<string>();
  const visit = (nodeId: string) => {
    const id = String(nodeId);
    if (!id || keep.has(id)) return;
    const node = byId.get(id);
    if (!node) return;
    // MIDI nodes are manager-only control sources (WebMIDI lives in manager, not client).
    // They must not be exported to the client patch; their outputs are forwarded as overrides instead.
    if (isManagerOnlyNodeType(String(node.type))) return;
    keep.add(id);
    const incoming = incomingByTarget.get(id) ?? [];
    for (const inc of incoming) {
      if (!shouldTraverse(id, inc.targetPortId)) continue;
      visit(inc.sourceNodeId);
    }
  };
  for (const rootId of rootNodeIds) visit(rootId);

  const keptNodes = nodes.filter((n) => keep.has(String(n.id)));
  const keptNodeIds = new Set(keptNodes.map((n) => String(n.id)));
  let keptConnections = connections.filter(
    (c) => keptNodeIds.has(String(c.sourceNodeId)) && keptNodeIds.has(String(c.targetNodeId))
  );

  // Stable ordering for deterministic deploy signatures.
  const inferBypassPorts = (type: string): { inId: string; outId: string } | null => {
    if (!registry) return null;
    const def = registry.get(type);
    if (!def) return null;

    const inPort = def.inputs.find((p) => String(p.id) === 'in') ?? null;
    const outPort = def.outputs.find((p) => String(p.id) === 'out') ?? null;
    if (inPort && outPort && String(inPort.type) === String(outPort.type)) {
      if (inPort.type === 'command' || inPort.type === 'client') return null;
      return { inId: 'in', outId: 'out' };
    }

    if (def.inputs.length === 1 && def.outputs.length === 1) {
      const onlyIn = def.inputs[0];
      const onlyOut = def.outputs[0];
      if (String(onlyIn.type) === String(onlyOut.type)) {
        if (onlyIn.type === 'command' || onlyIn.type === 'client') return null;
        return { inId: String(onlyIn.id), outId: String(onlyOut.id) };
      }
    }

    const sinkInputs = def.inputs.filter((p) => p.kind === 'sink');
    const sinkOutputs = def.outputs.filter((p) => p.kind === 'sink');
    if (sinkInputs.length === 1 && sinkOutputs.length === 1) {
      const onlyIn = sinkInputs[0];
      const onlyOut = sinkOutputs[0];
      if (String(onlyIn.type) === String(onlyOut.type)) {
        if (onlyIn.type === 'command' || onlyIn.type === 'client') return null;
        return { inId: String(onlyIn.id), outId: String(onlyOut.id) };
      }
    }

    return null;
  };

  // If the manager has disabled nodes (e.g. group gate closed), bypass eligible nodes so the exported
  // patch graph reflects the pass-through semantics (disabled node becomes a wire).
  let effectiveNodes = keptNodes;
  if (registry && isNodeEnabled) {
    const removed = new Set<string>();
    const rewired: GraphState['connections'] = [];

    const currentConnections = keptConnections.slice();
    const currentNodes = new Map(keptNodes.map((n) => [String(n.id), n]));

    const connectionKey = (c: {
      sourceNodeId: string;
      sourcePortId: string;
      targetNodeId: string;
      targetPortId: string;
    }) => `${c.sourceNodeId}|${c.sourcePortId}|${c.targetNodeId}|${c.targetPortId}`;

    const dedupe = new Set(currentConnections.map(connectionKey));

    const shouldDropWhenDisabledStart = (type: string, ports: { inId: string; outId: string }) => {
      const def = registry.get(type);
      if (!def) return false;
      const inPort = def.inputs.find((p) => String(p.id) === ports.inId) ?? null;
      const portType = String(inPort?.type ?? '');
      // Some port types are explicitly designed to allow "empty chain" semantics when upstream is missing.
      // For these, a disabled chain head should be removed so downstream nodes can still run.
      return portType === 'scene' || portType === 'effect';
    };

    for (const node of keptNodes) {
      const nodeId = String(node.id);
      if (!nodeId) continue;
      if (isNodeEnabled(nodeId)) continue;

      const type = String(node.type);
      const ports = inferBypassPorts(type);
      if (!ports) continue;

      const incoming = currentConnections.filter(
        (c) => String(c.targetNodeId) === nodeId && String(c.targetPortId) === ports.inId
      );
      const outgoing = currentConnections.filter(
        (c) => String(c.sourceNodeId) === nodeId && String(c.sourcePortId) === ports.outId
      );

      if (incoming.length === 0 || outgoing.length === 0) {
        // Special case: a disabled chain head (no upstream) should be dropped for "empty chain" ports
        // so the patch can still deploy and downstream nodes can start from identity.
        if (incoming.length === 0 && outgoing.length > 0 && shouldDropWhenDisabledStart(type, ports))
          removed.add(nodeId);
        continue;
      }

      // Only bypass when the wire would stay entirely inside the exported patch subgraph.
      if (
        incoming.some((c) => !currentNodes.has(String(c.sourceNodeId))) ||
        outgoing.some((c) => !currentNodes.has(String(c.targetNodeId)))
      ) {
        continue;
      }

      for (const inc of incoming) {
        for (const out of outgoing) {
          const next = {
            id: `bypass:${nodeId}:${String(inc.id)}->${String(out.id)}`,
            sourceNodeId: String(inc.sourceNodeId),
            sourcePortId: String(inc.sourcePortId),
            targetNodeId: String(out.targetNodeId),
            targetPortId: String(out.targetPortId),
          };
          const key = connectionKey(next);
          if (dedupe.has(key)) continue;
          dedupe.add(key);
          rewired.push(next);
        }
      }

      removed.add(nodeId);
    }

    if (removed.size > 0) {
      effectiveNodes = keptNodes.filter((n) => !removed.has(String(n.id)));
      keptConnections = currentConnections
        .filter((c) => !removed.has(String(c.sourceNodeId)) && !removed.has(String(c.targetNodeId)))
        .concat(rewired);
    }
  }

  effectiveNodes.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  keptConnections.sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const assetRefs: string[] = [];
  const seen = new Set<string>();
  for (const n of effectiveNodes) {
    // Include asset-picker config fields which may store bare assetIds (not prefixed refs).
    if (registry) {
      const def = registry.get(String(n.type));
      for (const field of def?.configSchema ?? []) {
        const fieldRecord =
          field && typeof field === 'object' ? (field as Record<string, unknown>) : null;
        if (fieldRecord?.type !== 'asset-picker') continue;
        const key = typeof fieldRecord.key === 'string' ? fieldRecord.key : String(fieldRecord?.key ?? '');
        if (!key) continue;
        const configRecord =
          n.config && typeof n.config === 'object' ? (n.config as Record<string, unknown>) : null;
        const normalized = normalizeAssetPickerValue(configRecord?.[key]);
        if (normalized && !seen.has(normalized)) {
          seen.add(normalized);
          assetRefs.push(normalized);
        }
      }
    }

    collectAssetRefs(n.config ?? null, assetRefs, seen);
    collectAssetRefs(n.inputValues ?? null, assetRefs, seen);
  }

  return {
    rootNodeIds,
    graph: { nodes: effectiveNodes, connections: keptConnections },
    assetRefs,
  };
}
