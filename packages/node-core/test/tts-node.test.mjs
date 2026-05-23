/**
 * Purpose: Unit tests for the Aliyun TTS audio source node definition.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { NodeRegistry, registerDefaultNodeDefinitions } from '../dist-node-core/index.js';

function buildRegistry() {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    getLatestSensor: () => null,
    getSensorForClientId: () => null,
    executeCommand: () => {},
    executeCommandForClientId: () => {},
  });
  return registry;
}

test('aliyun-tts exposes text input and an audio output for Static Audio Player', () => {
  const registry = buildRegistry();
  const def = registry.get('aliyun-tts');
  assert.ok(def, 'expected aliyun-tts definition');

  assert.equal(def.label, 'Aliyun TTS');
  assert.equal(def.category, 'AI');
  assert.deepEqual(
    def.inputs.map((input) => ({ id: input.id, type: input.type, defaultValue: input.defaultValue })),
    [
      { id: 'text', type: 'string', defaultValue: '' },
      { id: 'play', type: 'boolean', defaultValue: true },
      { id: 'volume', type: 'number', defaultValue: 0 },
    ]
  );
  assert.deepEqual(def.outputs, [
    { id: 'ref', label: 'Audio Out', type: 'audio', kind: 'sink' },
  ]);
});

test('aliyun-tts process emits active audio only when text and play are present', () => {
  const registry = buildRegistry();
  const def = registry.get('aliyun-tts');
  assert.ok(def, 'expected aliyun-tts definition');

  const context = { nodeId: 'tts', time: 0, deltaTime: 0 };
  assert.deepEqual(def.process({ text: '你好', play: true }, {}, context), { ref: 1 });
  assert.deepEqual(def.process({ text: '你好', play: false }, {}, context), { ref: 0 });
  assert.deepEqual(def.process({ text: '   ', play: true }, {}, context), { ref: 0 });
});
