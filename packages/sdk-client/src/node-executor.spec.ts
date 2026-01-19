import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NodeExecutor } from './node-executor.js';

describe('node-executor', () => {
  const waitFor = async (fn: () => boolean, timeoutMs = 200, stepMs = 5): Promise<void> => {
    const start = Date.now();
    while (!fn()) {
      if (Date.now() - start > timeoutMs) throw new Error('timeout');
      await new Promise((r) => setTimeout(r, stepMs));
    }
  };

  it('routes client-object sink commands via remote backend when available and scopeGroupId is set', async (t) => {
    const sent: Array<{ targetClientId: string; action: string; scopeGroupId: string }> = [];

    const sdk = {
      getState: () => ({ clientId: 'self' }),
      getLatestSensorData: () => null,
      sendSensorData: () => undefined,
    };

    const executor = new NodeExecutor(sdk as never, () => undefined, {
      remote: {
        sendControl: (targetClientId, cmd, meta) => {
          sent.push({
            targetClientId,
            action: cmd.action,
            scopeGroupId: meta.scopeGroupId,
          });
        },
      },
    });
    t.after(() => executor.destroy());

    executor.handlePluginControl({
      type: 'plugin',
      version: 2,
      serverTimestamp: 0,
      clientTimestamp: 0,
      actorId: 'manager',
      actorRole: 'manager',
      scopeGroupId: '__system__',
      from: 'manager',
      target: { mode: 'clientIds', ids: ['self'] },
      pluginId: 'node-executor',
      command: 'deploy',
      payload: {
        graph: {
          nodes: [
            {
              id: 'processor',
              type: 'proc-screen-color',
              position: { x: 0, y: 0 },
              config: {},
              inputValues: {
                active: true,
                primary: '#fff',
                secondary: '#000',
                waveform: 'sine',
                frequencyHz: 1,
                maxOpacity: 1,
                minOpacity: 1,
              },
              outputValues: {},
            },
            {
              id: 'clientNode',
              type: 'client-object',
              position: { x: 0, y: 0 },
              config: { clientId: 'self' },
              inputValues: {
                loadIndexs: null,
                index: 1,
                range: 1,
                random: false,
              },
              outputValues: {},
            },
          ],
          connections: [
            {
              id: 'c1',
              sourceNodeId: 'processor',
              sourcePortId: 'cmd',
              targetNodeId: 'clientNode',
              targetPortId: 'in',
            },
          ],
        },
        meta: {
          loopId: 'loop:test',
          scopeGroupId: 'g1',
          requiredCapabilities: [],
          tickIntervalMs: 33,
          protocolVersion: 2,
          executorVersion: 'node-executor-v1',
        },
      },
    } as never);

    await waitFor(() => sent.length === 1);
    assert.equal(sent[0]?.targetClientId, 'self');
    assert.equal(sent[0]?.action, 'screenColor');
    assert.equal(sent[0]?.scopeGroupId, 'g1');
  });

  it('falls back to local executeCommand when remote backend is available but scopeGroupId is missing', async (t) => {
    const executed: string[] = [];

    const sdk = {
      getState: () => ({ clientId: 'self' }),
      getLatestSensorData: () => null,
      sendSensorData: () => undefined,
    };

    const executor = new NodeExecutor(
      sdk as never,
      (cmd) => {
        executed.push(cmd.action);
      },
      {
        remote: {
          sendControl: () => {
            throw new Error('should not send remotely without scopeGroupId');
          },
        },
      }
    );
    t.after(() => executor.destroy());

    executor.handlePluginControl({
      type: 'plugin',
      version: 2,
      serverTimestamp: 0,
      clientTimestamp: 0,
      actorId: 'manager',
      actorRole: 'manager',
      scopeGroupId: '__system__',
      from: 'manager',
      target: { mode: 'clientIds', ids: ['self'] },
      pluginId: 'node-executor',
      command: 'deploy',
      payload: {
        graph: {
          nodes: [
            {
              id: 'processor',
              type: 'proc-flashlight',
              position: { x: 0, y: 0 },
              config: {},
              inputValues: { mode: 'off', frequencyHz: 2, dutyCycle: 0.5 },
              outputValues: {},
            },
            {
              id: 'clientNode',
              type: 'client-object',
              position: { x: 0, y: 0 },
              config: { clientId: 'self' },
              inputValues: {
                loadIndexs: null,
                index: 1,
                range: 1,
                random: false,
              },
              outputValues: {},
            },
          ],
          connections: [
            {
              id: 'c1',
              sourceNodeId: 'processor',
              sourcePortId: 'cmd',
              targetNodeId: 'clientNode',
              targetPortId: 'in',
            },
          ],
        },
        meta: {
          loopId: 'loop:test',
          requiredCapabilities: [],
          tickIntervalMs: 33,
          protocolVersion: 2,
          executorVersion: 'node-executor-v1',
        },
      },
    } as never);

    await waitFor(() => executed.length === 1);
    assert.deepEqual(executed, ['flashlight']);
  });
});
