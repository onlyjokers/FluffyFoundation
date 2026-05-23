// Purpose: Tests for NodeExecutor ClientUI dependency wiring.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NodeExecutor, type NodeExecutorOptions } from './node-executor';
import type { PluginControlMessage } from '@shugu/protocol';

function createSdk() {
  return {
    getState: () => ({ clientId: 'client-a' }),
    getLatestSensorData: () => null,
    sendSensorData: () => {},
  };
}

const pluginMessage = (
  command: PluginControlMessage['command'],
  payload: unknown
): PluginControlMessage =>
  ({
    type: 'plugin',
    version: 1,
    from: 'manager',
    target: { mode: 'group', groupId: 'client:client-a' },
    pluginId: 'node-executor',
    command,
    payload,
    serverTimestamp: Date.now(),
  }) as PluginControlMessage;

const waitFor = async (predicate: () => boolean, timeoutMs = 500): Promise<void> => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

function deployGraph(executor: NodeExecutor): void {
  executor.handlePluginControl({
    ...pluginMessage('deploy', {
      graph: {
        nodes: [
          {
            id: 'button-1',
            type: 'client-button',
            position: { x: 0, y: 0 },
            config: {},
            inputValues: { display: true },
            outputValues: {},
          },
        ],
        connections: [],
      },
      meta: { loopId: 'loop-client-ui', tickIntervalMs: 33 },
    }),
  });
}

describe('NodeExecutor ClientUI wiring', () => {
  function createOptions(
    displays: Array<{ nodeId: string; visible: boolean; kind: string }>,
    cleared: string[],
    maxTickDurationMs = 200
  ): NodeExecutorOptions {
    return {
      clientUi: {
        setClientUiDisplay: (nodeId: string, visible: boolean, kind: 'button' | 'input') =>
          displays.push({ nodeId, visible, kind }),
        getClientUiState: () => ({ displayed: true, pressed: false, inputContent: '', firstInputed: false }),
        consumeClientButtonPressed: () => false,
        clearClientUiNode: (nodeId: string) => cleared.push(nodeId),
        clearClientUi: () => cleared.push('*'),
      },
      limits: {
        maxNodes: 10,
        minTickIntervalMs: 33,
        maxTickIntervalMs: 33,
        maxTickDurationMs,
      },
    };
  }

  it('registers ClientUI deps and clears rendered UI on stop and remove', async () => {
    const displays: Array<{ nodeId: string; visible: boolean; kind: string }> = [];
    const cleared: string[] = [];
    const options = createOptions(displays, cleared);
    const executor = new NodeExecutor(createSdk() as never, () => {}, options);

    try {
      deployGraph(executor);
      await waitFor(() =>
        displays.some((entry) => entry.nodeId === 'button-1' && entry.kind === 'button')
      );
      executor.handlePluginControl(pluginMessage('stop', { loopId: 'loop-client-ui' }));

      assert.equal(cleared.includes('*'), true);

      cleared.length = 0;
      deployGraph(executor);
      await waitFor(() => cleared.length === 0 && displays.length >= 2);
      executor.handlePluginControl(pluginMessage('remove', { loopId: 'loop-client-ui' }));

      assert.equal(displays.some((entry) => entry.nodeId === 'button-1' && entry.kind === 'button'), true);
      assert.equal(cleared.includes('*'), true);
    } finally {
      executor.destroy();
    }
  });

  it('clears rendered UI when the runtime watchdog stops execution', async () => {
    const displays: Array<{ nodeId: string; visible: boolean; kind: string }> = [];
    const cleared: string[] = [];
    const executor = new NodeExecutor(createSdk() as never, () => {}, createOptions(displays, cleared, 0));

    try {
      deployGraph(executor);
      await waitFor(() => cleared.includes('*'));

      assert.equal(executor.getStatus().running, false);
      assert.equal(cleared.includes('*'), true);
    } finally {
      executor.destroy();
    }
  });

  it('clears ClientUI nodes removed by graph changes', async () => {
    const displays: Array<{ nodeId: string; visible: boolean; kind: string }> = [];
    const cleared: string[] = [];
    const executor = new NodeExecutor(createSdk() as never, () => {}, createOptions(displays, cleared));

    try {
      deployGraph(executor);
      await waitFor(() =>
        displays.some((entry) => entry.nodeId === 'button-1' && entry.kind === 'button')
      );
      executor.handlePluginControl(
        pluginMessage('graph-changes', {
          changes: [{ type: 'remove-node', nodeId: 'button-1' }],
        })
      );

      assert.equal(cleared.includes('button-1'), true);
      assert.equal(cleared.includes('*'), false);
    } finally {
      executor.destroy();
    }
  });
});
