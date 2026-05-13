/**
 * Purpose: Boolean gate node definitions.
 */
import type { NodeDefinition } from '../../../types.js';
import { coerceBoolean } from '../../utils.js';

export function createLogicNotNode(): NodeDefinition {
  return {
    type: 'logic-not',
    label: 'NOT',
    category: 'Gate',
    inputs: [{ id: 'in', label: 'In', type: 'boolean', defaultValue: false }],
    outputs: [{ id: 'out', label: 'Out', type: 'boolean' }],
    configSchema: [],
    process: (inputs) => ({ out: !coerceBoolean(inputs.in) }),
  };
}

export function createLogicAndNode(): NodeDefinition {
  return {
    type: 'logic-and',
    label: 'AND',
    category: 'Gate',
    inputs: [
      { id: 'a', label: 'A', type: 'boolean', defaultValue: false },
      { id: 'b', label: 'B', type: 'boolean', defaultValue: false },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'boolean' }],
    configSchema: [],
    process: (inputs) => ({ out: coerceBoolean(inputs.a) && coerceBoolean(inputs.b) }),
  };
}

export function createLogicOrNode(): NodeDefinition {
  return {
    type: 'logic-or',
    label: 'OR',
    category: 'Gate',
    inputs: [
      { id: 'a', label: 'A', type: 'boolean', defaultValue: false },
      { id: 'b', label: 'B', type: 'boolean', defaultValue: false },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'boolean' }],
    configSchema: [],
    process: (inputs) => ({ out: coerceBoolean(inputs.a) || coerceBoolean(inputs.b) }),
  };
}

export function createLogicXorNode(): NodeDefinition {
  return {
    type: 'logic-xor',
    label: 'XOR',
    category: 'Gate',
    inputs: [
      { id: 'a', label: 'A', type: 'boolean', defaultValue: false },
      { id: 'b', label: 'B', type: 'boolean', defaultValue: false },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'boolean' }],
    configSchema: [],
    process: (inputs) => ({ out: coerceBoolean(inputs.a) !== coerceBoolean(inputs.b) }),
  };
}

export function createLogicNandNode(): NodeDefinition {
  return {
    type: 'logic-nand',
    label: 'NAND',
    category: 'Gate',
    inputs: [
      { id: 'a', label: 'A', type: 'boolean', defaultValue: false },
      { id: 'b', label: 'B', type: 'boolean', defaultValue: false },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'boolean' }],
    configSchema: [],
    process: (inputs) => ({ out: !(coerceBoolean(inputs.a) && coerceBoolean(inputs.b)) }),
  };
}

export function createLogicNorNode(): NodeDefinition {
  return {
    type: 'logic-nor',
    label: 'NOR',
    category: 'Gate',
    inputs: [
      { id: 'a', label: 'A', type: 'boolean', defaultValue: false },
      { id: 'b', label: 'B', type: 'boolean', defaultValue: false },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'boolean' }],
    configSchema: [],
    process: (inputs) => ({ out: !(coerceBoolean(inputs.a) || coerceBoolean(inputs.b)) }),
  };
}
