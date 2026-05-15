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
