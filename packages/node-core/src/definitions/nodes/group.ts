/**
 * Purpose: Internal node definitions used to model Group editor affordances (gate + proxy ports).
 */
import type { NodeDefinition } from '../../types.js';
import type { PortType } from '../../types.js';

export function createGroupGateNode(): NodeDefinition {
  return {
    type: 'group-gate',
    label: 'Group Gate',
    category: 'Internal',
    inputs: [{ id: 'active', label: 'Active', type: 'boolean', defaultValue: true }],
    outputs: [],
    configSchema: [{ key: 'groupId', label: 'Group ID', type: 'string', defaultValue: '' }],
    process: (inputs) => {
      const raw = inputs.active;
      const active = typeof raw === 'boolean' ? raw : true;
      // Note: `active` is intentionally returned via outputValues even though this node has no
      // declared outputs. Manager uses this as a lightweight runtime gate signal.
      return { active };
    },
  };
}

export function createGroupProxyNode(): NodeDefinition {
  const portTypes: PortType[] = [
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
    'client',
    'command',
    'fuzzy',
    'array',
    'any',
  ];
  return {
    type: 'group-proxy',
    label: 'Group Proxy',
    category: 'Internal',
    inputs: [{ id: 'in', label: 'In', type: 'any' }],
    outputs: [{ id: 'out', label: 'Out', type: 'any' }],
    configSchema: [
      { key: 'groupId', label: 'Group ID', type: 'string', defaultValue: '' },
      {
        key: 'direction',
        label: 'Direction',
        type: 'select',
        defaultValue: 'output',
        options: [
          { value: 'input', label: 'Input (left edge)' },
          { value: 'output', label: 'Output (right edge)' },
        ],
      },
      {
        key: 'portType',
        label: 'Port Type',
        type: 'select',
        defaultValue: 'any',
        options: portTypes.map((t) => ({ value: t, label: t })),
      },
      { key: 'pinned', label: 'Pinned', type: 'boolean', defaultValue: false },
    ],
    process: (inputs) => ({ out: inputs.in }),
  };
}
