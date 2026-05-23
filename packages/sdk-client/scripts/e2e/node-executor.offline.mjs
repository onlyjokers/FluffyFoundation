import process from 'node:process';

import { NodeExecutor } from '../../dist-out/node-executor.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(condition, message) {
  if (condition) return;
  throw new Error(message);
}

const CLIENT_ID = 'c_e2e_offline';
const LOOP_ID = 'loop_e2e_offline';

function loopGraph({ primary }) {
  const ids = {
    loader: 'node-client-loader-offline',
    executor: 'node-client-executor-offline',
    lfo: 'node-lfo-offline',
    screen: 'node-screen-offline',
  };

  return {
    nodes: [
      {
        id: ids.loader,
        type: 'client-loader',
        position: { x: 60, y: 140 },
        config: { clientId: CLIENT_ID },
        inputValues: {},
        outputValues: {},
      },
      {
        id: ids.executor,
        type: 'client-executor',
        position: { x: 900, y: 140 },
        config: {},
        inputValues: {},
        outputValues: {},
      },
      {
        id: ids.lfo,
        type: 'tone-lfo',
        position: { x: 340, y: 140 },
        config: { frequencyHz: 0.8, min: 0.5, max: 3, amplitude: 1, waveform: 'sine', enabled: true },
        inputValues: {},
        outputValues: {},
      },
      {
        id: ids.screen,
        type: 'proc-screen-color',
        position: { x: 640, y: 120 },
        config: {
          primary,
          secondary: '#ffffff',
          maxOpacity: 1,
          minOpacity: 0,
          waveform: 'sine',
          frequencyHz: 1.5,
        },
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [
      {
        id: 'conn-offline-lfo-to-screen',
        sourceNodeId: ids.lfo,
        sourcePortId: 'value',
        targetNodeId: ids.screen,
        targetPortId: 'frequencyHz',
      },
      {
        id: 'conn-offline-screen-to-client',
        sourceNodeId: ids.screen,
        sourcePortId: 'cmd',
        targetNodeId: ids.executor,
        targetPortId: 'in',
      },
      {
        id: 'conn-offline-loader-to-executor',
        sourceNodeId: ids.loader,
        sourcePortId: 'client',
        targetNodeId: ids.executor,
        targetPortId: 'client',
      },
    ],
  };
}

async function main() {
  const commands = [];
  const reports = [];

  const sdk = {
    getState: () => ({ clientId: CLIENT_ID }),
    getLatestSensorData: () => null,
    sendSensorData: (sensorType, payload, options) => {
      reports.push({ sensorType, payload, options });
    },
  };

  const executor = new NodeExecutor(
    sdk,
    (cmd) => {
      commands.push(cmd);
      globalThis.__SHUGU_E2E_LAST_COMMAND = cmd;
    },
    {
      limits: {
        maxNodes: 80,
        minTickIntervalMs: 5,
        maxTickIntervalMs: 250,
        maxTickDurationMs: 200,
      },
    }
  );

  try {
    executor.handlePluginControl({
      pluginId: 'node-executor',
      command: 'deploy',
      payload: {
        graph: loopGraph({ primary: '#6366f1' }),
        meta: { loopId: LOOP_ID, tickIntervalMs: 10 },
      },
    });

    await sleep(80);
    assert(commands.length > 0, 'expected at least one executed command after deploy');
    const last1 = globalThis.__SHUGU_E2E_LAST_COMMAND;
    assert(last1?.action === 'screenColor', `expected screenColor action, got ${String(last1?.action)}`);

    executor.handlePluginControl({ pluginId: 'node-executor', command: 'stop', payload: { loopId: LOOP_ID } });
    await sleep(60);
    const stoppedCount = commands.length;
    await sleep(120);
    assert(commands.length === stoppedCount, 'expected no new commands after stop');

    executor.handlePluginControl({
      pluginId: 'node-executor',
      command: 'deploy',
      payload: {
        graph: loopGraph({ primary: '#ff0000' }),
        meta: { loopId: LOOP_ID, tickIntervalMs: 10 },
      },
    });

    await sleep(80);
    const last2 = globalThis.__SHUGU_E2E_LAST_COMMAND;
    assert(last2?.action === 'screenColor', `expected screenColor action, got ${String(last2?.action)}`);
    assert(last2?.payload?.color === '#ff0000', `expected updated primary color, got ${String(last2?.payload?.color)}`);

    executor.handlePluginControl({ pluginId: 'node-executor', command: 'remove', payload: { loopId: LOOP_ID } });
    await sleep(10);
    const status = executor.getStatus();
    assert(status.running === false, 'expected removed executor to not be running');
    assert(status.loopId === null, 'expected removed executor loopId to be null');

    console.log('[e2e-offline] ✅ node-executor deploy/stop/redeploy/remove OK', {
      commands: commands.length,
      reports: reports.length,
    });
  } finally {
    try {
      executor.destroy();
    } catch {
      // ignore
    }
  }
}

await main().catch((err) => {
  const message = err instanceof Error ? err.stack || err.message : String(err);
  console.error('[e2e-offline] ❌ failed:', message);
  process.exitCode = 1;
});
