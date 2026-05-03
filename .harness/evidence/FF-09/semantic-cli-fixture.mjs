// Purpose: FF-09 CLI fixture proving the same semantic operation as the Canvas command adapter.

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createSemanticCommandBus } from '../../../packages/node-core/dist-node-core/semantic-command-bus.js';

const here = dirname(fileURLToPath(import.meta.url));
const resultPath = join(here, 'semantic-cli-result.json');

const definitions = [
  {
    type: 'number',
    label: 'Number',
    category: 'Values',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [{ key: 'value', label: 'Value', type: 'number', defaultValue: 1 }],
  },
  {
    type: 'math',
    label: 'Math',
    category: 'Logic',
    inputs: [{ id: 'a', label: 'A', type: 'number' }],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [],
  },
];

const graph = {
  nodes: [
    {
      id: 'n1',
      type: 'number',
      position: { x: 10, y: 20 },
      config: { value: 4 },
      inputValues: {},
      outputValues: {},
    },
  ],
  connections: [],
};

const command = {
  type: 'node.add',
  node: {
    id: 'n2',
    type: 'math',
    position: { x: 100, y: 40 },
    config: {},
    inputValues: {},
    outputValues: {},
  },
};

const connectCommand = {
  type: 'node.connect',
  connection: {
    id: 'c1',
    sourceNodeId: 'n1',
    sourcePortId: 'out',
    targetNodeId: 'n2',
    targetPortId: 'a',
  },
};

const run = (actorId) => {
  const bus = createSemanticCommandBus({ graph, definitions, revision: 1 });
  const first = bus.dispatch({ actor: { id: actorId, role: 'operator' }, command });
  const second = bus.dispatch({ actor: { id: actorId, role: 'operator' }, command: connectCommand });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  return bus.getSnapshot();
};

const canvasSnapshot = run('canvas');
const cliSnapshot = run('cli');

assert.deepEqual(cliSnapshot.nodes, canvasSnapshot.nodes);
assert.deepEqual(cliSnapshot.connections, canvasSnapshot.connections);

writeFileSync(
  resultPath,
  `${JSON.stringify(
    {
      ok: true,
      operation: 'add math node and connect number.out to math.a',
      canvasRevision: canvasSnapshot.revision,
      cliRevision: cliSnapshot.revision,
      nodes: cliSnapshot.nodes.map((node) => ({ id: node.id, type: node.type, params: node.params })),
      connections: cliSnapshot.connections,
    },
    null,
    2
  )}\n`
);

console.log(`FF-09 semantic CLI parity fixture wrote ${resultPath}`);
