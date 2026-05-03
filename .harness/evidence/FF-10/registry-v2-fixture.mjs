// Purpose: FF-10 evidence fixture for no-switch registry loading and AI-readable node summaries.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NodeRegistry,
  createSemanticGraphSnapshot,
} from '../../../packages/node-core/dist-node-core/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const createFixtureNode = () => ({
  type: 'fixture-auto-node',
  label: 'Fixture Auto Node',
  category: 'Logic',
  metadata: {
    version: '2.0.0',
    platformTargets: ['manager', 'client'],
    sideEffectClass: 'none',
    permissions: [],
    compatibility: [
      {
        target: 'number inputs',
        rule: 'value output can connect to number-compatible inputs',
        repairHint: 'Insert a converter before non-number targets.',
      },
    ],
    examples: [
      {
        title: 'Emit configured value',
        summary: 'Outputs the configured numeric value for downstream math nodes.',
        config: { value: 7 },
      },
    ],
    risks: ['Fixture node only; no runtime side effects.'],
    description: 'Evidence fixture proving factory registration does not require a global switch edit.',
    repairHints: ['Ensure the fixture factory is included in the loader input.'],
  },
  inputs: [{ id: 'in', label: 'In', type: 'number', defaultValue: 0, min: 0, max: 10, step: 1 }],
  outputs: [{ id: 'value', label: 'Value', type: 'number' }],
  configSchema: [
    { key: 'value', label: 'Value', type: 'number', defaultValue: 7, min: 0, max: 10, step: 1, unit: 'count' },
  ],
  process: (inputs, config) => ({
    value: typeof inputs.in === 'number' ? inputs.in : config.value ?? 7,
  }),
});

const registry = new NodeRegistry();
registry.registerFactories([createFixtureNode]);

const snapshot = createSemanticGraphSnapshot({
  graph: { nodes: [], connections: [] },
  definitions: registry.list(),
  revision: 10,
});

const fixture = snapshot.definitions.find((definition) => definition.type === 'fixture-auto-node');
if (!fixture?.aiSummary) {
  throw new Error('fixture-auto-node was not emitted in the AI context snapshot');
}

const output = {
  fixtureAppearsAutomatically: true,
  definitionCount: snapshot.definitions.length,
  fixture: fixture.aiSummary,
};

await fs.writeFile(
  path.join(__dirname, 'registry-v2-snapshot.json'),
  `${JSON.stringify(output, null, 2)}\n`
);

console.log(JSON.stringify(output, null, 2));
