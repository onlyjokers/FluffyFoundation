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
  const seen = new Set(inputs.map((input) => input.id));
  const derived: NodePort[] = [];
  for (const field of configSchema) {
    if (seen.has(field.key)) continue;
    const port = connectableConfigPortForField(field);
    if (!port) continue;
    seen.add(port.id);
    derived.push(port);
  }
  return [...inputs, ...derived];
};

export const nodeDefinitionWithConnectableConfigPorts = (definition: NodeDefinition): NodeDefinition => ({
  ...definition,
  inputs: inputsWithConnectableConfigPorts(definition.inputs, definition.configSchema),
});
