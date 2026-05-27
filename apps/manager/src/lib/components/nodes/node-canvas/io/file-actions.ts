/**
 * Purpose: Import/export actions for node graphs and MIDI templates.
 */
import { nodeRegistry } from '$lib/nodes/registry';
import type { Connection, GraphState, NodeInstance } from '$lib/nodes/types';
import { customNodeDefinitions } from '$lib/nodes/custom-nodes/store';
import type { CustomNodeDefinition } from '$lib/nodes/custom-nodes/types';
import type { NodeGroup } from '../controllers/group-controller';
import { cloneGraphGroups } from '../custom-nodes/custom-node-graph';
import {
  exportMidiTemplateFile,
  instantiateMidiBindings,
  parseMidiTemplateFile,
} from '$lib/features/midi/midi-templates';
import {
  getTemplateImportPayloadKind,
  parseNodeGraphFile,
  serializeNodeGroups,
  type NodeGraphUiV1,
  type ParsedNodeGraphFile,
  type NodeGraphFileV2,
} from './node-graph-file.js';
import { executeParsedNodeGraphImport } from './node-graph-import-executor.js';
import { get } from 'svelte/store';

type FileActionsOptions = {
  nodeEngine: {
    exportGraph: () => GraphState;
    addNode: (node: NodeInstance) => void;
    addConnection: (connection: Connection) => boolean;
    updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
  };
  getNodePosition?: (nodeId: string) => { x: number; y: number } | null;
  getNodeCollapsed?: (nodeId: string) => boolean;
  setNodeCollapsed?: (nodeId: string, collapsed: boolean) => Promise<void> | void;
  getImportGraphInput: () => HTMLInputElement | null;
  getImportTemplatesInput: () => HTMLInputElement | null;
  getNodeGroups: () => NodeGroup[];
  appendNodeGroups: (groups: NodeGroup[]) => void;
  addCustomNodeDefinition?: (definition: CustomNodeDefinition) => void;
  onSelectNodeIds?: (nodeIds: string[]) => void;
  onGraphImported?: (snapshot: { graph: GraphState; groups: NodeGroup[] }) => void | Promise<void>;
  getViewportCenterGraphPos: () => { x: number; y: number };
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

function coerceGraphNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function defaultNodeConfig(type: string): Record<string, unknown> {
  const def = nodeRegistry.get(type);
  const config: Record<string, unknown> = {};
  for (const field of def?.configSchema ?? []) config[field.key] = field.defaultValue;
  return config;
}

function generateId(prefix: string): string {
  const token = crypto.randomUUID?.() ?? Date.now();
  return prefix.endsWith(':') ? `${prefix}${token}` : `${prefix}-${token}`;
}

function cloneCustomNodeDefinitionsForGraphFile(): CustomNodeDefinition[] {
  return (get(customNodeDefinitions) ?? []).map((def) => ({
    definitionId: String(def.definitionId ?? ''),
    name: String(def.name ?? ''),
    template: {
      nodes: (def.template?.nodes ?? []).map((node) => ({
        ...node,
        config: { ...(node.config ?? {}) },
        inputValues: { ...(node.inputValues ?? {}) },
        outputValues: {},
      })),
      connections: (def.template?.connections ?? []).map((connection) => ({ ...connection })),
      ...(() => {
        const groups = cloneGraphGroups(def.template);
        return groups.length > 0 ? { groups } : {};
      })(),
    },
    ports: (def.ports ?? []).map((port) => ({
      portKey: String(port.portKey ?? ''),
      side: port.side === 'input' ? 'input' : 'output',
      label: String(port.label ?? ''),
      type: port.type,
      pinned: Boolean(port.pinned),
      y: typeof port.y === 'number' ? port.y : Number(port.y ?? 0),
      binding: {
        nodeId: String(port.binding?.nodeId ?? ''),
        portId: String(port.binding?.portId ?? ''),
      },
    })),
  }));
}

export function createFileActions(opts: FileActionsOptions) {
  const exportGraph = () => {
    const raw = opts.nodeEngine.exportGraph();
    const collapsedNodeIds = (raw.nodes ?? [])
      .map((node) => String(node.id ?? ''))
      .filter((id) => id && Boolean(opts.getNodeCollapsed?.(id)));
    const graph: GraphState = {
      nodes: (raw.nodes ?? []).map((n) => {
        const nodeId = String(n.id ?? '');
        const viewPos = nodeId ? opts.getNodePosition?.(nodeId) : null;
        const x = coerceGraphNumber(viewPos?.x, coerceGraphNumber(n.position?.x, 0));
        const y = coerceGraphNumber(viewPos?.y, coerceGraphNumber(n.position?.y, 0));
        return { ...n, position: { x, y }, outputValues: {} };
      }),
      connections: (raw.connections ?? []).map((c) => ({ ...c })),
    };
    const groups = serializeNodeGroups(opts.getNodeGroups?.() ?? []) as NodeGraphFileV2['groups'];
    const ui: NodeGraphUiV1 | undefined =
      collapsedNodeIds.length > 0
        ? { collapsedNodeIds: Array.from(new Set(collapsedNodeIds)) }
        : undefined;
    const customNodes = cloneCustomNodeDefinitionsForGraphFile();
    const file: NodeGraphFileV2 = {
      version: 2,
      kind: 'node-graph',
      graph,
      groups,
      ...(customNodes.length > 0 ? { customNodes } : {}),
      ui,
    };
    downloadJson(file, 'shugu-node-graph.json');
  };

  const importGraph = () => {
    opts.getImportGraphInput()?.click?.();
  };

  const importParsedNodeGraph = async (parsedFile: ParsedNodeGraphFile) => {
    const ok = confirm('Import graph from file? This will add nodes to the current graph.');
    if (!ok) return;

    const result = await executeParsedNodeGraphImport({
      parsedFile,
      nodeRegistry,
      nodeEngine: opts.nodeEngine,
      getNodeGroups: opts.getNodeGroups,
      appendNodeGroups: opts.appendNodeGroups,
      getViewportCenterGraphPos: opts.getViewportCenterGraphPos,
      createId: generateId,
      getDefaultNodeConfig: defaultNodeConfig,
      addCustomNodeDefinition: opts.addCustomNodeDefinition,
      setNodeCollapsed: opts.setNodeCollapsed,
      onSelectNodeIds: opts.onSelectNodeIds,
      onGraphImported: opts.onGraphImported,
    });

    const groupSuffix = parsedFile.groups.length
      ? `\nGroups: ${result.importedGroups} imported, ${result.skippedGroups} skipped`
      : '';
    alert(
      `Nodes: ${result.importedNodes} imported, ${result.skippedNodes} skipped\nConnections: ${result.importedConnections} imported, ${result.skippedConnections} skipped${groupSuffix}`
    );
  };

  const handleImportGraphChange = async (event: Event) => {
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

    const parsedFile = parseNodeGraphFile(parsed);
    if (!parsedFile) {
      alert('Unsupported graph format.');
      return;
    }

    await importParsedNodeGraph(parsedFile);
  };

  const exportTemplates = () => {
    const file = exportMidiTemplateFile(opts.nodeEngine.exportGraph(), {
      isNodeCollapsed: opts.getNodeCollapsed,
    });
    downloadJson(file, 'shugu-midi-templates.json');
  };

  const importTemplates = () => {
    opts.getImportTemplatesInput()?.click?.();
  };

  const handleImportTemplatesChange = async (event: Event) => {
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

    const payloadKind = getTemplateImportPayloadKind(parsed);
    if (payloadKind === 'node-graph') {
      const parsedFile = parseNodeGraphFile(parsed);
      if (!parsedFile) {
        alert('Unsupported graph format.');
        return;
      }
      await importParsedNodeGraph(parsedFile);
      return;
    }

    const templates = payloadKind === 'midi-template' ? parseMidiTemplateFile(parsed) : null;
    if (!templates) {
      alert('Unsupported template format (expected version: 1).');
      return;
    }

    const created = instantiateMidiBindings(templates, {
      anchor: opts.getViewportCenterGraphPos(),
    });
    if (created.length > 0 && typeof opts.setNodeCollapsed === 'function') {
      const templateById = new Map(
        (templates.bindings ?? []).map((tpl) => [String(tpl.id), tpl] as const)
      );
      for (const binding of created) {
        const tpl = templateById.get(String(binding.templateId));
        const collapsed = tpl?.ui?.collapsed;
        if (collapsed?.midi) await opts.setNodeCollapsed(String(binding.midiNodeId), true);
        if (collapsed?.map) await opts.setNodeCollapsed(String(binding.mapNodeId), true);
        if (collapsed?.target) await opts.setNodeCollapsed(String(binding.targetNodeId), true);
      }
    }
    if (created.length > 0) {
      const nodeIds = new Set<string>();
      for (const binding of created) {
        nodeIds.add(String(binding.midiNodeId));
        nodeIds.add(String(binding.mapNodeId));
        nodeIds.add(String(binding.targetNodeId));
      }
      opts.onSelectNodeIds?.(Array.from(nodeIds));
    }
    alert(`Imported ${created.length} template(s).`);
  };

  return {
    exportGraph,
    importGraph,
    handleImportGraphChange,
    exportTemplates,
    importTemplates,
    handleImportTemplatesChange,
  };
}
