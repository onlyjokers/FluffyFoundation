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
  graph: Pick<GraphState, 'nodes' | 'connections' | 'groups'>;
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

function assetIdFromRef(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const normalized = normalizeAssetRef(raw.trim());
  if (!normalized) return null;
  return normalized.slice('asset:'.length);
}

function assetRefFromValue(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('asset:')) return trimmed;
  if (trimmed.startsWith('shugu://asset/')) return trimmed;
  return `asset:${trimmed}`;
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

const MANAGER_ONLY_SNAPSHOT_NODE_TYPES = new Set(['url-session']);

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
  const groups = Array.isArray(state.groups) ? state.groups : [];
  const byId = new Map(nodes.map((n) => [String(n.id), n]));
  const groupById = new Map(
    groups.map((group) => [String(group.id ?? ''), group] as const).filter(([id]) => Boolean(id))
  );
  const groupIdsByNodeId = new Map<string, string[]>();
  for (const group of groups) {
    const groupId = String(group.id ?? '');
    if (!groupId) continue;
    for (const nodeId of group.nodeIds ?? []) {
      const id = String(nodeId ?? '');
      if (!id) continue;
      const list = groupIdsByNodeId.get(id) ?? [];
      list.push(groupId);
      groupIdsByNodeId.set(id, list);
    }
  }
  const gateIdsByGroupId = new Map<string, string[]>();
  for (const node of nodes) {
    if (String(node.type ?? '') !== 'group-gate') continue;
    const groupId = String(node.config?.groupId ?? '');
    if (!groupId) continue;
    const list = gateIdsByGroupId.get(groupId) ?? [];
    list.push(String(node.id));
    gateIdsByGroupId.set(groupId, list);
  }

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
  const outgoingBySource = new Map<
    string,
    { targetNodeId: string; targetPortId: string; sourcePortId: string }[]
  >();
  for (const c of connections) {
    const targetNodeId = String(c.targetNodeId);
    const list = incomingByTarget.get(targetNodeId) ?? [];
    list.push({ sourceNodeId: String(c.sourceNodeId), targetPortId: String(c.targetPortId) });
    incomingByTarget.set(targetNodeId, list);

    const sourceNodeId = String(c.sourceNodeId);
    const outgoing = outgoingBySource.get(sourceNodeId) ?? [];
    outgoing.push({
      targetNodeId,
      targetPortId: String(c.targetPortId),
      sourcePortId: String(c.sourcePortId),
    });
    outgoingBySource.set(sourceNodeId, outgoing);
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
    if (
      (String(node.type) === 'load-audio-from-assets' ||
        String(node.type) === 'load-image-from-assets') &&
      String(targetPortId) === 'asset'
    )
      return false;
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

  const shouldStartFromClientUiOutput = (sourceNodeId: string, sourcePortId: string): boolean => {
    const node = byId.get(sourceNodeId);
    const type = String(node?.type ?? '');
    if (type === 'client-button') return sourcePortId === 'pressed';
    if (type === 'client-input-box')
      return sourcePortId === 'inputContent' || sourcePortId === 'firstInputed';
    if (type === 'record-sound-button')
      return sourcePortId === 'asset' || sourcePortId === 'assetId' || sourcePortId === 'recording' || sourcePortId === 'finish';
    return false;
  };
  const shouldTraverseDownstreamTarget = (targetNodeId: string, targetPortId: string): boolean => {
    if (!registry) return true;
    const node = byId.get(targetNodeId);
    if (!node) return true;
    if (String(node.type) === 'show-anything') return false;
    const def = registry.get(String(node.type));
    const port = def?.inputs?.find((p) => String(p.id) === String(targetPortId));
    const type = String(port?.type ?? 'any');
    if (type === 'client' || type === 'command') return false;
    return true;
  };
  const visitDownstream = (nodeId: string) => {
    const id = String(nodeId);
    if (!id || !keep.has(id)) return;
    const outgoing = outgoingBySource.get(id) ?? [];
    for (const edge of outgoing) {
      if (!shouldTraverseDownstreamTarget(String(edge.targetNodeId), String(edge.targetPortId)))
        continue;
      const before = keep.size;
      visit(String(edge.targetNodeId));
      if (keep.size !== before || keep.has(String(edge.targetNodeId))) {
        visitDownstream(String(edge.targetNodeId));
      }
    }
  };
  const addClientUiOutputDependencies = () => {
    let changed = false;
    const exported = Array.from(keep);
    for (const id of exported) {
      const outgoing = outgoingBySource.get(id) ?? [];
      for (const edge of outgoing) {
        if (!shouldStartFromClientUiOutput(id, edge.sourcePortId)) continue;
        if (!shouldTraverseDownstreamTarget(String(edge.targetNodeId), String(edge.targetPortId)))
          continue;
        const before = keep.size;
        visit(String(edge.targetNodeId));
        visitDownstream(String(edge.targetNodeId));
        if (keep.size !== before) changed = true;
      }
    }
    return changed;
  };

  while (addClientUiOutputDependencies()) {
    // Adding a downstream UI interaction consumer can expose another exported ClientUI node.
  }

  const addGroupAndAncestors = (out: Set<string>, groupId: string) => {
    const id = String(groupId ?? '');
    if (!id || out.has(id)) return;
    const group = groupById.get(id);
    if (!group) return;
    out.add(id);
    const parentId = group.parentId ? String(group.parentId) : '';
    if (parentId) addGroupAndAncestors(out, parentId);
  };
  const collectRetainedGroupIds = (nodeIds: Set<string>): Set<string> => {
    const out = new Set<string>();
    for (const nodeId of nodeIds) {
      for (const groupId of groupIdsByNodeId.get(String(nodeId)) ?? []) {
        addGroupAndAncestors(out, groupId);
      }
    }
    return out;
  };
  const addGroupGateDependencies = () => {
    let changed = false;
    const retainedGroupIds = collectRetainedGroupIds(keep);
    for (const groupId of retainedGroupIds) {
      for (const gateId of gateIdsByGroupId.get(groupId) ?? []) {
        const before = keep.size;
        visit(gateId);
        visitDownstream(gateId);
        if (keep.size !== before) changed = true;
      }
    }
    return changed;
  };

  const normalizeVariableName = (value: unknown, fallback = 'variable'): string => {
    const raw = typeof value === 'string' ? value.trim() : '';
    return raw || fallback;
  };
  const readSourceValue = (
    nodeId: string,
    sourcePortId: string,
    visiting = new Set<string>()
  ): unknown => {
    const source = byId.get(String(nodeId));
    const outputValue = source?.outputValues?.[sourcePortId];
    if (outputValue !== undefined) return outputValue;
    if (sourcePortId === 'value' && String(source?.type ?? '') === 'independent-variable-name') {
      return source?.config?.name;
    }
    if (sourcePortId === 'value' && String(source?.type ?? '') === 'string') {
      return source?.inputValues?.value ?? source?.config?.value;
    }
    if (String(source?.type ?? '') === 'group-proxy' && sourcePortId === 'out') {
      const proxyId = String(source?.id ?? '');
      if (!proxyId || visiting.has(proxyId)) return undefined;
      visiting.add(proxyId);
      const incoming = connections.find(
        (candidate) =>
          String(candidate.targetNodeId) === proxyId && String(candidate.targetPortId) === 'in'
      );
      if (!incoming) return undefined;
      return readSourceValue(
        String(incoming.sourceNodeId),
        String(incoming.sourcePortId),
        visiting
      );
    }
    return undefined;
  };
  const readNodeInputConnectionValue = (nodeId: string, portId: string): unknown => {
    const conn = connections.find(
      (candidate) =>
        String(candidate.targetNodeId) === nodeId && String(candidate.targetPortId) === portId
    );
    if (!conn) return undefined;
    return readSourceValue(String(conn.sourceNodeId), String(conn.sourcePortId));
  };
  const booleanVariableNameFor = (node: GraphState['nodes'][number]): string =>
    normalizeVariableName(
      readNodeInputConnectionValue(String(node.id), 'name') ?? node.config?.name
    );
  const addBooleanVariableSettersForExportedGetters = () => {
    let changed = false;
    const exportedGetterNames = new Set<string>();
    for (const id of keep) {
      const node = byId.get(id);
      if (!node || String(node.type) !== 'get-boolean-variable') continue;
      exportedGetterNames.add(booleanVariableNameFor(node));
    }
    if (exportedGetterNames.size === 0) return false;

    for (const node of nodes) {
      if (String(node.type) !== 'set-boolean-variable') continue;
      if (!exportedGetterNames.has(booleanVariableNameFor(node))) continue;
      const before = keep.size;
      visit(String(node.id));
      if (keep.size !== before) changed = true;
    }
    return changed;
  };

  while (true) {
    const before = keep.size;
    while (addGroupGateDependencies()) {
      // Group gates can add boolean getters that control runtime group activation.
    }
    while (addBooleanVariableSettersForExportedGetters()) {
      // Adding a setter can add another exported getter through connected config inputs.
    }
    while (addClientUiOutputDependencies()) {
      // Adding setters can expose more ClientUI feedback paths.
    }
    if (keep.size === before) break;
  }

  const keptNodes = nodes
    .filter((n) => keep.has(String(n.id)))
    .map((n) => ({
      ...n,
      config: { ...(n.config ?? {}) },
      inputValues: { ...(n.inputValues ?? {}) },
    }));
  const keptNodeIds = new Set(keptNodes.map((n) => String(n.id)));
  let keptConnections = connections.filter(
    (c) => keptNodeIds.has(String(c.sourceNodeId)) && keptNodeIds.has(String(c.targetNodeId))
  );

  const bypassGroupProxyNodes = () => {
    const proxyIds = keptNodes
      .filter((node) => String(node.type) === 'group-proxy')
      .map((node) => String(node.id))
      .filter(Boolean);
    if (proxyIds.length === 0) return;

    const connectionKey = (c: {
      sourceNodeId: string;
      sourcePortId: string;
      targetNodeId: string;
      targetPortId: string;
    }) => `${c.sourceNodeId}|${c.sourcePortId}|${c.targetNodeId}|${c.targetPortId}`;
    const dedupe = new Set(keptConnections.map(connectionKey));
    const rewired: GraphState['connections'] = [];

    for (const proxyId of proxyIds) {
      const incoming = keptConnections.filter(
        (connection) =>
          String(connection.targetNodeId) === proxyId && String(connection.targetPortId) === 'in'
      );
      const outgoing = keptConnections.filter(
        (connection) =>
          String(connection.sourceNodeId) === proxyId && String(connection.sourcePortId) === 'out'
      );

      for (const inc of incoming) {
        for (const out of outgoing) {
          if (String(inc.sourceNodeId) === String(out.targetNodeId)) continue;
          const next = {
            id: `bypass:${proxyId}:${String(inc.id)}->${String(out.id)}`,
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
    }

    const proxyIdSet = new Set(proxyIds);
    for (const proxyId of proxyIds) keptNodeIds.delete(proxyId);
    for (let i = keptNodes.length - 1; i >= 0; i -= 1) {
      if (proxyIdSet.has(String(keptNodes[i]?.id))) keptNodes.splice(i, 1);
    }
    keptConnections = keptConnections
      .filter(
        (connection) =>
          !proxyIdSet.has(String(connection.sourceNodeId)) &&
          !proxyIdSet.has(String(connection.targetNodeId))
      )
      .concat(rewired);
  };

  bypassGroupProxyNodes();

  const keptNodeById = new Map(keptNodes.map((node) => [String(node.id), node]));
  for (const node of keptNodes) {
    if (String(node.type) !== 'set-boolean-variable') continue;
    const setInput = keptConnections.find(
      (connection) =>
        String(connection.targetNodeId) === String(node.id) &&
        String(connection.targetPortId) === 'set'
    );
    if (!setInput) continue;
    const source = keptNodeById.get(String(setInput.sourceNodeId));
    if (!source || String(source.type) !== 'pulse-to-boolean') continue;
    if (String(source.config?.mode ?? 'toggle') !== 'toggle') continue;
    if (String(node.config?.mode ?? 'latchTrue') !== 'latchTrue') continue;
    // Toggle mode outputs a persistent boolean state. Deployed variable setters must follow
    // that state, otherwise the default pulse-latch setter ignores the false half of the toggle.
    node.config = { ...(node.config ?? {}), mode: 'followInput' };
  }

  const snapshotOnlyNodeIds = new Set(
    keptNodes
      .filter((node) => MANAGER_ONLY_SNAPSHOT_NODE_TYPES.has(String(node.type)))
      .map((node) => String(node.id))
      .filter(Boolean)
  );
  if (snapshotOnlyNodeIds.size > 0) {
    const keptNodeById = new Map(keptNodes.map((node) => [String(node.id), node]));
    for (const connection of keptConnections) {
      const sourceNodeId = String(connection.sourceNodeId);
      if (!snapshotOnlyNodeIds.has(sourceNodeId)) continue;
      const source = keptNodeById.get(sourceNodeId);
      const target = keptNodeById.get(String(connection.targetNodeId));
      if (!source || !target) continue;
      const value = source.outputValues?.[String(connection.sourcePortId)];
      if (value === undefined) continue;
      target.inputValues = {
        ...(target.inputValues ?? {}),
        [String(connection.targetPortId)]: value,
      };
    }
    for (const id of snapshotOnlyNodeIds) keptNodeIds.delete(id);
    for (let i = keptNodes.length - 1; i >= 0; i -= 1) {
      if (snapshotOnlyNodeIds.has(String(keptNodes[i]?.id))) keptNodes.splice(i, 1);
    }
    keptConnections = keptConnections.filter(
      (connection) =>
        !snapshotOnlyNodeIds.has(String(connection.sourceNodeId)) &&
        !snapshotOnlyNodeIds.has(String(connection.targetNodeId))
    );
  }

  const allNodeById = new Map(nodes.map((n) => [String(n.id), n]));

  for (const node of keptNodes) {
    if (
      String(node.type) !== 'load-audio-from-assets' &&
      String(node.type) !== 'load-image-from-assets'
    )
      continue;
    const assetInput = connections.find(
      (c) => String(c.targetNodeId) === String(node.id) && String(c.targetPortId) === 'asset'
    );
    if (!assetInput) continue;
    const source = allNodeById.get(String(assetInput.sourceNodeId));
    const raw = source?.outputValues?.[String(assetInput.sourcePortId)];
    const ref = assetRefFromValue(raw);
    const configAssetId =
      String(source?.type ?? '') === 'load-audio-asset-from-assets'
        ? source?.config?.assetId
        : undefined;
    const id =
      assetIdFromRef(raw) ??
      assetIdFromRef(configAssetId) ??
      (typeof raw === 'string' && raw.trim() ? raw.trim().split(/[?#]/)[0] : '');
    if (id) {
      node.config = { ...(node.config ?? {}), assetId: id };
      if (String(node.type) === 'load-image-from-assets' && ref) {
        node.inputValues = { ...(node.inputValues ?? {}), asset: ref };
      }
    }
  }

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
      return portType === 'scene' || portType === 'effect' || portType === 'ui';
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
        if (
          incoming.length === 0 &&
          outgoing.length > 0 &&
          shouldDropWhenDisabledStart(type, ports)
        )
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

  const nodeExecutionPriority = (nodeId: string): number => {
    const type = String(byId.get(String(nodeId))?.type ?? '');
    if (type === 'set-boolean-variable') return 0;
    if (type === 'get-boolean-variable') return 1;
    return 2;
  };

  effectiveNodes.sort(
    (a, b) =>
      nodeExecutionPriority(String(a.id)) - nodeExecutionPriority(String(b.id)) ||
      String(a.id).localeCompare(String(b.id))
  );
  keptConnections.sort(
    (a, b) =>
      String(a.sourceNodeId).localeCompare(String(b.sourceNodeId)) ||
      nodeExecutionPriority(String(a.targetNodeId)) -
        nodeExecutionPriority(String(b.targetNodeId)) ||
      String(a.id).localeCompare(String(b.id))
  );

  const assetRefs: string[] = [];
  const seen = new Set<string>();
  for (const n of effectiveNodes) {
    // Include asset-picker config fields which may store bare assetIds (not prefixed refs).
    if (registry) {
      const def = registry.get(String(n.type));
      for (const field of def?.configSchema ?? []) {
        const fieldRecord =
          field && typeof field === 'object' ? (field as unknown as Record<string, unknown>) : null;
        if (fieldRecord?.type !== 'asset-picker') continue;
        const key =
          typeof fieldRecord.key === 'string' ? fieldRecord.key : String(fieldRecord?.key ?? '');
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

  const effectiveNodeIds = new Set(effectiveNodes.map((node) => String(node.id)).filter(Boolean));
  const retainedGroupIds = collectRetainedGroupIds(effectiveNodeIds);
  const exportedGroups = groups
    .filter((group) => retainedGroupIds.has(String(group.id ?? '')))
    .map((group) => {
      const id = String(group.id ?? '');
      const parentId = group.parentId ? String(group.parentId) : '';
      return {
        id,
        parentId: parentId && retainedGroupIds.has(parentId) ? parentId : null,
        name: String(group.name ?? 'Group'),
        nodeIds: (group.nodeIds ?? []).map(String).filter((nodeId) => effectiveNodeIds.has(nodeId)),
        disabled: Boolean(group.disabled),
        minimized: Boolean(group.minimized),
        ...(typeof group.runtimeActive === 'boolean'
          ? { runtimeActive: Boolean(group.runtimeActive) }
          : {}),
      };
    });

  return {
    rootNodeIds,
    graph: {
      nodes: effectiveNodes,
      connections: keptConnections,
      ...(exportedGroups.length > 0 ? { groups: exportedGroups } : {}),
    },
    assetRefs,
  };
}
