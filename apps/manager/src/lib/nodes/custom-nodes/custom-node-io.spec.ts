import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CustomNodeDefinition } from './types';
import type { NodeInstance } from '$lib/nodes/types';
import { buildCustomNodeFile } from './io';

const baseNode = (id: string): NodeInstance => ({
  id,
  type: 'number',
  position: { x: 0, y: 0 },
  config: {},
  inputValues: {},
  outputValues: {},
});

test('buildCustomNodeFile skips invalid template nodes', () => {
  const def: CustomNodeDefinition = {
    definitionId: 'def-1',
    name: 'Test',
    template: {
      nodes: [null as unknown as NodeInstance, baseNode('n1')],
      connections: [],
    },
    ports: [],
  };

  const file = buildCustomNodeFile([def], 'def-1');
  assert.equal(file.definitions.length, 1);
  assert.equal(file.definitions[0].template.nodes.length, 1);
  assert.equal(file.definitions[0].template.nodes[0].id, 'n1');
});
