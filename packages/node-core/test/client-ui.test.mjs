/**
 * Purpose: Unit tests for ClientUI node definitions.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { NodeRegistry, registerDefaultNodeDefinitions } from '../dist-node-core/index.js';

function buildRegistry(clientUi = {}, executeCommand = () => {}) {
  const registry = new NodeRegistry();
  registerDefaultNodeDefinitions(registry, {
    getClientId: () => null,
    getAllClientIds: () => [],
    getSelectedClientIds: () => [],
    getLatestSensor: () => null,
    getSensorForClientId: () => null,
    executeCommand,
    executeCommandForClientId: () => {},
    clientUi,
  });
  return registry;
}

test('client-button passes through ui chain when display is false and exposes no pressed pulse', () => {
  const registry = buildRegistry({
    consumeClientButtonPressed: () => true,
  });
  const def = registry.get('client-button');
  assert.ok(def, 'expected client-button definition');

  const inputChain = [{ type: 'input', nodeId: 'input-0' }];
  const out = def.process({ in: inputChain, display: false }, {}, { nodeId: 'button-1', time: 0, deltaTime: 0 });

  assert.deepEqual(out, { out: inputChain, pressed: false });
});

test('client-button appends to ui chain and consumes a pressed pulse once while visible', () => {
  let pressed = true;
  const registry = buildRegistry({
    consumeClientButtonPressed: () => {
      const next = pressed;
      pressed = false;
      return next;
    },
  });
  const def = registry.get('client-button');
  assert.ok(def, 'expected client-button definition');
  const context = { nodeId: 'button-1', time: 0, deltaTime: 0 };

  assert.deepEqual(def.process({ in: [], display: true }, {}, context), {
    out: [{ type: 'button', nodeId: 'button-1' }],
    pressed: true,
  });
  assert.deepEqual(def.process({ in: [], display: true }, {}, context), {
    out: [{ type: 'button', nodeId: 'button-1' }],
    pressed: false,
  });
});

test('client-input-box outputs submitted content and latches firstInputed', () => {
  const registry = buildRegistry({
    getClientUiState: () => ({
      displayed: true,
      pressed: false,
      inputContent: 'hello client',
      firstInputed: true,
    }),
  });
  const def = registry.get('client-input-box');
  assert.ok(def, 'expected client-input-box definition');

  const out = def.process({ in: [], display: true }, {}, { nodeId: 'input-1', time: 0, deltaTime: 0 });

  assert.deepEqual(out, {
    out: [{ type: 'input', nodeId: 'input-1' }],
    inputContent: 'hello client',
    firstInputed: true,
  });
});

test('client-input-box passes through ui chain and returns empty outputs when display is false', () => {
  const registry = buildRegistry({
    getClientUiState: () => ({
      displayed: true,
      pressed: false,
      inputContent: 'hidden text',
      firstInputed: true,
    }),
  });
  const def = registry.get('client-input-box');
  assert.ok(def, 'expected client-input-box definition');

  const inputChain = [{ type: 'button', nodeId: 'button-0' }];
  const out = def.process({ in: inputChain, display: false }, {}, { nodeId: 'input-1', time: 0, deltaTime: 0 });

  assert.deepEqual(out, { out: inputChain, inputContent: '', firstInputed: false });
});

test('record-sound-button exposes recording state and the latest recorded audio asset', () => {
  const registry = buildRegistry({
    getClientUiState: () => ({
      displayed: true,
      kind: 'record',
      pressed: false,
      inputContent: '',
      firstInputed: false,
      recording: false,
      assetId: 'recording-1',
      asset: 'asset:recording-1',
    }),
  });
  const def = registry.get('record-sound-button');
  assert.ok(def, 'expected record-sound-button definition');
  assert.deepEqual(
    def.outputs.map((output) => ({ id: output.id, type: output.type })),
    [
      { id: 'out', type: 'ui' },
      { id: 'recording', type: 'boolean' },
      { id: 'assetId', type: 'string' },
      { id: 'asset', type: 'asset' },
      { id: 'finish', type: 'pulse' },
    ]
  );

  const out = def.process({ in: [], display: true }, {}, { nodeId: 'record-1', time: 0, deltaTime: 0 });

  assert.deepEqual(out, {
    out: [{ type: 'record', nodeId: 'record-1' }],
    recording: false,
    assetId: 'recording-1',
    asset: 'asset:recording-1',
    finish: false,
  });
});

test('record-sound-button pulses finish once after recording completes', () => {
  let finished = true;
  const registry = buildRegistry({
    getClientUiState: () => ({
      displayed: true,
      kind: 'record',
      pressed: false,
      inputContent: '',
      firstInputed: false,
      recording: false,
      assetId: 'recording-1',
      asset: 'asset:recording-1',
    }),
    consumeRecordSoundFinished: () => {
      const next = finished;
      finished = false;
      return next;
    },
  });
  const def = registry.get('record-sound-button');
  assert.ok(def, 'expected record-sound-button definition');
  const context = { nodeId: 'record-1', time: 0, deltaTime: 0 };

  assert.deepEqual(def.process({ in: [], display: true }, {}, context), {
    out: [{ type: 'record', nodeId: 'record-1' }],
    recording: false,
    assetId: 'recording-1',
    asset: 'asset:recording-1',
    finish: true,
  });
  assert.deepEqual(def.process({ in: [], display: true }, {}, context), {
    out: [{ type: 'record', nodeId: 'record-1' }],
    recording: false,
    assetId: 'recording-1',
    asset: 'asset:recording-1',
    finish: false,
  });
});

test('record-sound-button passes through ui chain and hides recording outputs when display is false', () => {
  const registry = buildRegistry({
    getClientUiState: () => ({
      displayed: true,
      kind: 'record',
      pressed: false,
      inputContent: '',
      firstInputed: false,
      recording: true,
      assetId: 'recording-1',
      asset: 'asset:recording-1',
    }),
  });
  const def = registry.get('record-sound-button');
  assert.ok(def, 'expected record-sound-button definition');

  const inputChain = [{ type: 'button', nodeId: 'button-0' }];
  const out = def.process({ in: inputChain, display: false }, {}, { nodeId: 'record-1', time: 0, deltaTime: 0 });

  assert.deepEqual(out, { out: inputChain, recording: false, assetId: '', asset: '', finish: false });
});

test('ui-out sends clientUi commands and clears on disable', () => {
  const commands = [];
  const registry = buildRegistry({}, (cmd) => commands.push(cmd));
  const def = registry.get('ui-out');
  assert.ok(def, 'expected ui-out definition');

  const items = [{ type: 'button', nodeId: 'button-1' }, { type: 'input', nodeId: 'input-1' }];
  def.onSink?.({ in: items }, {}, { nodeId: 'ui-out-1', time: 0, deltaTime: 0 });
  def.onDisable?.({}, {}, { nodeId: 'ui-out-1', time: 0, deltaTime: 0 });

  assert.deepEqual(commands, [
    { action: 'clientUi', payload: { items } },
    { action: 'clientUi', payload: { items: [] } },
  ]);
});
