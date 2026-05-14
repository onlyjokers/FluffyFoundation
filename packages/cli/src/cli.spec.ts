// Purpose: Verify the shugu CLI maps graph commands to live semantic ManagerSDK messages.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCliRunner, parseGraphCommand } from './cli.js';
import type { SemanticResultMessage } from '@shugu/protocol';

test('parseGraphCommand creates semantic commands for add-node, connect, set-param, deploy, and snapshot', () => {
  assert.deepEqual(
    parseGraphCommand(['graph', 'snapshot']),
    {
      action: 'semantic',
      requestId: 'graph-snapshot',
      command: { type: 'proposal.create', proposal: { id: 'graph-snapshot', title: 'Graph snapshot', commands: [] } },
    }
  );

  assert.deepEqual(
    parseGraphCommand(['graph', 'add-node', '--type', 'tone-granular', '--id', 'tone-1', '--x', '12', '--y', '24']),
    {
      action: 'semantic',
      requestId: 'add-node:tone-1',
      command: {
        type: 'node.add',
        node: {
          id: 'tone-1',
          type: 'tone-granular',
          position: { x: 12, y: 24 },
          config: {},
          inputValues: {},
          outputValues: {},
        },
      },
    }
  );

  assert.deepEqual(
    parseGraphCommand(['graph', 'connect', '--from', 'n1.out', '--to', 'n2.in']),
    {
      action: 'semantic',
      requestId: 'connect:n1.out->n2.in',
      command: {
        type: 'node.connect',
        connection: {
          id: 'conn:n1.out->n2.in',
          sourceNodeId: 'n1',
          sourcePortId: 'out',
          targetNodeId: 'n2',
          targetPortId: 'in',
        },
      },
    }
  );

  assert.deepEqual(
    parseGraphCommand(['graph', 'set-param', '--node', 'tone-1', '--param', 'volume', '--value', '-36']),
    {
      action: 'semantic',
      requestId: 'set-param:tone-1.volume',
      command: { type: 'node.params.update', nodeId: 'tone-1', params: { volume: -36 } },
    }
  );

  assert.deepEqual(
    parseGraphCommand(['graph', 'deploy', '--partition', 'main']),
    {
      action: 'semantic',
      requestId: 'deploy:main',
      command: {
        type: 'partition.deploy',
        partitionId: 'main',
        nodeIds: [],
        targetPlatform: 'client',
      },
    }
  );
});

test('createCliRunner sends semantic command and prints structured JSON', async () => {
  const sent: unknown[] = [];
  const output: string[] = [];
  const runner = createCliRunner({
    createSdk: () => ({
      connect: () => undefined,
      disconnect: () => undefined,
      sendSemanticCommand: (input: unknown) => sent.push(input),
      onSemanticResult: (handler: (message: SemanticResultMessage) => void) => {
        queueMicrotask(() =>
          handler({
            type: 'semantic-result',
            version: 1,
            serverTimestamp: 1,
            requestId: 'set-param:tone-1.volume',
            ok: true,
            result: { accepted: true },
            warnings: [{ code: 'semantic.param.clamped', path: 'volume', message: 'clamped' }],
            snapshotRevision: 7,
          })
        );
        return () => undefined;
      },
    }),
    writeStdout: (text: string) => output.push(text),
  });

  const exitCode = await runner(['graph', 'set-param', '--node', 'tone-1', '--param', 'volume', '--value', '-36']);

  assert.equal(exitCode, 0);
  assert.deepEqual(sent, [
    {
      command: { type: 'node.params.update', nodeId: 'tone-1', params: { volume: -36 } },
      requestId: 'set-param:tone-1.volume',
      target: { mode: 'manager' },
      dryRun: false,
    },
  ]);
  assert.deepEqual(JSON.parse(output.join('')), {
    ok: true,
    type: 'semantic-result',
    version: 1,
    serverTimestamp: 1,
    requestId: 'set-param:tone-1.volume',
    result: { accepted: true },
    warnings: [{ code: 'semantic.param.clamped', path: 'volume', message: 'clamped' }],
    snapshotRevision: 7,
  });
});

test('createCliRunner supports dry-run without opening a socket', async () => {
  const output: string[] = [];
  const runner = createCliRunner({
    createSdk: () => {
      throw new Error('socket should not be created');
    },
    writeStdout: (text: string) => output.push(text),
  });

  const exitCode = await runner(['graph', 'add-node', '--type', 'number', '--id', 'n1', '--dry-run']);

  assert.equal(exitCode, 0);
  assert.equal(JSON.parse(output.join('')).dryRun, true);
});
