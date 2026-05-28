/**
 * Purpose: Execute parsed Node Graph imports without binding to file inputs or template-specific UI.
 */
import type { NodeRegistry } from '@shugu/node-core';
import type { Connection, GraphState, NodeInstance } from '$lib/nodes/types';
import type { CustomNodeDefinition } from '$lib/nodes/custom-nodes/types';
import { cloneGraphGroups } from '../custom-nodes/custom-node-graph';
import type { NodeGroup } from '../controllers/group-controller';
import { remapImportedGroups, type ParsedNodeGraphFile } from './node-graph-file.js';

export type NodeGraphImportResult = {
  importedNodes: number;
  skippedNodes: number;
  importedConnections: number;
  skippedConnections: number;
  importedGroups: number;
  skippedGroups: number;
};

export type NodeGraphImportExecutorOptions = {
  parsedFile: ParsedNodeGraphFile;
  nodeRegistry: Pick<NodeRegistry, 'get'>;
  nodeEngine: {
    exportGraph: () => GraphState;
    addNode: (node: NodeInstance) => void;
    addConnection: (connection: Connection) => boolean;
    updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  };
  getNodeGroups: () => NodeGroup[];
  appendNodeGroups: (groups: NodeGroup[]) => void;
  getViewportCenterGraphPos: () => { x: number; y: number };
  createId: (prefix: string) => string;
  getDefaultNodeConfig?: (type: string) => Record<string, unknown>;
  addCustomNodeDefinition?: (definition: CustomNodeDefinition) => void;
  setNodeCollapsed?: (nodeId: string, collapsed: boolean) => Promise<void> | void;
  onSelectNodeIds?: (nodeIds: string[]) => void;
  onGraphImported?: (snapshot: { graph: GraphState; groups: NodeGroup[] }) => void | Promise<void>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const asRecord = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

function coerceGraphNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function computeTemplateOffset(nodes: unknown[], anchor: { x: number; y: number }) {
  const positions = (nodes ?? [])
    .map((node) => {
      const record = isRecord(node) ? node : {};
      const position = isRecord(record.position) ? record.position : {};
      return {
        x: coerceGraphNumber(position.x, 0),
        y: coerceGraphNumber(position.y, 0),
      };
    })
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (positions.length === 0) return { dx: 0, dy: 0 };

  const minX = Math.min(...positions.map((p) => p.x));
  const minY = Math.min(...positions.map((p) => p.y));
  const maxX = Math.max(...positions.map((p) => p.x));
  const maxY = Math.max(...positions.map((p) => p.y));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return { dx: anchor.x - centerX, dy: anchor.y - centerY };
}

function parseCustomNodeDefinitions(value: unknown): CustomNodeDefinition[] {
  if (!Array.isArray(value)) return [];
  const out: CustomNodeDefinition[] = [];
  for (const item of value) {
    const record = isRecord(item) ? item : null;
    const definitionId = typeof record?.definitionId === 'string' ? record.definitionId : '';
    if (!definitionId) continue;
    const template = isRecord(record?.template) ? record.template : {};
    const nodes = Array.isArray(template.nodes) ? template.nodes : [];
    const connections = Array.isArray(template.connections) ? template.connections : [];
    const ports = Array.isArray(record?.ports) ? record.ports : [];
    out.push({
      definitionId,
      name: typeof record?.name === 'string' ? record.name : '',
      template: {
        nodes: nodes as GraphState['nodes'],
        connections: connections as GraphState['connections'],
        ...(() => {
          const groups = cloneGraphGroups(template as GraphState);
          return groups.length > 0 ? { groups } : {};
        })(),
      },
      ports: ports as CustomNodeDefinition['ports'],
    });
  }
  return out;
}

function migrateLegacyTtsAudioChains(
  nodes: GraphState['nodes'],
  connections: GraphState['connections'],
  createId: (prefix: string) => string
): { nodes: GraphState['nodes']; connections: GraphState['connections'] } {
  const nodeById = new Map(nodes.map((node) => [String(node.id), node]));
  const nextNodes = nodes.slice();
  const nextConnections: GraphState['connections'] = [];

  for (const connection of connections) {
    const source = nodeById.get(String(connection.sourceNodeId));
    if (!source || String(source.type ?? '') !== 'generate-tts-audio' || String(connection.sourcePortId) !== 'audio') {
      nextConnections.push(connection);
      continue;
    }

    const ttsPosition = asRecord(source.position);
    const target = nodeById.get(String(connection.targetNodeId));
    const targetPosition = asRecord(target?.position);
    const loadNodeId = createId('node');
    nextNodes.push({
      id: loadNodeId,
      type: 'load-audio-from-assets',
      position: {
        x:
          (coerceGraphNumber(ttsPosition.x, 0) +
            coerceGraphNumber(targetPosition.x, coerceGraphNumber(ttsPosition.x, 0) + 240)) /
          2,
        y:
          (coerceGraphNumber(ttsPosition.y, 0) +
            coerceGraphNumber(targetPosition.y, coerceGraphNumber(ttsPosition.y, 0))) /
          2,
      },
      config: {
        assetId: '',
        playbackRate: 1,
        detune: 0,
        volume: 0,
        timeline: { startSec: 0, endSec: -1, cursorSec: -1 },
      },
      inputValues: {
        play: true,
        startSec: 0,
        endSec: -1,
        cursorSec: -1,
        loop: false,
        reverse: false,
        playbackRate: 1,
        detune: 0,
        volume: 0,
      },
      outputValues: {},
    });
    nextConnections.push({
      id: createId('conn'),
      sourceNodeId: String(source.id),
      sourcePortId: 'asset',
      targetNodeId: loadNodeId,
      targetPortId: 'asset',
    });
    nextConnections.push({
      ...connection,
      sourceNodeId: loadNodeId,
      sourcePortId: 'ref',
    });
  }

  return { nodes: nextNodes, connections: nextConnections };
}

export async function executeParsedNodeGraphImport(
  opts: NodeGraphImportExecutorOptions
): Promise<NodeGraphImportResult> {
  const sourceGraph = opts.parsedFile.graph;
  const rawSourceNodes = Array.isArray(sourceGraph.nodes) ? sourceGraph.nodes : [];
  const rawSourceConnections = Array.isArray(sourceGraph.connections)
    ? sourceGraph.connections
    : [];
  const source = migrateLegacyTtsAudioChains(
    rawSourceNodes as GraphState['nodes'],
    rawSourceConnections as GraphState['connections'],
    opts.createId
  );
  const sourceNodes = source.nodes;
  const sourceConnections = source.connections;

  for (const definition of parseCustomNodeDefinitions(opts.parsedFile.customNodes)) {
    opts.addCustomNodeDefinition?.(definition);
  }

  const importableNodes = sourceNodes.filter((node) => {
    const nodeRecord = asRecord(node);
    const type = String(nodeRecord.type ?? '');
    return Boolean(type && opts.nodeRegistry.get(type));
  });
  const { dx, dy } = computeTemplateOffset(importableNodes, opts.getViewportCenterGraphPos());
  const nodeIdMap = new Map<string, string>();
  const importedNodeIds: string[] = [];

  let importedNodes = 0;
  let skippedNodes = 0;

  for (const node of sourceNodes) {
    const nodeRecord = asRecord(node);
    const oldId = String(nodeRecord.id ?? '');
    const type = String(nodeRecord.type ?? '');
    if (!type || !opts.nodeRegistry.get(type)) {
      skippedNodes += 1;
      continue;
    }

    const newId = opts.createId('node');
    const position = asRecord(nodeRecord.position);
    const cfg = isRecord(nodeRecord.config)
      ? (nodeRecord.config as Record<string, unknown>)
      : {};
    const inputValues = isRecord(nodeRecord.inputValues)
      ? ({ ...(nodeRecord.inputValues as Record<string, unknown>) } as Record<string, unknown>)
      : {};

    const instance: NodeInstance = {
      id: newId,
      type,
      position: {
        x: coerceGraphNumber(position.x, 0) + dx,
        y: coerceGraphNumber(position.y, 0) + dy,
      },
      config: { ...(opts.getDefaultNodeConfig?.(type) ?? {}), ...cfg },
      inputValues,
      outputValues: {},
    };

    try {
      opts.nodeEngine.addNode(instance);
    } catch {
      skippedNodes += 1;
      continue;
    }

    if (oldId) nodeIdMap.set(oldId, newId);
    importedNodeIds.push(newId);
    importedNodes += 1;
  }

  let importedConnections = 0;
  let skippedConnections = 0;

  for (const c of sourceConnections) {
    const record = asRecord(c);
    const sourceNodeId = nodeIdMap.get(String(record.sourceNodeId ?? ''));
    const targetNodeId = nodeIdMap.get(String(record.targetNodeId ?? ''));
    if (!sourceNodeId || !targetNodeId) {
      skippedConnections += 1;
      continue;
    }

    const ok = opts.nodeEngine.addConnection({
      id: opts.createId('conn'),
      sourceNodeId,
      sourcePortId: String(record.sourcePortId ?? ''),
      targetNodeId,
      targetPortId: String(record.targetPortId ?? ''),
    });
    if (ok) importedConnections += 1;
    else skippedConnections += 1;
  }

  const { groups: importedGroups, groupIdMap } = remapImportedGroups(
    opts.parsedFile.groups,
    nodeIdMap,
    (group) => opts.createId(group?.kind === 'ai-space' ? 'ai-space:' : 'group:')
  );

  if (groupIdMap.size > 0) {
    for (const node of sourceNodes) {
      const nodeRecord = asRecord(node);
      const type = String(nodeRecord.type ?? '');
      if (!['group-activate', 'group-gate', 'group-proxy'].includes(type)) continue;
      const newNodeId = nodeIdMap.get(String(nodeRecord.id ?? ''));
      if (!newNodeId) continue;
      const config = asRecord(nodeRecord.config);
      const nextGroupId = groupIdMap.get(String(config.groupId ?? ''));
      if (!nextGroupId) continue;
      opts.nodeEngine.updateNodeConfig(newNodeId, { groupId: nextGroupId });
    }
  }

  if (importedGroups.length > 0) opts.appendNodeGroups(importedGroups);

  const collapsedImportedNodeIds = Array.from(
    new Set(
      (opts.parsedFile.collapsedNodeIds ?? [])
        .map((oldId) => nodeIdMap.get(String(oldId)))
        .filter(Boolean) as string[]
    )
  );
  for (const nodeId of collapsedImportedNodeIds) {
    await opts.setNodeCollapsed?.(String(nodeId), true);
  }

  if (importedNodeIds.length > 0) opts.onSelectNodeIds?.(importedNodeIds);
  if (importedNodeIds.length > 0) {
    await opts.onGraphImported?.({
      graph: opts.nodeEngine.exportGraph(),
      groups: opts.getNodeGroups(),
    });
  }

  return {
    importedNodes,
    skippedNodes,
    importedConnections,
    skippedConnections,
    importedGroups: importedGroups.length,
    skippedGroups: Math.max(0, opts.parsedFile.groups.length - importedGroups.length),
  };
}
