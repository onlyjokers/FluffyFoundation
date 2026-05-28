/**
 * Purpose: Convert persisted Custom Node definitions into registry NodeDefinition entries.
 */
import type { CustomNodeDefinition } from './semantic-graph-types.js';
import type { ConfigField, NodeCompatibilityRule, NodeDefinition, NodeExample, NodePort, PortType } from './types.js';

export const CUSTOM_NODE_TYPE_PREFIX = 'custom:' as const;

export function customNodeType(definitionId: string): string {
  return `${CUSTOM_NODE_TYPE_PREFIX}${String(definitionId ?? '')}`;
}

const normalizePortType = (value: unknown): PortType => {
  const type = String(value ?? 'any') as PortType;
  const allowed: PortType[] = [
    'number',
    'boolean',
    'pulse',
    'string',
    'asset',
    'color',
    'audio',
    'image',
    'video',
    'scene',
    'effect',
    'print',
    'client',
    'command',
    'fuzzy',
    'array',
    'any',
  ];
  return allowed.includes(type) ? type : 'any';
};

const copyNumberHint = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const portFromCustomPort = (
  port: CustomNodeDefinition['ports'][number],
  inferred?: Pick<NodePort, 'defaultValue' | 'min' | 'max' | 'step'>
): NodePort => ({
  id: String(port.portKey ?? ''),
  label: String(port.label ?? port.portKey ?? ''),
  type: normalizePortType(port.type),
  ...(inferred?.defaultValue !== undefined ? { defaultValue: inferred.defaultValue } : {}),
  ...(copyNumberHint(inferred?.min) !== undefined ? { min: copyNumberHint(inferred?.min) } : {}),
  ...(copyNumberHint(inferred?.max) !== undefined ? { max: copyNumberHint(inferred?.max) } : {}),
  ...(copyNumberHint(inferred?.step) !== undefined ? { step: copyNumberHint(inferred?.step) } : {}),
});

const configFieldPortHints = (
  field: ConfigField | undefined
): Pick<NodePort, 'defaultValue' | 'min' | 'max' | 'step'> | undefined =>
  field
    ? {
        ...(field.defaultValue !== undefined ? { defaultValue: field.defaultValue } : {}),
        ...(copyNumberHint(field.min) !== undefined ? { min: copyNumberHint(field.min) } : {}),
        ...(copyNumberHint(field.max) !== undefined ? { max: copyNumberHint(field.max) } : {}),
        ...(copyNumberHint(field.step) !== undefined ? { step: copyNumberHint(field.step) } : {}),
      }
    : undefined;

const portHintsByBinding = (
  definition: CustomNodeDefinition,
  nodeDefinitions: Iterable<NodeDefinition>
): Map<string, Pick<NodePort, 'defaultValue' | 'min' | 'max' | 'step'>> => {
  const definitionsByType = new Map([...nodeDefinitions].map((nodeDefinition) => [nodeDefinition.type, nodeDefinition]));
  const nodeById = new Map((definition.template.nodes ?? []).map((node) => [String(node.id), node]));
  const hints = new Map<string, Pick<NodePort, 'defaultValue' | 'min' | 'max' | 'step'>>();

  for (const port of definition.ports ?? []) {
    const node = nodeById.get(String(port.binding?.nodeId ?? ''));
    if (!node) continue;
    const nodeDefinition = definitionsByType.get(String(node.type ?? ''));
    if (!nodeDefinition) continue;
    const portList = port.side === 'input' ? nodeDefinition.inputs : nodeDefinition.outputs;
    const boundPort = portList.find((candidate) => candidate.id === String(port.binding?.portId ?? ''));
    const field = nodeDefinition.configSchema.find((candidate) => candidate.key === String(port.binding?.portId ?? ''));
    const merged = {
      ...configFieldPortHints(field),
      ...(boundPort?.defaultValue !== undefined ? { defaultValue: boundPort.defaultValue } : {}),
      ...(copyNumberHint(boundPort?.min) !== undefined ? { min: copyNumberHint(boundPort?.min) } : {}),
      ...(copyNumberHint(boundPort?.max) !== undefined ? { max: copyNumberHint(boundPort?.max) } : {}),
      ...(copyNumberHint(boundPort?.step) !== undefined ? { step: copyNumberHint(boundPort?.step) } : {}),
    };
    if (Object.keys(merged).length > 0) hints.set(String(port.portKey), merged);
  }
  return hints;
};

const behavioralTemplateNodes = (definition: CustomNodeDefinition): CustomNodeDefinition['template']['nodes'] =>
  (definition.template.nodes ?? []).filter((node) => String(node.type ?? '') !== 'ai-note');

const internalNodeTypes = (definition: CustomNodeDefinition): string[] => [
  ...new Set(behavioralTemplateNodes(definition).map((node) => String(node.type ?? '')).filter(Boolean)),
];

const exampleConfig = (inputs: NodePort[]): Record<string, unknown> =>
  Object.fromEntries(inputs.filter((port) => port.defaultValue !== undefined).map((port) => [port.id, port.defaultValue]));

type AiNoteKind = 'description' | 'compatibility' | 'examples' | 'repairHints';

const AI_NOTE_KINDS = new Set<AiNoteKind>(['description', 'compatibility', 'examples', 'repairHints']);

type CustomNodeAiNotes = {
  description: string[];
  compatibility: string[];
  examples: string[];
  repairHints: string[];
};

const emptyCustomNodeAiNotes = (): CustomNodeAiNotes => ({
  description: [],
  compatibility: [],
  examples: [],
  repairHints: [],
});

const normalizeAiNoteKind = (value: unknown): AiNoteKind => {
  const kind = String(value ?? 'description');
  return AI_NOTE_KINDS.has(kind as AiNoteKind) ? (kind as AiNoteKind) : 'description';
};

const normalizeAiNoteText = (value: unknown): string => String(value ?? '').trim();

const collectCustomNodeAiNotes = (definition: CustomNodeDefinition): CustomNodeAiNotes => {
  const notes = emptyCustomNodeAiNotes();
  for (const node of definition.template.nodes ?? []) {
    if (String(node.type ?? '') !== 'ai-note') continue;
    const text = normalizeAiNoteText(node.config?.text);
    if (!text) continue;
    notes[normalizeAiNoteKind(node.config?.kind)].push(text);
  }
  return notes;
};

const manualCompatibility = (notes: readonly string[]): NodeCompatibilityRule[] =>
  notes.map((note) => ({
    target: 'custom-node-manual',
    rule: note,
  }));

const manualExamples = (name: string, notes: readonly string[]): NodeExample[] =>
  notes.map((note, index) => ({
    title: notes.length === 1 ? `${name} AI note example` : `${name} AI note example ${index + 1}`,
    summary: note,
  }));

const customNodeGatePort = (): NodePort => ({
  id: 'gate',
  label: 'Active',
  type: 'boolean',
  defaultValue: true,
});

export function createCustomNodeDefinitionNode(
  definition: CustomNodeDefinition,
  nodeDefinitions: Iterable<NodeDefinition> = []
): NodeDefinition {
  const inferredHints = portHintsByBinding(definition, nodeDefinitions);
  const inputs = [
    customNodeGatePort(),
    ...(definition.ports ?? [])
      .filter((port) => port.side === 'input' && port.portKey)
      .map((port) => portFromCustomPort(port, inferredHints.get(String(port.portKey)))),
  ];
  const outputs = (definition.ports ?? [])
    .filter((port) => port.side === 'output' && port.portKey)
    .map((port) => portFromCustomPort(port, inferredHints.get(String(port.portKey))));
  const innerTypes = internalNodeTypes(definition);
  const name = String(definition.name ?? 'Custom Node');
  const aiNotes = collectCustomNodeAiNotes(definition);
  const behavioralNodeCount = behavioralTemplateNodes(definition).length;
  const generatedDescription = `${name} custom node generated by Nodelization; wraps ${
    behavioralNodeCount
  } internal nodes${innerTypes.length > 0 ? ` (${innerTypes.join(', ')})` : ''}.`;

  return {
    type: customNodeType(definition.definitionId),
    label: name,
    category: 'Custom',
    metadata: {
      version: '1.0.0',
      platformTargets: ['manager', 'client', 'display'],
      sideEffectClass: 'local-state',
      permissions: ['graph:state'],
      compatibility: manualCompatibility(aiNotes.compatibility),
      examples: [
        {
          title: `${name} default inputs`,
          summary: 'Example generated from public input defaults inferred from the Nodelization template.',
          config: exampleConfig(inputs),
        },
        ...manualExamples(name, aiNotes.examples),
      ],
      risks: [],
      description: [generatedDescription, ...aiNotes.description].join('\n\n'),
      repairHints: [
        'Inspect the original Custom Node definition when inferred ports do not match intent.',
        ...aiNotes.repairHints,
      ],
    },
    inputs,
    outputs,
    configSchema: [],
    process: () => ({}),
  };
}
