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
          {
            id: 'ui-out-1',
            type: 'ui-out',
            position: { x: 120, y: 0 },
            config: {},
            inputValues: {},
            outputValues: {},
          },
        ],
        connections: [
          { id: 'c1', sourceNodeId: 'button-1', sourcePortId: 'out', targetNodeId: 'ui-out-1', targetPortId: 'in' },
        ],
      },
      meta: { loopId: 'loop-client-ui', tickIntervalMs: 33 },
    }),
  });
}

describe('NodeExecutor ClientUI wiring', () => {
  function createOptions(
    cleared: string[],
    maxTickDurationMs = 200
  ): NodeExecutorOptions {
    return {
      clientUi: {
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

  it('registers ClientUI deps and clears rendered UI on stop and remove', () => {
    const cleared: string[] = [];
    const options = createOptions(cleared);
    const executor = new NodeExecutor(createSdk() as never, () => {}, options);

    try {
      deployGraph(executor);
      executor.handlePluginControl(pluginMessage('stop', { loopId: 'loop-client-ui' }));

      assert.equal(cleared.includes('*'), true);

      cleared.length = 0;
      deployGraph(executor);
      executor.handlePluginControl(pluginMessage('remove', { loopId: 'loop-client-ui' }));

      assert.equal(cleared.includes('*'), true);
    } finally {
      executor.destroy();
    }
  });

  it('keeps rendered UI running when the runtime watchdog warns', async () => {
    const cleared: string[] = [];
    const executor = new NodeExecutor(createSdk() as never, () => {}, createOptions(cleared, 0));

    try {
      deployGraph(executor);
      await waitFor(() => executor.getStatus().lastError !== null);

      assert.equal(executor.getStatus().running, true);
      assert.equal(cleared.includes('*'), false);
    } finally {
      executor.destroy();
    }
  });

  it('keeps the previous graph running when redeploy payload is invalid', async () => {
    const cleared: string[] = [];
    const executor = new NodeExecutor(createSdk() as never, () => {}, createOptions(cleared));

    try {
      deployGraph(executor);
      assert.equal(executor.getStatus().running, true);

      executor.handlePluginControl(
        pluginMessage('deploy', {
          graph: {
            nodes: [
              {
                id: 'bad-node',
                type: 'missing-node-type',
                position: { x: 0, y: 0 },
                config: {},
                inputValues: {},
                outputValues: {},
              },
            ],
            connections: [],
          },
          meta: { loopId: 'loop-client-ui', tickIntervalMs: 33 },
        })
      );

      assert.equal(executor.getStatus().running, true);
      assert.match(String(executor.getStatus().lastError), /unknown node type/i);
      assert.equal(cleared.includes('*'), false);
    } finally {
      executor.destroy();
    }
  });

  it('keeps graph-change validation failures from touching audio runtime state', async () => {
    const cleared: string[] = [];
    const syncCalls: unknown[] = [];
    const executor = new NodeExecutor(createSdk() as never, () => {}, createOptions(cleared));

    try {
      deployGraph(executor);
      (executor as unknown as {
        toneAdapter: {
          syncActiveNodes: (activeNodeIds: Set<string>) => void;
          disposeAll: () => void;
          disposeNode: () => void;
        };
      }).toneAdapter = {
        syncActiveNodes: (activeNodeIds) => syncCalls.push(Array.from(activeNodeIds)),
        disposeAll: () => undefined,
        disposeNode: () => undefined,
      };

      executor.handlePluginControl(
        pluginMessage('graph-changes', {
          changes: [{ type: 'add-node', node: { id: 'bad-node', type: 'missing-node-type' } }],
        })
      );

      assert.equal(executor.getStatus().running, true);
      assert.match(String(executor.getStatus().lastError), /unknown node type/i);
      assert.deepEqual(syncCalls, []);
    } finally {
      executor.destroy();
    }
  });

  it('clears ClientUI nodes removed by graph changes', async () => {
    const cleared: string[] = [];
    const executor = new NodeExecutor(createSdk() as never, () => {}, createOptions(cleared));

    try {
      deployGraph(executor);
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
