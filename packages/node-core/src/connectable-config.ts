/**
 * Purpose: Derive semantic input ports from config fields that explicitly allow external wiring.
 */
import type { ConfigField, NodeDefinition, NodePort, PortType } from './types.js';

const CONNECTABLE_FIELD_TYPES = new Set<ConfigField['type']>(['string', 'number', 'boolean', 'select', 'color']);

const normalizeConnectablePortType = (field: ConfigField): PortType | null => {
  if (field.portType) return field.portType;
  if (field.type === 'select') return 'string';
  if (field.type === 'string' || field.type === 'number' || field.type === 'boolean' || field.type === 'color') {
    return field.type;
  }
  return null;
};

export const connectableConfigPortForField = (field: ConfigField): NodePort | null => {
  if (field.connectable !== true || !CONNECTABLE_FIELD_TYPES.has(field.type)) return null;
  const type = normalizeConnectablePortType(field);
  if (!type) return null;
  return {
    id: field.key,
    label: field.label,
    type,
    ...(typeof field.min === 'number' ? { min: field.min } : {}),
    ...(typeof field.max === 'number' ? { max: field.max } : {}),
    ...(typeof field.step === 'number' ? { step: field.step } : {}),
    ...(field.type === 'select' && field.options ? { options: field.options.map((option) => ({ ...option })) } : {}),
  };
};

export const inputsWithConnectableConfigPorts = (
  inputs: NodePort[],
  configSchema: ConfigField[]
): NodePort[] => {
  const byId = new Map(inputs.map((input) => [input.id, input]));
  const derived: NodePort[] = [];
  for (const field of configSchema) {
    const port = connectableConfigPortForField(field);
    if (!port) continue;
    const existing = byId.get(port.id);
    if (existing) {
      byId.set(port.id, {
        ...port,
        ...existing,
        options: existing.options ?? port.options,
        min: existing.min ?? port.min,
        max: existing.max ?? port.max,
        step: existing.step ?? port.step,
      });
      continue;
    }
    byId.set(port.id, port);
    derived.push(port);
  }
  return [...inputs.map((input) => byId.get(input.id) ?? input), ...derived];
};

export const nodeDefinitionWithConnectableConfigPorts = (definition: NodeDefinition): NodeDefinition => ({
  ...definition,
  inputs: inputsWithConnectableConfigPorts(definition.inputs, definition.configSchema),
});
