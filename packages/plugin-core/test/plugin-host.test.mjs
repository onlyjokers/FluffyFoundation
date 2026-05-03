// Purpose: FF-17 plugin host lifecycle tests for registry discovery, compatibility, rollback, and isolation.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPluginHost,
  createPluginRegistry,
  definePlugin,
  isPluginCompatible,
} from '../dist-out/index.js';

test('plugin registry discovers only protocol-compatible plugins and preserves contract metadata', () => {
  const registry = createPluginRegistry([
    definePlugin(
      {
        id: 'tone-bridge',
        version: '2.1.0',
        apiVersion: 1,
        capabilities: ['audio.playback', 'audio.analysis'],
        supportedProtocolVersions: [1],
        resourceBudget: {
          memoryMb: 96,
          cpuMsPerTick: 4,
        },
        sideEffects: ['audio', 'network'],
      },
      () => ({})
    ),
    definePlugin(
      {
        id: 'legacy-visual',
        version: '0.9.0',
        apiVersion: 1,
        capabilities: ['visual.scene'],
        supportedProtocolVersions: [0],
        sideEffects: ['visual'],
      },
      () => ({})
    ),
  ]);

  const discovered = registry.discover({ protocolVersion: 1, hostApiVersion: 1 });

  assert.equal(discovered.length, 1);
  assert.equal(discovered[0].manifest.id, 'tone-bridge');
  assert.deepEqual(discovered[0].manifest.capabilities, ['audio.playback', 'audio.analysis']);
  assert.deepEqual(discovered[0].manifest.resourceBudget, {
    memoryMb: 96,
    cpuMsPerTick: 4,
  });
  assert.equal(isPluginCompatible(discovered[0].manifest, { protocolVersion: 1, hostApiVersion: 1 }), true);
  assert.equal(isPluginCompatible(discovered[0].manifest, { protocolVersion: 0, hostApiVersion: 1 }), false);
});

test('plugin host rolls back a failed lifecycle step and isolates the failure to one plugin', async () => {
  const events = [];
  const commands = [];
  const host = createPluginHost({
    protocolVersion: 1,
    hostApiVersion: 1,
    registry: createPluginRegistry([
      definePlugin(
        {
          id: 'good-visual',
          version: '1.0.0',
          apiVersion: 1,
          capabilities: ['visual.scene'],
          supportedProtocolVersions: [1],
          sideEffects: ['visual'],
        },
        ({ emitCommand, emitEvent }) => ({
          async init() {
            emitEvent({ kind: 'plugin-event', name: 'good:init' });
          },
          async start() {
            emitCommand({ kind: 'plugin-command', command: 'enable-scene', payload: { scene: 'box' } });
          },
          async stop() {
            emitEvent({ kind: 'plugin-event', name: 'good:stop' });
          },
        })
      ),
      definePlugin(
        {
          id: 'bad-audio',
          version: '1.0.0',
          apiVersion: 1,
          capabilities: ['audio.playback'],
          supportedProtocolVersions: [1],
          sideEffects: ['audio'],
        },
        () => ({
          async init() {
            throw new Error('init failed');
          },
          async dispose() {
            events.push('bad:dispose');
          },
        })
      ),
    ]),
    commandSink: (command) => commands.push(command),
    eventSink: (event) => events.push(event.name),
  });

  const good = await host.activate('good-visual');
  assert.equal(good.status.state, 'started');
  assert.equal(host.getStatus('good-visual')?.state, 'started');

  const bad = await host.activate('bad-audio');
  assert.equal(bad.status.state, 'failed');
  assert.equal(bad.rollback?.applied, true);
  assert.equal(host.getStatus('bad-audio')?.state, 'failed');
  assert.equal(host.getStatus('good-visual')?.state, 'started');
  assert.deepEqual(commands, [{ kind: 'plugin-command', command: 'enable-scene', payload: { scene: 'box' } }]);
  assert.ok(events.includes('good:init'));
  assert.ok(events.includes('bad:dispose'));
});

test('plugin host exposes a read-only runtime view so plugins can only mutate through commands and events', async () => {
  const mutations = [];
  const host = createPluginHost({
    protocolVersion: 1,
    hostApiVersion: 1,
    registry: createPluginRegistry([
      definePlugin(
        {
          id: 'guarded-plugin',
          version: '1.0.0',
          apiVersion: 1,
          capabilities: ['core-state.read'],
          supportedProtocolVersions: [1],
          sideEffects: ['none'],
        },
        ({ state, emitCommand, emitEvent }) => ({
          async init() {
            try {
              state.core.count = 2;
            } catch {
              mutations.push('blocked');
            }
            emitCommand({ kind: 'plugin-command', command: 'increment', payload: { by: 1 } });
            emitEvent({ kind: 'plugin-event', name: 'guarded:init' });
          },
        })
      ),
    ]),
    commandSink: () => void 0,
    eventSink: () => void 0,
    coreState: { core: { count: 1 } },
  });

  const result = await host.activate('guarded-plugin');
  assert.equal(result.status.state, 'started');
  assert.equal(host.snapshot().core.core.count, 1);
  assert.deepEqual(mutations, ['blocked']);
});
