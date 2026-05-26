// Purpose: Tests for NodeExecutor ClientUI dependency wiring.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NodeExecutor, type NodeExecutorOptions } from './node-executor';
import type { PluginControlMessage } from '@shugu/protocol';

function createSdk() {
  const booleanUpdates: Array<{ updates: Record<string, boolean>; clientIds?: string[] }> = [];
  return {
    getState: () => ({ clientId: 'client-a' }),
    getLatestSensorData: () => null,
    sendSensorData: () => {},
    sendBooleanVariableUpdates: (updates: Record<string, boolean>, clientIds?: string[]) => {
      booleanUpdates.push({ updates, clientIds });
    },
    booleanUpdates,
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
          {
            id: 'c1',
            sourceNodeId: 'button-1',
            sourcePortId: 'out',
            targetNodeId: 'ui-out-1',
            targetPortId: 'in',
          },
        ],
      },
      meta: { loopId: 'loop-client-ui', tickIntervalMs: 33 },
    }),
  });
}

describe('NodeExecutor ClientUI wiring', () => {
  function createOptions(cleared: string[], maxTickDurationMs = 200): NodeExecutorOptions {
    return {
      clientUi: {
        getClientUiState: () => ({
          displayed: true,
          pressed: false,
          inputContent: '',
          firstInputed: false,
        }),
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
      (
        executor as unknown as {
          toneAdapter: {
            syncActiveNodes: (activeNodeIds: Set<string>) => void;
            disposeAll: () => void;
            disposeNode: () => void;
          };
        }
      ).toneAdapter = {
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

  it('renders ClientUI when display is driven by a named boolean variable with connected name', async () => {
    const cleared: string[] = [];
    const commands: unknown[] = [];
    const executor = new NodeExecutor(
      createSdk() as never,
      (cmd) => commands.push(cmd),
      createOptions(cleared)
    );

    try {
      executor.handlePluginControl({
        ...pluginMessage('deploy', {
          graph: {
            nodes: [
              {
                id: 'name-source',
                type: 'string',
                position: { x: 0, y: 0 },
                config: { value: 'visible' },
                inputValues: {},
                outputValues: {},
              },
              {
                id: 'set-visible',
                type: 'set-boolean-variable',
                position: { x: 120, y: 0 },
                config: { name: 'visible', defaultValue: true, mode: 'latchTrue' },
                inputValues: {},
                outputValues: {},
              },
              {
                id: 'get-visible',
                type: 'get-boolean-variable',
                position: { x: 240, y: 0 },
                config: { name: 'visible' },
                inputValues: {},
                outputValues: {},
              },
              {
                id: 'button-1',
                type: 'client-button',
                position: { x: 360, y: 0 },
                config: {},
                inputValues: {},
                outputValues: {},
              },
              {
                id: 'ui-out-1',
                type: 'ui-out',
                position: { x: 480, y: 0 },
                config: {},
                inputValues: {},
                outputValues: {},
              },
            ],
            connections: [
              {
                id: 'set-name',
                sourceNodeId: 'name-source',
                sourcePortId: 'value',
                targetNodeId: 'set-visible',
                targetPortId: 'name',
              },
              {
                id: 'get-name',
                sourceNodeId: 'name-source',
                sourcePortId: 'value',
                targetNodeId: 'get-visible',
                targetPortId: 'name',
              },
              {
                id: 'display',
                sourceNodeId: 'get-visible',
                sourcePortId: 'value',
                targetNodeId: 'button-1',
                targetPortId: 'display',
              },
              {
                id: 'ui',
                sourceNodeId: 'button-1',
                sourcePortId: 'out',
                targetNodeId: 'ui-out-1',
                targetPortId: 'in',
              },
            ],
          },
          meta: { loopId: 'loop-client-ui-variable', tickIntervalMs: 33 },
        }),
      });

      await waitFor(() =>
        commands.some((cmd) => {
          const payload = (cmd as { payload?: { items?: Array<{ nodeId?: string }> } }).payload;
          return payload?.items?.some((item) => item.nodeId === 'button-1');
        })
      );
    } finally {
      executor.destroy();
    }
  });

  it('consumes Client Button pressed pulses in a deployed variable feedback patch', async () => {
    const cleared: string[] = [];
    const commands: unknown[] = [];
    let buttonPressed = false;
    const executor = new NodeExecutor(createSdk() as never, (cmd) => commands.push(cmd), {
      ...createOptions(cleared),
      clientUi: {
        getClientUiState: () => ({
          displayed: true,
          kind: 'button',
          pressed: buttonPressed,
          inputContent: '',
          firstInputed: false,
        }),
        consumeClientButtonPressed: (nodeId) => {
          assert.equal(nodeId, 'button-1');
          const current = buttonPressed;
          buttonPressed = false;
          return current;
        },
        clearClientUiNode: (nodeId: string) => cleared.push(nodeId),
        clearClientUi: () => cleared.push('*'),
      },
    });

    try {
      executor.handlePluginControl({
        ...pluginMessage('deploy', {
          graph: {
            nodes: [
              {
                id: 'name-source',
                type: 'string',
                position: { x: 0, y: 0 },
                config: { value: '' },
                inputValues: { value: 'visible' },
                outputValues: {},
              },
              {
                id: 'set-visible',
                type: 'set-boolean-variable',
                position: { x: 120, y: 0 },
                config: { name: 'variable', defaultValue: false, mode: 'latchTrue' },
                inputValues: { set: false },
                outputValues: {},
              },
              {
                id: 'get-visible',
                type: 'get-boolean-variable',
                position: { x: 240, y: 0 },
                config: { name: 'variable_1' },
                inputValues: {},
                outputValues: {},
              },
              {
                id: 'button-1',
                type: 'client-button',
                position: { x: 360, y: 0 },
                config: {},
                inputValues: { display: true },
                outputValues: {},
              },
              {
                id: 'pressed-as-bool',
                type: 'pulse-to-boolean',
                position: { x: 480, y: 0 },
                config: { mode: 'momentary', defaultValue: false },
                inputValues: {},
                outputValues: {},
              },
              {
                id: 'ui-out-1',
                type: 'ui-out',
                position: { x: 600, y: 0 },
                config: {},
                inputValues: {},
                outputValues: {},
              },
            ],
            connections: [
              {
                id: 'set-name',
                sourceNodeId: 'name-source',
                sourcePortId: 'value',
                targetNodeId: 'set-visible',
                targetPortId: 'name',
              },
              {
                id: 'get-name',
                sourceNodeId: 'name-source',
                sourcePortId: 'value',
                targetNodeId: 'get-visible',
                targetPortId: 'name',
              },
              {
                id: 'pressed-pulse',
                sourceNodeId: 'button-1',
                sourcePortId: 'pressed',
                targetNodeId: 'pressed-as-bool',
                targetPortId: 'pulse',
              },
              {
                id: 'pulse-set',
                sourceNodeId: 'pressed-as-bool',
                sourcePortId: 'value',
                targetNodeId: 'set-visible',
                targetPortId: 'set',
              },
              {
                id: 'ui',
                sourceNodeId: 'button-1',
                sourcePortId: 'out',
                targetNodeId: 'ui-out-1',
                targetPortId: 'in',
              },
            ],
          },
          meta: { loopId: 'loop-client-ui-pressed', tickIntervalMs: 33 },
        }),
      });

      await waitFor(() =>
        commands.some((cmd) => {
          const payload = (cmd as { payload?: { items?: Array<{ nodeId?: string }> } }).payload;
          return payload?.items?.some((item) => item.nodeId === 'button-1');
        })
      );

      buttonPressed = true;
      await waitFor(() => {
        const runtime = (
          executor as unknown as {
            runtime: {
              getNode: (id: string) => { outputValues?: Record<string, unknown> } | undefined;
            };
          }
        ).runtime;
        return runtime.getNode('pressed-as-bool')?.outputValues?.value === true;
      });
      await waitFor(() => {
        const runtime = (
          executor as unknown as {
            runtime: {
              getNode: (id: string) => { outputValues?: Record<string, unknown> } | undefined;
            };
          }
        ).runtime;
        return runtime.getNode('get-visible')?.outputValues?.value === true;
      });
    } finally {
      executor.destroy();
    }
  });

  it('reports boolean variable writes through the client sdk', async () => {
    const sdk = createSdk();
    const executor = new NodeExecutor(sdk as never, () => {}, createOptions([]));

    try {
      executor.handlePluginControl(
        pluginMessage('deploy', {
          graph: {
            nodes: [
              {
                id: 'source',
                type: 'bool',
                position: { x: 0, y: 0 },
                config: {},
                inputValues: { value: true },
                outputValues: {},
              },
              {
                id: 'setter',
                type: 'set-boolean-variable',
                position: { x: 100, y: 0 },
                config: { name: 'visible', defaultValue: false, mode: 'followInput' },
                inputValues: {},
                outputValues: {},
              },
            ],
            connections: [
              {
                id: 'source-set',
                sourceNodeId: 'source',
                sourcePortId: 'value',
                targetNodeId: 'setter',
                targetPortId: 'set',
              },
            ],
          },
          meta: { loopId: 'loop-boolean-variable', tickIntervalMs: 33 },
        })
      );

      await waitFor(() => sdk.booleanUpdates.some((entry) => entry.updates.visible === true));
    } finally {
      executor.destroy();
    }
  });

  it('reports boolean variable writes with deployed target client ids', async () => {
    const sdk = createSdk();
    const executor = new NodeExecutor(sdk as never, () => {}, createOptions([]));

    try {
      executor.handlePluginControl({
        ...pluginMessage('deploy', {
          graph: {
            nodes: [
              {
                id: 'source',
                type: 'bool',
                position: { x: 0, y: 0 },
                config: {},
                inputValues: { value: true },
                outputValues: {},
              },
              {
                id: 'set',
                type: 'set-boolean-variable',
                position: { x: 100, y: 0 },
                config: { name: 'visible', defaultValue: false, mode: 'latchTrue' },
                inputValues: {},
                outputValues: {},
              },
            ],
            connections: [
              {
                id: 'source-set',
                sourceNodeId: 'source',
                sourcePortId: 'value',
                targetNodeId: 'set',
                targetPortId: 'set',
              },
            ],
          },
          meta: {
            loopId: 'loop-boolean-targeted',
            tickIntervalMs: 33,
            targetClientIds: ['client-a', 'client-b'],
          },
        }),
      });

      await waitFor(() =>
        sdk.booleanUpdates.some(
          (entry) =>
            entry.updates.visible === true &&
            Array.isArray(entry.clientIds) &&
            entry.clientIds.join(',') === 'client-a,client-b'
        )
      );
    } finally {
      executor.destroy();
    }
  });
});
