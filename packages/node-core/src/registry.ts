import type { ConfigField, NodeDefinition, NodePort } from './types.js';
import {
  createAgentNodeDefinitionSummary,
  withNodeDefinitionMetadata,
  type AgentNodeDefinitionSummary,
} from './node-definition-metadata.js';

type NodeDefinitionOverlay = {
  type: string;
  label?: string;
  category?: string;
  inputs?: Array<Partial<NodePort> & Pick<NodePort, 'id'>>;
  outputs?: Array<Partial<NodePort> & Pick<NodePort, 'id'>>;
  configSchema?: Array<Partial<ConfigField> & Pick<ConfigField, 'key'>>;
  metadata?: Partial<NodeDefinition['metadata']>;
};

type NodeRegistryLoaderInput = {
  factories?: Iterable<() => NodeDefinition>;
  definitions?: Iterable<NodeDefinition>;
  overlays?: Iterable<NodeDefinitionOverlay>;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function mergeMin(baseMin: number | undefined, overlayMin: unknown): number | undefined {
  const ov = isFiniteNumber(overlayMin) ? overlayMin : undefined;
  if (ov === undefined) return baseMin;
  if (baseMin === undefined) return ov;
  return Math.max(baseMin, ov);
}

function mergeMax(baseMax: number | undefined, overlayMax: unknown): number | undefined {
  const ov = isFiniteNumber(overlayMax) ? overlayMax : undefined;
  if (ov === undefined) return baseMax;
  if (baseMax === undefined) return ov;
  return Math.min(baseMax, ov);
}

function mergeStep(baseStep: number | undefined, overlayStep: unknown): number | undefined {
  const ov = isFiniteNumber(overlayStep) ? overlayStep : undefined;
  if (ov === undefined || ov <= 0) return baseStep;
  return ov;
}

function mergePorts(basePorts: NodePort[], overlayPorts: unknown): NodePort[] {
  if (!Array.isArray(overlayPorts) || overlayPorts.length === 0) return basePorts;

  const byId = new Map<string, Record<string, unknown>>();
  for (const raw of overlayPorts) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : '';
    if (!id) continue;
    byId.set(id, record);
  }

  return basePorts.map((port) => {
    const overlay = byId.get(port.id);
    if (!overlay) return port;
    const overlayType = typeof overlay.type === 'string' ? overlay.type : '';
    if (overlayType && overlayType !== port.type) return port;

    const label = typeof overlay.label === 'string' && overlay.label.trim() ? overlay.label.trim() : port.label;
    const min = mergeMin(port.min, overlay.min);
    const max = mergeMax(port.max, overlay.max);
    const step = mergeStep(port.step, overlay.step);
    const safeMin = min !== undefined && max !== undefined && min > max ? port.min : min;
    const safeMax = min !== undefined && max !== undefined && min > max ? port.max : max;

    return { ...port, label, min: safeMin, max: safeMax, step };
  });
}

function mergeConfigSchema(baseSchema: ConfigField[], overlaySchema: unknown): ConfigField[] {
  if (!Array.isArray(overlaySchema) || overlaySchema.length === 0) return baseSchema;

  const byKey = new Map<string, Record<string, unknown>>();
  for (const raw of overlaySchema) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    const key = typeof record.key === 'string' ? record.key : '';
    if (!key) continue;
    byKey.set(key, record);
  }

  return baseSchema.map((field) => {
    const overlay = byKey.get(field.key);
    if (!overlay) return field;
    const overlayType = typeof overlay.type === 'string' ? overlay.type : '';
    if (overlayType && overlayType !== field.type) return field;

    const label = typeof overlay.label === 'string' && overlay.label.trim() ? overlay.label.trim() : field.label;
    const min = mergeMin(field.min, overlay.min);
    const max = mergeMax(field.max, overlay.max);
    const step = mergeStep(field.step, overlay.step);
    const safeMin = min !== undefined && max !== undefined && min > max ? field.min : min;
    const safeMax = min !== undefined && max !== undefined && min > max ? field.max : max;
    const unit = typeof overlay.unit === 'string' && overlay.unit.trim() ? overlay.unit.trim() : field.unit;

    return { ...field, label, min: safeMin, max: safeMax, step, unit };
  });
}

export function applyNodeDefinitionOverlay(base: NodeDefinition, overlay: NodeDefinitionOverlay): NodeDefinition {
  const label = typeof overlay.label === 'string' && overlay.label.trim() ? overlay.label.trim() : base.label;
  const category =
    typeof overlay.category === 'string' && overlay.category.trim() ? overlay.category.trim() : base.category;
  const definition = {
    ...base,
    label,
    category,
    inputs: mergePorts(base.inputs, overlay.inputs),
    outputs: mergePorts(base.outputs, overlay.outputs),
    configSchema: mergeConfigSchema(base.configSchema, overlay.configSchema),
  };
  return withNodeDefinitionMetadata(definition, {
    ...(base.metadata ?? {}),
    ...(overlay.metadata ?? {}),
  });
}

export class NodeRegistry {
  private definitions = new Map<string, NodeDefinition>();

  register(definition: NodeDefinition): void {
    this.definitions.set(definition.type, withNodeDefinitionMetadata(definition));
  }

  unregister(type: string): void {
    this.definitions.delete(type);
  }

  get(type: string): NodeDefinition | undefined {
    return this.definitions.get(type);
  }

  list(): NodeDefinition[] {
    return Array.from(this.definitions.values());
  }

  listByCategory(): Map<string, NodeDefinition[]> {
    const categories = new Map<string, NodeDefinition[]>();
    for (const def of this.definitions.values()) {
      const list = categories.get(def.category) ?? [];
      list.push(def);
      categories.set(def.category, list);
    }
    return categories;
  }

  listAgentSummaries(): AgentNodeDefinitionSummary[] {
    return this.list().map((definition) => createAgentNodeDefinitionSummary(definition));
  }

  registerFactories(factories: Iterable<() => NodeDefinition>): void {
    for (const createDefinition of factories) {
      this.register(createDefinition());
    }
  }

  load(input: NodeRegistryLoaderInput): void {
    if (input.factories) {
      this.registerFactories(input.factories);
    }

    if (input.definitions) {
      for (const definition of input.definitions) {
        this.register(definition);
      }
    }

    if (input.overlays) {
      for (const overlay of input.overlays) {
        const existing = this.get(overlay.type);
        if (!existing) continue;
        this.register(applyNodeDefinitionOverlay(existing, overlay));
      }
    }
  }
}
