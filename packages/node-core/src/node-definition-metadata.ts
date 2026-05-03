/**
 * Purpose: Build FF-10 node metadata and compact AI-readable summaries.
 */
import type {
  ConfigField,
  NodeDefinition,
  NodeDefinitionMetadata,
  NodePort,
  NodeSideEffectClass,
  NodePlatformTarget,
} from './types.js';

const DEFAULT_VERSION = '1.0.0';

const CATEGORY_TARGETS: Record<string, NodePlatformTarget[]> = {
  AI: ['manager'],
  Assets: ['manager', 'client', 'display'],
  Audio: ['client'],
  Client: ['manager', 'client'],
  Effects: ['client', 'display'],
  Groups: ['manager'],
  Image: ['client', 'display'],
  Logic: ['manager', 'client'],
  Other: ['manager', 'client'],
  Player: ['manager', 'client', 'display'],
  Processors: ['manager', 'client'],
  Scenes: ['client', 'display'],
  Values: ['manager', 'client'],
};

const SIDE_EFFECT_BY_CATEGORY: Record<string, NodeSideEffectClass> = {
  AI: 'local-state',
  Assets: 'filesystem',
  Audio: 'media-playback',
  Client: 'sensor-read',
  Effects: 'remote-control',
  Groups: 'local-state',
  Image: 'none',
  Logic: 'none',
  Other: 'none',
  Player: 'remote-control',
  Processors: 'remote-control',
  Scenes: 'remote-control',
  Values: 'none',
};

const PERMISSIONS_BY_SIDE_EFFECT: Record<NodeSideEffectClass, string[]> = {
  none: [],
  'local-state': ['graph:state'],
  'remote-control': ['control:send'],
  'media-playback': ['media:playback'],
  'sensor-read': ['client:sensors'],
  network: ['network:access'],
  filesystem: ['asset:read'],
};

type PartialMetadata = Partial<NodeDefinitionMetadata> & {
  platformTargets?: NodePlatformTarget[];
  sideEffectClass?: NodeSideEffectClass;
};

const uniqueStrings = (values: unknown[]): string[] => {
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed || out.includes(trimmed)) continue;
    out.push(trimmed);
  }
  return out;
};

const normalizeTargets = (value: unknown, fallback: NodePlatformTarget[]): NodePlatformTarget[] => {
  const allowed: NodePlatformTarget[] = ['manager', 'client', 'display', 'server', 'worker', 'local-only'];
  const raw = Array.isArray(value) ? value : [];
  const targets = raw.filter((item): item is NodePlatformTarget => allowed.includes(item as NodePlatformTarget));
  return targets.length > 0 ? [...new Set(targets)] : [...fallback];
};

const normalizeSideEffect = (value: unknown, fallback: NodeSideEffectClass): NodeSideEffectClass => {
  const allowed: NodeSideEffectClass[] = [
    'none',
    'local-state',
    'remote-control',
    'media-playback',
    'sensor-read',
    'network',
    'filesystem',
  ];
  return allowed.includes(value as NodeSideEffectClass) ? (value as NodeSideEffectClass) : fallback;
};

export function inferNodeDefinitionMetadata(
  definition: Pick<NodeDefinition, 'type' | 'label' | 'category' | 'inputs' | 'outputs' | 'configSchema'>,
  metadata: PartialMetadata = {}
): NodeDefinitionMetadata {
  const fallbackTargets = CATEGORY_TARGETS[definition.category] ?? ['manager', 'client'];
  const sideEffectClass = normalizeSideEffect(
    metadata.sideEffectClass,
    SIDE_EFFECT_BY_CATEGORY[definition.category] ?? 'none'
  );
  const permissions = uniqueStrings([...(metadata.permissions ?? []), ...PERMISSIONS_BY_SIDE_EFFECT[sideEffectClass]]);
  const description =
    typeof metadata.description === 'string' && metadata.description.trim()
      ? metadata.description.trim()
      : `${definition.label} node in ${definition.category}.`;

  return {
    version:
      typeof metadata.version === 'string' && metadata.version.trim() ? metadata.version.trim() : DEFAULT_VERSION,
    platformTargets: normalizeTargets(metadata.platformTargets, fallbackTargets),
    sideEffectClass,
    permissions,
    compatibility: Array.isArray(metadata.compatibility) ? metadata.compatibility : [],
    examples: Array.isArray(metadata.examples) ? metadata.examples : [],
    risks: uniqueStrings(metadata.risks ?? []),
    description,
    ...(Array.isArray(metadata.repairHints) ? { repairHints: uniqueStrings(metadata.repairHints) } : {}),
  };
}

export function withNodeDefinitionMetadata(
  definition: NodeDefinition,
  metadata: PartialMetadata = {}
): NodeDefinition {
  return {
    ...definition,
    metadata: inferNodeDefinitionMetadata(definition, {
      ...(definition.metadata ?? {}),
      ...metadata,
    }),
  };
}

const summarizePort = (port: NodePort): Record<string, unknown> => ({
  id: port.id,
  type: port.type,
  ...(port.kind ? { kind: port.kind } : {}),
  ...(port.defaultValue !== undefined ? { default: port.defaultValue } : {}),
  ...(typeof port.min === 'number' ? { min: port.min } : {}),
  ...(typeof port.max === 'number' ? { max: port.max } : {}),
  ...(typeof port.step === 'number' ? { step: port.step } : {}),
});

const summarizeParam = (field: ConfigField): Record<string, unknown> => ({
  key: field.key,
  type: field.type,
  ...(field.defaultValue !== undefined ? { default: field.defaultValue } : {}),
  ...(typeof field.min === 'number' ? { min: field.min } : {}),
  ...(typeof field.max === 'number' ? { max: field.max } : {}),
  ...(typeof field.step === 'number' ? { step: field.step } : {}),
  ...(field.unit ? { unit: field.unit } : {}),
});

export type AgentNodeDefinitionSummary = {
  type: string;
  label: string;
  version: string;
  category: string;
  description: string;
  platforms: NodePlatformTarget[];
  sideEffects: NodeSideEffectClass;
  permissions: string[];
  ports: { inputs: Record<string, unknown>[]; outputs: Record<string, unknown>[] };
  params: Record<string, unknown>[];
  compatibility: NodeDefinitionMetadata['compatibility'];
  examples: NodeDefinitionMetadata['examples'];
  risks: string[];
  repairHints: string[];
};

export function createAgentNodeDefinitionSummary(definition: NodeDefinition): AgentNodeDefinitionSummary {
  const metadata = inferNodeDefinitionMetadata(definition, definition.metadata ?? {});
  return {
    type: definition.type,
    label: definition.label,
    version: metadata.version,
    category: definition.category,
    description: metadata.description,
    platforms: metadata.platformTargets,
    sideEffects: metadata.sideEffectClass,
    permissions: metadata.permissions,
    ports: {
      inputs: definition.inputs.map(summarizePort),
      outputs: definition.outputs.map(summarizePort),
    },
    params: definition.configSchema.map(summarizeParam),
    compatibility: metadata.compatibility,
    examples: metadata.examples,
    risks: metadata.risks,
    repairHints: metadata.repairHints ?? [],
  };
}
