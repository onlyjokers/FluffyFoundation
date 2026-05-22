// Purpose: Verify the shugu CLI maps graph commands to live semantic ManagerSDK messages.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCliRunner, parseGraphCommand } from './cli.js';
import type { SemanticResultMessage } from '@shugu/protocol';
import type { ManagerSDKConfig, ManagerState } from '@shugu/sdk-manager';

type CliState = Pick<ManagerState, 'status'>;

test('parseGraphCommand creates semantic commands for add-node, connect, set-param, deploy, and snapshot', () => {
  assert.deepEqual(
    parseGraphCommand(['graph', 'snapshot']),
    {
      action: 'semantic',
      requestId: 'graph-snapshot',
      command: { kind: 'graph.snapshot' },
    }
  );

  assert.deepEqual(
    parseGraphCommand(['graph', 'add-node', '--type', 'tone-granular', '--id', 'tone-1', '--x', '12', '--y', '24']),
    {
      action: 'semantic',
      requestId: 'add-node:tone-1',
      command: {
        kind: 'node.add',
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
        kind: 'node.connect',
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
      command: { kind: 'node.params.update', nodeId: 'tone-1', params: { volume: -36 } },
    }
  );

  assert.deepEqual(
    parseGraphCommand(['graph', 'deploy', '--partition', 'main']),
    {
      action: 'semantic',
      requestId: 'deploy:main',
      command: {
        kind: 'partition.deploy',
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
  let stateHandler: ((state: CliState) => void) | null = null;
  const runner = createCliRunner({
    createSdk: () => ({
      connect: () => {
        queueMicrotask(() => stateHandler?.({ status: 'connected' }));
      },
      disconnect: () => undefined,
      getState: () => ({ status: 'connecting' }),
      onStateChange: (handler: (state: CliState) => void) => {
        stateHandler = handler;
        handler({ status: 'connecting' });
        return () => {
          stateHandler = null;
        };
      },
      sendSemanticCommand: (input: unknown) => {
        sent.push(input);
        return true;
      },
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
      command: { kind: 'node.params.update', nodeId: 'tone-1', params: { volume: -36 } },
      requestId: 'set-param:tone-1.volume',
      target: { mode: 'server' },
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

test('createCliRunner waits for SDK connection before sending live semantic commands', async () => {
  const events: string[] = [];
  const output: string[] = [];
  let stateHandler: ((state: CliState) => void) | null = null;
  let resultHandler: ((message: SemanticResultMessage) => void) | null = null;

  const runner = createCliRunner({
    createSdk: () => ({
      connect: () => {
        events.push('connect');
        queueMicrotask(() => {
          events.push('connected');
          stateHandler?.({ status: 'connected' });
        });
      },
      disconnect: () => {
        events.push('disconnect');
      },
      getState: () => ({ status: 'connecting' }),
      onStateChange: (handler: (state: CliState) => void) => {
        stateHandler = handler;
        handler({ status: 'connecting' });
        return () => {
          stateHandler = null;
        };
      },
      sendSemanticCommand: () => {
        events.push('send');
        queueMicrotask(() =>
          resultHandler?.({
            type: 'semantic-result',
            version: 1,
            serverTimestamp: 1,
            requestId: 'add-node:cli-live-number',
            ok: true,
            result: { accepted: true },
            snapshotRevision: 1,
          })
        );
        return true;
      },
      onSemanticResult: (handler: (message: SemanticResultMessage) => void) => {
        resultHandler = handler;
        return () => {
          resultHandler = null;
        };
      },
    }),
    writeStdout: (text: string) => output.push(text),
  });

  const exitCode = await runner(['graph', 'add-node', '--type', 'number', '--id', 'cli-live-number']);

  assert.equal(exitCode, 0);
  assert.deepEqual(events, ['connect', 'connected', 'send', 'disconnect']);
  assert.equal(JSON.parse(output.join('')).ok, true);
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

test('createCliRunner passes SHUGU_CLI_TRANSPORTS to the ManagerSDK factory', async () => {
  const originalTransports = process.env.SHUGU_CLI_TRANSPORTS;
  const originalTls = process.env.SHUGU_TLS_REJECT_UNAUTHORIZED;
  process.env.SHUGU_CLI_TRANSPORTS = 'websocket';
  process.env.SHUGU_TLS_REJECT_UNAUTHORIZED = '0';
  const configs: ManagerSDKConfig[] = [];
  const output: string[] = [];
  try {
    const runner = createCliRunner({
      createSdkFromConfig: (config) => {
        configs.push(config);
        return {
          connect: () => undefined,
          disconnect: () => undefined,
          getState: () => ({ status: 'connected' }),
          onStateChange: () => () => undefined,
          sendSemanticCommand: () => true,
          onSemanticResult: (handler: (message: SemanticResultMessage) => void) => {
            queueMicrotask(() =>
              handler({
                type: 'semantic-result',
                version: 1,
                serverTimestamp: 1,
                requestId: 'add-node:n1',
                ok: true,
                result: { accepted: true },
              })
            );
            return () => undefined;
          },
        };
      },
      writeStdout: (text: string) => output.push(text),
    });

    const exitCode = await runner(['graph', 'add-node', '--type', 'number', '--id', 'n1']);

    assert.equal(exitCode, 0);
    assert.deepEqual(configs[0]?.transports, ['websocket']);
    assert.equal(configs[0]?.rejectUnauthorized, false);
  } finally {
    if (originalTransports === undefined) delete process.env.SHUGU_CLI_TRANSPORTS;
    else process.env.SHUGU_CLI_TRANSPORTS = originalTransports;
    if (originalTls === undefined) delete process.env.SHUGU_TLS_REJECT_UNAUTHORIZED;
    else process.env.SHUGU_TLS_REJECT_UNAUTHORIZED = originalTls;
  }
});
