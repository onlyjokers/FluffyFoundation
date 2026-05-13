// Import/export actions for Custom Node definition bundles.
import { get } from 'svelte/store';

import type { GraphState, NodeInstance } from '$lib/nodes/types';
import type { CustomNodeDefinition } from '$lib/nodes/custom-nodes/types';
import {
  buildCustomNodeFile,
  parseCustomNodeFile,
  remapImportedDefinitions,
} from '$lib/nodes/custom-nodes/io';
import {
  cloneInternalGraphForNewInstance,
  generateCustomNodeGroupId,
  readCustomNodeState,
  writeCustomNodeState,
} from '$lib/nodes/custom-nodes/instance';
import {
  customNodeDefinitions,
  customNodeType,
  getCustomNodeDefinition,
} from '$lib/nodes/custom-nodes/store';
import { definitionsInCycles } from '$lib/nodes/custom-nodes/deps';
import { asRecord } from '$lib/utils/value-guards';

type CustomNodeFileActionsOptions = {
  getSelectedNodeId: () => string;
  getViewportCenterGraphPos: () => { x: number; y: number };
  generateId: () => string;
  nodeEngine: {
    getNode: (nodeId: string) => NodeInstance | null | undefined;
    lastError?: { set?: (message: string) => void };
  };
  addCustomNodeDefinition: (definition: CustomNodeDefinition) => void;
  addNode: (node: NodeInstance) => void;
  clearSelection: () => void;
  setSelectedNode: (nodeId: string) => void;
  selectNodeIds: (nodeIds: string[]) => void;
  requestFramesUpdate: () => void;
  requestMinimapUpdate: () => void;
  setPendingFocusNodeIds: (nodeIds: string[]) => void;
};

const downloadJson = (payload: unknown, filename: string) => {
  if (typeof document === 'undefined') return;
  const data = JSON.stringify(payload, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const sanitizeFileName = (name: string) => {
  const raw = String(name ?? '').trim() || 'custom-node';
  return raw
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
};

const cloneInternalGraphForMotherInstance = (graph: GraphState, groupId: string): GraphState => {
  const gid = String(groupId ?? '');
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const connections = Array.isArray(graph?.connections) ? graph.connections : [];
  return {
    nodes: nodes.map((node) => {
      let config = { ...(node.config ?? {}) };
      const inputValues = { ...(node.inputValues ?? {}) };
      if (gid && (node.type === 'group-proxy' || node.type === 'group-gate')) {
        config = { ...config, groupId: gid };
      }
      return { ...node, config, inputValues, outputValues: {} };
    }),
    connections: connections.map((c) => ({ ...c })),
  };
};

export function createCustomNodeFileActions(options: CustomNodeFileActionsOptions) {
  const exportCustomNode = () => {
    const selectedNodeId = options.getSelectedNodeId();
    if (!selectedNodeId) {
      options.nodeEngine.lastError?.set?.('Select a Custom Node mother instance to export.');
      return;
    }
    const node = options.nodeEngine.getNode(String(selectedNodeId));
    const state = node ? readCustomNodeState(asRecord(node.config)) : null;
    if (!state || state.role !== 'mother') {
      options.nodeEngine.lastError?.set?.('Only a Custom Node mother instance can be exported.');
      return;
    }

    const def = getCustomNodeDefinition(state.definitionId);
    if (!def) {
      options.nodeEngine.lastError?.set?.('Missing Custom Node definition.');
      return;
    }

    const file = buildCustomNodeFile(get(customNodeDefinitions) ?? [], state.definitionId);
    downloadJson(file, `${sanitizeFileName(def.name)}.shugu-node.json`);
  };

  const handleImportCustomNodeChange = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      alert('Invalid JSON file.');
      return;
    }

    const parsedFile = parseCustomNodeFile(parsed);
    if (!parsedFile) {
      alert('Unsupported Custom Node file format.');
      return;
    }

    const ok = confirm('Import Custom Node definitions from file?');
    if (!ok) return;

    try {
      const importedDefs = parsedFile.definitions ?? [];
      const remapped = remapImportedDefinitions(importedDefs);

      const inCycleImported = definitionsInCycles(remapped.definitions);
      if (inCycleImported.size > 0) {
        const ids = Array.from(inCycleImported).map(String).filter(Boolean);
        alert(`Import rejected: cyclic Custom Node nesting detected.\n\n${ids.join(' -> ')}`);
        return;
      }

      const existing = get(customNodeDefinitions) ?? [];
      const merged = [...existing, ...remapped.definitions];
      const inCycleMerged = definitionsInCycles(merged);
      if (inCycleMerged.size > 0) {
        const ids = Array.from(inCycleMerged).map(String).filter(Boolean);
        alert(`Import rejected: would introduce cyclic nesting.\n\n${ids.join(' -> ')}`);
        return;
      }

      for (const def of remapped.definitions) {
        options.addCustomNodeDefinition(def);
      }

      const rootOld = String(parsedFile.rootDefinitionId ?? '');
      const rootId = remapped.idMap.get(rootOld) ?? '';
      const rootDef = rootId
        ? remapped.definitions.find((d) => String(d.definitionId) === rootId)
        : null;
      if (!rootDef) {
        options.nodeEngine.lastError?.set?.('Import failed: missing remapped root definition.');
        return;
      }

      const nestedMothers = new Set<string>();
      for (const def of remapped.definitions) {
        const nodes = Array.isArray(def.template?.nodes) ? def.template.nodes : [];
        for (const node of nodes) {
          const st = readCustomNodeState(asRecord(node.config));
          if (st && st.role === 'mother') nestedMothers.add(String(st.definitionId));
        }
      }

      const toCreate = new Set<string>();
      toCreate.add(String(rootDef.definitionId));
      for (const def of remapped.definitions) {
        const did = String(def.definitionId ?? '');
        if (!did) continue;
        if (nestedMothers.has(did)) continue;
        toCreate.add(did);
      }

      const center = options.getViewportCenterGraphPos();
      const defsToCreate = remapped.definitions.filter((d) => toCreate.has(String(d.definitionId)));
      defsToCreate.sort((a, b) => {
        if (String(a.definitionId) === String(rootDef.definitionId)) return -1;
        if (String(b.definitionId) === String(rootDef.definitionId)) return 1;
        return String(a.name ?? '').localeCompare(String(b.name ?? ''));
      });

      const createdNodeIds: string[] = [];
      const spacingX = 260;
      const spacingY = 180;
      let col = 0;
      let row = 0;
      for (const def of defsToCreate) {
        const did = String(def.definitionId ?? '');
        if (!did) continue;

        const groupId = generateCustomNodeGroupId();
        const internal = cloneInternalGraphForMotherInstance(def.template, groupId);
        const nodeId = options.generateId();
        const pos = {
          x: center.x + col * spacingX,
          y: center.y + row * spacingY,
        };
        col += 1;
        if (col >= 3) {
          col = 0;
          row += 1;
        }

        options.addNode({
          id: nodeId,
          type: customNodeType(did),
          position: pos,
          config: writeCustomNodeState(
            {},
            {
              definitionId: did,
              groupId,
              role: 'mother',
              manualGate: true,
              internal,
            }
          ),
          inputValues: {},
          outputValues: {},
        });
        createdNodeIds.push(nodeId);
      }

      if (createdNodeIds.length > 0) {
        options.clearSelection();
        options.setSelectedNode('');
        options.selectNodeIds(createdNodeIds);
        options.requestFramesUpdate();
        options.requestMinimapUpdate();
        options.setPendingFocusNodeIds(createdNodeIds);
      }
    } catch (err) {
      console.error('[CustomNodeImport] failed', err);
      alert('Custom Node import failed. See console for details.');
    }
  };

  return { exportCustomNode, handleImportCustomNodeChange };
}
