/**
 * Purpose: Unit tests for visual effect chain nodes + effect layer player.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NodeRegistry,
  registerDefaultNodeDefinitions,
} from '../dist-node-core/index.js';

function buildRegistry({ onCommand } = {}) {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    getLatestSensor: () => null,
    getSensorForClientId: () => null,
    executeCommand: onCommand ?? (() => {}),
    executeCommandForClientId: () => {},
  });
  return registry;
}

function nodeInstance(id, type, overrides = {}) {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    config: {},
    inputValues: {},
    outputValues: {},
    ...overrides,
  };
}

test('effect-ascii appends {type:\"ascii\"} to the chain', () => {
  const registry = buildRegistry();
  const def = registry.get('effect-ascii');
  assert.ok(def, 'expected effect-ascii definition');

  const context = { nodeId: 'n1', time: 0, deltaTime: 0 };
  const out = def.process({ in: [], resolution: 13 }, {}, context);
  assert.deepEqual(out, { out: [{ type: 'ascii', cellSize: 13 }] });
});

test('effect player emits visualEffects command and clear command', () => {
  const registry = buildRegistry();
  const effect = registry.get('effect-ascii');
  const player = registry.get('proc-visual-effects');
  assert.ok(effect, 'expected effect-ascii definition');
  assert.ok(player, 'expected proc-visual-effects definition');

  const chain = effect.process({ in: [], resolution: 9 }, {}, { nodeId: 'fx', time: 0, deltaTime: 0 });
  assert.deepEqual(
    player.process({ in: chain.out }, {}, { nodeId: 'out', time: 0, deltaTime: 0 }),
    {
      cmd: {
        action: 'visualEffects',
        payload: { effects: [{ type: 'ascii', cellSize: 9 }] },
      },
    }
  );

  assert.deepEqual(
    player.process({ in: [] }, {}, { nodeId: 'out', time: 16, deltaTime: 16 }),
    {
      cmd: {
        action: 'visualEffects',
        payload: { effects: [] },
      },
    }
  );
});
