/**
 * MIDI Template System (Manager)
 *
 * Registry MIDI no longer applies MIDI values directly to parameters.
 * Instead, it creates small Node Graph "templates" (simple MIDI → mapping → target chains).
 *
 * This file defines:
 * - A stable JSON format for import/export
 * - Detection of simple bindings from the current graph (for Registry ↔ Node Graph sync)
 * - Helpers to instantiate bindings into the NodeEngine
 */
import { nodeEngine, nodeRegistry } from '$lib/nodes';
import { getSelectOptionsForInput } from '$lib/nodes/selection-options';
import type { Connection, GraphState, NodeInstance } from '$lib/nodes/types';
import { parameterRegistry } from '$lib/parameters/registry';
import type { MidiSource } from './midi-node-bridge';

export type MidiBindingMode = 'REMOTE' | 'MODULATION';

export type MidiBindingTargetV1 =
  | {
      kind: 'node-input';
      nodeType: string;
      inputId: string;
      nodeConfig?: Record<string, unknown>;
    }
  | {
      kind: 'param';
      path: string;
      mode: MidiBindingMode;
    };

export type MidiBindingTemplateV1 = {
  id: string;
  label: string;
  source: MidiSource | null;
  /** Manager-only UI metadata. Optional and safe to ignore. */
  ui?: {
    collapsed?: {
      midi?: boolean;
      map?: boolean;
      target?: boolean;
    };
  };
  mapping: {
    min: number;
    max: number;
    invert: boolean;
    round: boolean;
  };
  target: MidiBindingTargetV1;
};

export type MidiTemplateFileV1 = {
  version: 1;
  bindings: MidiBindingTemplateV1[];
};

export type DetectedMidiBinding = {
  id: string;
  label: string;
  midiNodeId: string;
  mapNodeId: string;
  targetNodeId: string;
  targetPortId: string;
  template: MidiBindingTemplateV1;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isMidiSource(value: unknown): value is MidiSource {
  if (!isRecord(value)) return false;
  const type = value.type;
  if (type !== 'cc' && type !== 'note' && type !== 'pitchbend') return false;
  if (typeof value.channel !== 'number' || !Number.isFinite(value.channel)) return false;
  if (value.inputId !== undefined && typeof value.inputId !== 'string') return false;
  if (type !== 'pitchbend') {
    if (typeof value.number !== 'number' || !Number.isFinite(value.number)) return false;
  }
  return true;
}

function asNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function defaultNodeConfig(type: string): Record<string, unknown> {
  const def = nodeRegistry.get(type);
  const config: Record<string, unknown> = {};
  for (const field of def?.configSchema ?? []) config[field.key] = field.defaultValue;
  return config;
}

function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID?.() ?? Date.now()}`;
}

function portLabel(nodeType: string, inputId: string): string {
  const def = nodeRegistry.get(nodeType);
  const port = def?.inputs?.find((p) => p.id === inputId);
  return port?.label || inputId;
}

function nodeLabel(type: string): string {
  return nodeRegistry.get(type)?.label ?? type;
}

function mapConfigFromNode(node: NodeInstance | undefined): MidiBindingTemplateV1['mapping'] {
  const cfg = (node?.config ?? {}) as Record<string, unknown>;
  const integerFlag = Boolean(cfg.integer);
  const roundFlag = Boolean(cfg.round);
  return {
    min: asNumber(cfg.min, 0),
    max: asNumber(cfg.max, 1),
    invert: Boolean(cfg.invert),
    // `midi-map` supports `integer` as a newer alias for `round` (integer output).
    round: integerFlag || roundFlag,
  };
}

function midiSourceFromNode(node: NodeInstance | undefined): MidiSource | null {
  const cfg = (node?.config ?? {}) as Record<string, unknown>;
  const source = cfg.source ?? null;
  return source && typeof source === 'object' ? (source as MidiSource) : null;
}

export function detectMidiBindings(graph: GraphState): DetectedMidiBinding[] {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const connections = Array.isArray(graph.connections) ? graph.connections : [];
  const nodeById = new Map(nodes.map((n) => [String(n.id), n]));

  const incomingByNode = new Map<string, Connection[]>();
  const outgoingByNode = new Map<string, Connection[]>();
  for (const c of connections) {
    const src = String(c.sourceNodeId);
    const tgt = String(c.targetNodeId);
    const outs = outgoingByNode.get(src) ?? [];
    outs.push(c);
    outgoingByNode.set(src, outs);
    const ins = incomingByNode.get(tgt) ?? [];
    ins.push(c);
    incomingByNode.set(tgt, ins);
  }

  const bindings: DetectedMidiBinding[] = [];

  for (const mapNode of nodes.filter((n) => ['midi-map', 'midi-select-map'].includes(String(n.type)))) {
    const mapNodeId = String(mapNode.id);
    const incoming = (incomingByNode.get(mapNodeId) ?? []).filter((c) => String(c.targetPortId) === 'in');
    const outgoing = (outgoingByNode.get(mapNodeId) ?? []).filter((c) => String(c.sourcePortId) === 'out');

    // Simple binding = exactly one MIDI source feeding the mapping node and exactly one target edge.
    if (incoming.length !== 1) continue;
    if (outgoing.length !== 1) continue;

    const inConn = incoming[0]!;
    const outConn = outgoing[0]!;

    const midiNodeId = String(inConn.sourceNodeId);
    const midiNode = nodeById.get(midiNodeId);
    if (!midiNode) continue;
    if (String(midiNode.type) !== 'midi-fuzzy') continue;
    if (String(inConn.sourcePortId) !== 'value') continue;

    const targetNodeId = String(outConn.targetNodeId);
    const targetNode = nodeById.get(targetNodeId);
    if (!targetNode) continue;

    const targetPortId = String(outConn.targetPortId);
    const targetType = String(targetNode.type);

    if (
      targetType === 'manager-select-clients-range' ||
      targetType === 'manager-select-clients-object'
    ) {
      continue;
    }

    const source = midiSourceFromNode(midiNode);
    const mapping = mapConfigFromNode(mapNode);

    let target: MidiBindingTargetV1;
    let label = `${nodeLabel(targetType)} · ${portLabel(targetType, targetPortId)}`;
    if (targetType === 'param-set' && targetPortId === 'value') {
      const targetConfig = (targetNode.config ?? {}) as Record<string, unknown>;
      const path = String(targetConfig.path ?? '');
      const modeRaw = String(targetConfig.mode ?? 'REMOTE');
      const mode: MidiBindingMode = modeRaw === 'MODULATION' ? 'MODULATION' : 'REMOTE';
      label = path ? `Parameter · ${path}` : 'Parameter · (unset)';
      target = { kind: 'param', path, mode };
    } else {
      target = { kind: 'node-input', nodeType: targetType, inputId: targetPortId, nodeConfig: { ...targetNode.config } };
    }

    const template: MidiBindingTemplateV1 = {
      id: `binding:${midiNodeId}:${mapNodeId}:${targetNodeId}:${targetPortId}`,
      label,
      source,
      mapping,
      target,
    };

    bindings.push({
      id: template.id,
      label: template.label,
      midiNodeId,
      mapNodeId,
      targetNodeId,
      targetPortId,
      template,
    });
  }

  // Stable ordering for UI/export.
  bindings.sort((a, b) => a.label.localeCompare(b.label));
  return bindings;
}

export function exportMidiTemplateFile(
  graph: GraphState,
  opts: { isNodeCollapsed?: (nodeId: string) => boolean } = {}
): MidiTemplateFileV1 {
  const isNodeCollapsed = opts.isNodeCollapsed ?? null;
  const bindings = detectMidiBindings(graph).map((b) => {
    const tpl: MidiBindingTemplateV1 = { ...b.template };
    if (!isNodeCollapsed) return tpl;

    const midiCollapsed = Boolean(isNodeCollapsed(String(b.midiNodeId)));
    const mapCollapsed = Boolean(isNodeCollapsed(String(b.mapNodeId)));
    const targetCollapsed = Boolean(isNodeCollapsed(String(b.targetNodeId)));

    if (midiCollapsed || mapCollapsed || targetCollapsed) {
      tpl.ui = {
        collapsed: { midi: midiCollapsed, map: mapCollapsed, target: targetCollapsed },
      };
    }

    return tpl;
  });

  return { version: 1, bindings };
}

export function parseMidiTemplateFile(payload: unknown): MidiTemplateFileV1 | null {
  if (!isRecord(payload)) return null;
  if (payload.version !== 1) return null;
  const raw = payload.bindings;
  if (!Array.isArray(raw)) return null;

  const bindings: MidiBindingTemplateV1[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === 'string' ? item.id : '';
    const label = typeof item.label === 'string' ? item.label : '';
    const mappingRaw = isRecord(item.mapping) ? item.mapping : {};
    const targetRaw = isRecord(item.target) ? item.target : null;
    if (!targetRaw) continue;

    const mapping = {
      min: asNumber(mappingRaw.min, 0),
      max: asNumber(mappingRaw.max, 1),
      invert: Boolean(mappingRaw.invert),
      round: Boolean(mappingRaw.round),
    };

    const source = isMidiSource(item.source) ? item.source : null;

    const ui = (() => {
      const uiRaw = item.ui;
      if (!isRecord(uiRaw)) return undefined;
      const collapsedRaw = uiRaw.collapsed;
      if (!isRecord(collapsedRaw)) return undefined;
      return {
        collapsed: {
          midi: typeof collapsedRaw.midi === 'boolean' ? collapsedRaw.midi : undefined,
          map: typeof collapsedRaw.map === 'boolean' ? collapsedRaw.map : undefined,
          target: typeof collapsedRaw.target === 'boolean' ? collapsedRaw.target : undefined,
        },
      } satisfies MidiBindingTemplateV1['ui'];
    })();

    let target: MidiBindingTargetV1 | null = null;
    if (targetRaw.kind === 'param') {
      const path = typeof targetRaw.path === 'string' ? targetRaw.path : '';
      const modeRaw = String(targetRaw.mode ?? 'REMOTE');
      const mode: MidiBindingMode = modeRaw === 'MODULATION' ? 'MODULATION' : 'REMOTE';
      target = { kind: 'param', path, mode };
    } else if (targetRaw.kind === 'node-input') {
      const nodeType = typeof targetRaw.nodeType === 'string' ? targetRaw.nodeType : '';
      const inputId = typeof targetRaw.inputId === 'string' ? targetRaw.inputId : '';
      const nodeConfig = isRecord(targetRaw.nodeConfig) ? (targetRaw.nodeConfig as Record<string, unknown>) : undefined;
      if (nodeType && inputId) target = { kind: 'node-input', nodeType, inputId, nodeConfig };
    }

    if (!target) continue;
    bindings.push({ id, label, source, ui, mapping, target });
  }

  return { version: 1, bindings };
}

export type InstantiateOptions = {
  anchor?: { x: number; y: number };
};

export type InstantiatedBinding = {
  templateId: string;
  midiNodeId: string;
  mapNodeId: string;
  targetNodeId: string;
  targetPortId: string;
};

function computeDefaultAnchor(graph: GraphState): { x: number; y: number } {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  if (nodes.length === 0) return { x: 120, y: 120 };
  const maxX = Math.max(...nodes.map((n) => Number(n.position?.x ?? 0)));
  const minY = Math.min(...nodes.map((n) => Number(n.position?.y ?? 0)));
  return { x: maxX + 360, y: minY + 40 };
}

function instantiateNode(type: string, position: { x: number; y: number }, config?: Record<string, unknown>): string {
  const baseConfig = defaultNodeConfig(type);
  const instance: NodeInstance = {
    id: generateId('node'),
    type,
    position,
    config: { ...baseConfig, ...(config ?? {}) },
    inputValues: {},
    outputValues: {},
  };
  nodeEngine.addNode(instance);
  return instance.id;
}

function instantiateConnection(
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string
): string | null {
  const id = generateId('conn');
  const ok = nodeEngine.addConnection({ id, sourceNodeId, sourcePortId, targetNodeId, targetPortId });
  return ok ? id : null;
}

export function instantiateMidiBinding(template: MidiBindingTemplateV1, opts: InstantiateOptions = {}): InstantiatedBinding | null {
  const graph = nodeEngine.exportGraph();
  const anchor = opts.anchor ?? computeDefaultAnchor(graph);
  const midiPos = { x: anchor.x, y: anchor.y };
  const mapPos = { x: anchor.x + 260, y: anchor.y };
  const targetPos = { x: anchor.x + 520, y: anchor.y };

  const midiNodeId = instantiateNode('midi-fuzzy', midiPos, { source: template.source ?? null });
  let mapNodeType = 'midi-map';
  let mapConfig: Record<string, unknown> = { ...template.mapping };

  const target = template.target;
  if (target.kind === 'node-input') {
    const def = nodeRegistry.get(target.nodeType);
    const port = def?.inputs?.find((p) => p.id === target.inputId);
    const options = getSelectOptionsForInput(target.nodeType, target.inputId);
    if (port?.type === 'fuzzy' && options && options.length > 0) {
      mapNodeType = 'midi-select-map';
      mapConfig = { ...template.mapping, options };
    }
  }

  const mapNodeId = instantiateNode(mapNodeType, mapPos, mapConfig);

  let targetNodeId = '';
  let targetPortId = '';

  if (template.target.kind === 'param') {
    targetNodeId = instantiateNode('param-set', targetPos, {
      path: template.target.path,
      mode: template.target.mode,
    });
    targetPortId = 'value';
  } else if (template.target.kind === 'node-input') {
    if (!template.target.nodeType || !template.target.inputId) return null;
    targetNodeId = instantiateNode(template.target.nodeType, targetPos, template.target.nodeConfig ?? {});
    targetPortId = template.target.inputId;
  }

  const conn1 = instantiateConnection(midiNodeId, 'value', mapNodeId, 'in');
  const conn2 = instantiateConnection(mapNodeId, 'out', targetNodeId, targetPortId);
  if (!conn1 || !conn2) {
    nodeEngine.removeNode(mapNodeId);
    nodeEngine.removeNode(midiNodeId);
    if (targetNodeId) nodeEngine.removeNode(targetNodeId);
    return null;
  }

  return {
    templateId: String(template.id ?? ''),
    midiNodeId,
    mapNodeId,
    targetNodeId,
    targetPortId,
  };
}

export function instantiateMidiBindings(file: MidiTemplateFileV1, opts: InstantiateOptions = {}): InstantiatedBinding[] {
  const created: InstantiatedBinding[] = [];
  const anchor = opts.anchor;
  let yOffset = 0;

  for (const binding of file.bindings ?? []) {
    const next = instantiateMidiBinding(binding, anchor ? { anchor: { x: anchor.x, y: anchor.y + yOffset } } : {});
    if (next) {
      created.push(next);
      yOffset += 140;
    }
  }

  return created;
}

export function removeMidiBinding(binding: DetectedMidiBinding): void {
  const state = nodeEngine.exportGraph();
  const connections = Array.isArray(state.connections) ? state.connections : [];

  // Remove the binding edges first.
  for (const c of connections) {
    if (String(c.sourceNodeId) === binding.midiNodeId && String(c.targetNodeId) === binding.mapNodeId) {
      nodeEngine.removeConnection(c.id);
    }
    if (String(c.sourceNodeId) === binding.mapNodeId && String(c.targetNodeId) === binding.targetNodeId) {
      if (String(c.targetPortId) === binding.targetPortId) nodeEngine.removeConnection(c.id);
    }
  }

  const next = nodeEngine.exportGraph();
  const remaining = Array.isArray(next.connections) ? next.connections : [];

  const nodeHasEdges = (nodeId: string) =>
    remaining.some((c) => c.sourceNodeId === nodeId || c.targetNodeId === nodeId);

  // Remove mapping / MIDI nodes if they became isolated (safe for manual graphs).
  if (!nodeHasEdges(binding.mapNodeId)) nodeEngine.removeNode(binding.mapNodeId);
  if (!nodeHasEdges(binding.midiNodeId)) nodeEngine.removeNode(binding.midiNodeId);

  // Only auto-remove "target" nodes if they are template-ish utility nodes.
  const targetType = nodeEngine.getNode(binding.targetNodeId)?.type;
  const removableTarget = targetType === 'param-set';
  if (removableTarget && !nodeHasEdges(binding.targetNodeId)) nodeEngine.removeNode(binding.targetNodeId);
}

/**
 * Create a binding template from a registry parameter path.
 * Uses the parameter's min/max when available.
 */
export function templateForParam(path: string, mode: MidiBindingMode = 'REMOTE'): MidiBindingTemplateV1 | null {
  const param = parameterRegistry.get<number>(path);
  if (!param) return null;
  const min = typeof param.min === 'number' ? param.min : 0;
  const max = typeof param.max === 'number' ? param.max : 1;

  return {
    id: generateId('tpl'),
    label: `Parameter · ${path}`,
    source: null,
    mapping: { min, max, invert: false, round: false },
    target: { kind: 'param', path, mode },
  };
}

export function templateForNodeInput(opts: {
  nodeType: string;
  inputId: string;
  mapping: MidiBindingTemplateV1['mapping'];
  nodeConfig?: Record<string, unknown>;
}): MidiBindingTemplateV1 | null {
  if (!nodeRegistry.get(opts.nodeType)) return null;
  return {
    id: generateId('tpl'),
    label: `${nodeLabel(opts.nodeType)} · ${portLabel(opts.nodeType, opts.inputId)}`,
    source: null,
    mapping: opts.mapping,
    target: {
      kind: 'node-input',
      nodeType: opts.nodeType,
      inputId: opts.inputId,
      nodeConfig: opts.nodeConfig ?? {},
    },
  };
}
