/**
 * Purpose: Verify server-owned semantic graph authority, persistence, and snapshots.
 */
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';
import { test } from 'node:test';

import { SemanticGraphAuthorityService } from './semantic-graph-authority.service.js';
import { SemanticModule } from './semantic.module.js';

const numberNode = {
  id: 'n1',
  type: 'number',
  position: { x: 10, y: 20 },
  config: { value: 1 },
  inputValues: {},
  outputValues: {},
};

function createService() {
  const dir = mkdtempSync(join(tmpdir(), 'shugu-semantic-'));
  const path = join(dir, 'semantic-graph.json');
  return { path, service: SemanticGraphAuthorityService.withStoragePath(path) };
}

test('SemanticGraphAuthorityService persists accepted graph mutations and restores them on restart', () => {
  const { path, service } = createService();

  const added = service.dispatch({
    actor: { id: 'cli', role: 'operator' },
    command: { type: 'node.add', node: numberNode },
  });

  assert.equal(added.ok, true);
  assert.equal(added.appliedRevision, 1);
  assert.equal(service.getSnapshot().nodes[0]?.id, 'n1');
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).revision, 1);

  const restarted = SemanticGraphAuthorityService.withStoragePath(path);
  assert.equal(restarted.getSnapshot().revision, 1);
  assert.equal(restarted.getSnapshot().nodes[0]?.id, 'n1');
});

test('SemanticGraphAuthorityService accepts canvas node.remove and persists deletion', () => {
  const { path, service } = createService();

  assert.equal(
    service.dispatch({
      actor: { id: 'canvas', role: 'operator' },
      command: { type: 'node.add', node: numberNode },
    }).ok,
    true
  );

  const removed = service.dispatch({
    actor: { id: 'canvas', role: 'operator' },
    command: { type: 'node.remove', nodeId: 'n1' },
  });

  assert.equal(removed.ok, true);
  assert.equal(service.getSnapshot().nodes.length, 0);
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).graph.nodes.length, 0);
});

test('SemanticGraphAuthorityService rejects invalid commands without modifying persisted state', () => {
  const { path, service } = createService();

  const invalid = service.dispatch({
    actor: { id: 'cli', role: 'operator' },
    command: {
      type: 'node.add',
      node: { ...numberNode, type: 'missing-node-type' },
    },
  });

  assert.equal(invalid.ok, false);
  assert.equal(service.getSnapshot().nodes.length, 0);
  assert.throws(() => readFileSync(path, 'utf8'));
});

test('SemanticGraphAuthorityService returns snapshot commands without mutating revision or history', () => {
  const { service } = createService();

  const snapshot = service.dispatch({
    actor: { id: 'cli', role: 'operator' },
    command: { type: 'graph.snapshot' },
  });

  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.appliedRevision, 0);
  assert.equal(snapshot.snapshot.revision, 0);
  assert.equal(service.getHistory().length, 0);
});

test('SemanticGraphAuthorityService exposes Arduino UNO plugin node definitions to AI snapshots', () => {
  const { service } = createService();
  const snapshot = service.getSnapshot();
  const arduinoTypes = snapshot.definitions
    .filter((definition) => definition.type.startsWith('plugin:arduino-uno:'))
    .map((definition) => definition.type)
    .sort();

  assert.deepEqual(arduinoTypes, ['plugin:arduino-uno:digital', 'plugin:arduino-uno:pwm']);
  const pwm = snapshot.definitions.find((definition) => definition.type === 'plugin:arduino-uno:pwm');
  assert.equal(pwm?.aiSummary?.platforms.includes('manager'), true);
  assert.equal(pwm?.aiSummary?.permissions.includes('hardware:serial'), true);
});

test('SemanticGraphAuthorityService persists custom node definitions and AI capability settings', () => {
  const { path, service } = createService();
  const customDefinition = {
    definitionId: 'triplet-pulse',
    name: 'Triplet Pulse',
    template: {
      nodes: [
        {
          id: 'inner-number',
          type: 'number',
          position: { x: 0, y: 0 },
          config: { value: 3 },
          inputValues: {},
          outputValues: {},
        },
      ],
      connections: [],
    },
    ports: [
      {
        portKey: 'value',
        side: 'output',
        label: 'Value',
        type: 'number',
        pinned: true,
        y: 0,
        binding: { nodeId: 'inner-number', portId: 'value' },
      },
    ],
  };

  const upserted = service.dispatch({
    actor: { id: 'canvas', role: 'operator' },
    command: {
      type: 'definition.custom.upsert',
      definition: customDefinition,
    } as never,
  });
  assert.equal(upserted.ok, true);

  const capabilityUpdated = service.dispatch({
    actor: { id: 'canvas', role: 'operator' },
    command: {
      type: 'agent.capability.set',
      nodeType: 'custom:triplet-pulse',
      enabled: false,
      source: 'custom',
      aiNotes: 'Keep this disabled until the show operator approves it.',
    } as never,
  });
  assert.equal(capabilityUpdated.ok, true);

  const snapshot = service.getSnapshot() as never as {
    customDefinitions?: unknown[];
    agentCapabilities?: { nodes?: Array<{ nodeType: string; enabled: boolean; aiNotes?: string }> };
    definitions?: Array<{
      type: string;
      ports: { outputs: Array<{ id: string; type: string; defaultValue?: unknown }> };
      aiSummary?: { description?: string };
    }>;
  };
  assert.equal(snapshot.customDefinitions?.[0]?.['definitionId' as never], 'triplet-pulse');
  assert.deepEqual(
    snapshot.definitions?.find((definition) => definition.type === 'custom:triplet-pulse')?.ports.outputs,
    [{ id: 'value', label: 'Value', type: 'number', defaultValue: 0 }]
  );
  assert.match(
    snapshot.definitions?.find((definition) => definition.type === 'custom:triplet-pulse')?.aiSummary
      ?.description ?? '',
    /wraps 1 internal nodes/
  );
  assert.deepEqual(snapshot.agentCapabilities?.nodes, [
    {
      nodeType: 'custom:triplet-pulse',
      enabled: false,
      source: 'custom',
      aiNotes: 'Keep this disabled until the show operator approves it.',
    },
  ]);

  const persisted = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(persisted.customDefinitions[0].definitionId, 'triplet-pulse');
  assert.equal(persisted.agentCapabilities.nodes[0].enabled, false);

  const restarted = SemanticGraphAuthorityService.withStoragePath(path);
  const restartedSnapshot = restarted.getSnapshot() as never as typeof snapshot;
  assert.equal(restartedSnapshot.customDefinitions?.[0]?.['definitionId' as never], 'triplet-pulse');
  assert.equal(
    restartedSnapshot.definitions?.some((definition) => definition.type === 'custom:triplet-pulse'),
    true
  );
  assert.equal(restartedSnapshot.agentCapabilities?.nodes?.[0]?.nodeType, 'custom:triplet-pulse');
});

test('SemanticGraphAuthorityService defaults persistence to apps/server/data/semantic-graph.json', () => {
  assert.equal(
    normalize(SemanticGraphAuthorityService.defaultStoragePath).endsWith(
      normalize('apps/server/data/semantic-graph.json')
    ),
    true
  );
});

test('SemanticModule can instantiate SemanticGraphAuthorityService through Nest DI', async () => {
  const moduleRef = await NestFactory.createApplicationContext(SemanticModule, { logger: false });

  const service = moduleRef.get(SemanticGraphAuthorityService);
  assert.ok(service.getSnapshot());
  await moduleRef.close();
});
