import { spawn } from 'node:child_process';
import net from 'node:net';
import process from 'node:process';
import { chromium } from 'playwright';

const ROOT = process.cwd();

const CLIENT_ID = 'c_e2e';
const MANAGER_USER = 'Eureka';
const E2E_STEP_TIMEOUT_MS = 30_000;

async function launchChromium() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Executable doesn't exist")) throw error;

    // Local dev convenience: allow running e2e without `playwright install` by using system Chrome.
    console.warn('[e2e] playwright chromium missing; falling back to system Chrome channel');
    return await chromium.launch({ headless: true, channel: 'chrome' });
  }
}

function spawnService(label, args, extraEnv = {}) {
  const proc = spawn('pnpm', args, {
    cwd: ROOT,
    env: {
      ...process.env,
      ...extraEnv,
      FORCE_COLOR: '1',
      SHUGU_E2E: '1',
      SHUGU_DEV_HOST: '127.0.0.1',
    },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const prefix = `[e2e:${label}]`;
  proc.stdout?.on('data', (buf) => process.stdout.write(`${prefix} ${buf}`));
  proc.stderr?.on('data', (buf) => process.stderr.write(`${prefix} ${buf}`));

  proc.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`${prefix} exited with code ${code}`);
    }
  });

  return proc;
}

function killProcess(proc, signal) {
  if (!proc || proc.exitCode !== null) return;

  try {
    if (process.platform !== 'win32' && typeof proc.pid === 'number') {
      process.kill(-proc.pid, signal);
      return;
    }
  } catch {
    // fallback below
  }

  try {
    proc.kill(signal);
  } catch {
    // ignore
  }
}

function waitForPort(port, { host = '127.0.0.1', timeoutMs = 60_000 } = {}) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ port, host });
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`timeout waiting for ${host}:${port}`));
          return;
        }
        setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

function waitForExit(proc, { timeoutMs = 10_000 } = {}) {
  return new Promise((resolve) => {
    if (!proc || proc.exitCode !== null) {
      resolve();
      return;
    }

    const timeoutId = setTimeout(() => {
      killProcess(proc, 'SIGKILL');
      resolve();
    }, timeoutMs);

    proc.once('exit', () => {
      clearTimeout(timeoutId);
      resolve();
    });
  });
}

async function canListen(port, host) {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(startPort, reservedPorts, { host = '127.0.0.1', maxAttempts = 50 } = {}) {
  for (let port = startPort; port < startPort + maxAttempts; port += 1) {
    if (reservedPorts.has(port)) continue;
    // eslint-disable-next-line no-await-in-loop
    if (await canListen(port, host)) {
      reservedPorts.add(port);
      return port;
    }
  }
  throw new Error(`unable to find free port from ${startPort} (attempts=${maxAttempts})`);
}

function loopGraph({ clientId, primary }) {
  const ids = {
    loader: 'node-client-loader-e2e',
    executor: 'node-client-executor-e2e',
    sensors: 'node-sensors-e2e',
    screen: 'node-screen-e2e',
  };

  return {
    nodes: [
      {
        id: ids.loader,
        type: 'client-loader',
        position: { x: 60, y: 140 },
        config: { clientId },
        inputValues: {},
        outputValues: {},
      },
      {
        id: ids.executor,
        type: 'client-executor',
        position: { x: 960, y: 140 },
        config: {},
        inputValues: {},
        outputValues: {},
      },
      {
        id: ids.sensors,
        type: 'proc-client-sensors',
        position: { x: 360, y: 140 },
        config: {},
        inputValues: {},
        outputValues: {},
      },
      {
        id: ids.screen,
        type: 'proc-screen-color',
        position: { x: 660, y: 120 },
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
        id: 'conn-e2e-client-to-sensors',
        sourceNodeId: ids.loader,
        sourcePortId: 'client',
        targetNodeId: ids.sensors,
        targetPortId: 'client',
      },
      {
        id: 'conn-e2e-loader-to-executor',
        sourceNodeId: ids.loader,
        sourcePortId: 'client',
        targetNodeId: ids.executor,
        targetPortId: 'client',
      },
      {
        id: 'conn-e2e-sensors-to-screen',
        sourceNodeId: ids.sensors,
        sourcePortId: 'accelX',
        targetNodeId: ids.screen,
        targetPortId: 'frequencyHz',
      },
      {
        id: 'conn-e2e-screen-to-client',
        sourceNodeId: ids.screen,
        sourcePortId: 'cmd',
        targetNodeId: ids.executor,
        targetPortId: 'in',
      },
    ],
  };
}

function nonLoopGraph({ clientId, primary }) {
  const graph = loopGraph({ clientId, primary });
  // Break the cycle: remove the command edge back into the Client sink.
  graph.connections = graph.connections.filter((c) => c.id !== 'conn-e2e-screen-to-client');
  return graph;
}

async function assert(condition, message) {
  if (condition) return;
  throw new Error(message);
}

async function main() {
  const reservedPorts = new Set();
  const serverPort = await findAvailablePort(3001, reservedPorts);
  const managerPort = await findAvailablePort(5173, reservedPorts);
  const clientPort = await findAvailablePort(5174, reservedPorts);

  const SERVER_ORIGIN = `https://localhost:${serverPort}`;
  const MANAGER_ORIGIN = `https://localhost:${managerPort}`;
  const CLIENT_ORIGIN = `https://localhost:${clientPort}`;

  const procs = [
    spawnService('server', ['--filter', '@shugu/server', 'run', 'dev'], { PORT: String(serverPort) }),
    spawnService(
      'manager',
      ['--filter', '@shugu/manager', 'exec', 'vite', 'dev', '--port', String(managerPort), '--strictPort'],
      {}
    ),
    spawnService(
      'client',
      ['--filter', '@shugu/client', 'exec', 'vite', 'dev', '--port', String(clientPort), '--strictPort'],
      {}
    ),
  ];

  const cleanup = async () => {
    for (const p of procs) {
      killProcess(p, 'SIGTERM');
    }

    await Promise.all(procs.map((p) => waitForExit(p, { timeoutMs: 12_000 })));
  };

  process.on('SIGINT', () => cleanup().finally(() => process.exit(130)));
  process.on('SIGTERM', () => cleanup().finally(() => process.exit(143)));

  try {
    await Promise.all([
      waitForPort(serverPort),
      waitForPort(managerPort),
      waitForPort(clientPort),
    ]);

    const browser = await launchChromium();
    const context = await browser.newContext({ ignoreHTTPSErrors: true });

    await context.addCookies([
      {
        name: 'shugu-manager-auth',
        value: MANAGER_USER,
        url: MANAGER_ORIGIN,
        sameSite: 'Lax',
      },
    ]);

    const clientPage = await context.newPage();
    await clientPage.addInitScript(
      ({ serverUrl, clientId }) => {
        localStorage.setItem('shugu-server-url', serverUrl);
        localStorage.setItem('shugu-device-id', clientId);
        sessionStorage.setItem('shugu-client-instance-id', 'i_e2e');
        sessionStorage.setItem('shugu-client-id', clientId);
        window.__SHUGU_E2E = true;
        window.__SHUGU_E2E_COMMANDS = [];
      },
      { serverUrl: SERVER_ORIGIN, clientId: CLIENT_ID }
    );

    await clientPage.goto(`${CLIENT_ORIGIN}/?server=${encodeURIComponent(SERVER_ORIGIN)}&e2e=1`, {
      waitUntil: 'domcontentloaded',
    });

    const managerPage = await context.newPage();
    managerPage.on('dialog', (dialog) => {
      console.log('[e2e] dialog:', dialog.message());
      dialog.accept();
    });

    await managerPage.addInitScript((serverUrl) => {
      localStorage.setItem('shugu-server-url', serverUrl);
    }, SERVER_ORIGIN);

    await managerPage.goto(`${MANAGER_ORIGIN}/`, { waitUntil: 'domcontentloaded' });
    await managerPage.getByRole('button', { name: 'Connect' }).click();

    await managerPage.getByRole('button', { name: /Node Graph/ }).waitFor({ timeout: 60_000 });
    await managerPage.waitForSelector(`text=${CLIENT_ID}`, { timeout: 60_000 });

    // Some server flows require the manager to explicitly select clients before sending controls/plugins.
    await managerPage.getByRole('button', { name: /^All/ }).click();

    await managerPage.getByRole('button', { name: /Node Graph/ }).click();
    await managerPage.waitForFunction(() => Boolean(window.__shuguNodeEngine), null, {
      timeout: E2E_STEP_TIMEOUT_MS,
    });

    const graphV1 = loopGraph({ clientId: CLIENT_ID, primary: '#6366f1' });
    await managerPage.evaluate((graph) => window.__shuguNodeEngine.loadGraph(graph), graphV1);
    await managerPage.waitForSelector('.loop-frame', { timeout: E2E_STEP_TIMEOUT_MS });
    await managerPage.waitForFunction(
      () => document.querySelectorAll('.node.local-loop').length > 0,
      null,
      {
        timeout: E2E_STEP_TIMEOUT_MS,
      }
    );

    // Loop deploy controls are disabled until the NodeEngine is running.
    await managerPage.getByRole('button', { name: 'Start' }).click();

    await managerPage.getByRole('button', { name: /^Deploy$/ }).click();
    await managerPage.waitForSelector('text=Stop Loop', { timeout: E2E_STEP_TIMEOUT_MS });
    await managerPage.waitForFunction(
      () => document.querySelectorAll('.node.deployed-loop').length > 0,
      null,
      {
        timeout: E2E_STEP_TIMEOUT_MS,
      }
    );

    const beforeCount = await clientPage.evaluate(() => (window.__SHUGU_E2E_COMMANDS || []).length);
    await clientPage.waitForFunction(
      (count) => (window.__SHUGU_E2E_COMMANDS || []).length > count,
      beforeCount,
      { timeout: E2E_STEP_TIMEOUT_MS }
    );

    const last = await clientPage.evaluate(() => window.__SHUGU_E2E_LAST_COMMAND);
    await assert(
      last?.action === 'screenColor',
      `expected screenColor action, got ${String(last?.action)}`
    );

    await managerPage.getByRole('button', { name: /Stop Loop/ }).click();

    const stoppedCount = await clientPage.evaluate(
      () => (window.__SHUGU_E2E_COMMANDS || []).length
    );
    await managerPage.waitForTimeout(800);
    const stoppedAfter = await clientPage.evaluate(
      () => (window.__SHUGU_E2E_COMMANDS || []).length
    );
    await assert(stoppedAfter === stoppedCount, 'expected no new commands after Stop Loop');

    // Update graph (same node ids) and redeploy.
    const graphV2 = loopGraph({ clientId: CLIENT_ID, primary: '#ff0000' });
    await managerPage.evaluate((graph) => window.__shuguNodeEngine.loadGraph(graph), graphV2);
    await managerPage.waitForSelector('.loop-frame', { timeout: E2E_STEP_TIMEOUT_MS });

    await managerPage.getByRole('button', { name: /^Deploy$/ }).click();
    await managerPage.waitForSelector('text=Stop Loop', { timeout: E2E_STEP_TIMEOUT_MS });

    const redeployCount = await clientPage.evaluate(
      () => (window.__SHUGU_E2E_COMMANDS || []).length
    );
    await clientPage.waitForFunction(
      (count) => (window.__SHUGU_E2E_COMMANDS || []).length > count,
      redeployCount,
      { timeout: E2E_STEP_TIMEOUT_MS }
    );

    const updated = await clientPage.evaluate(() => window.__SHUGU_E2E_LAST_COMMAND);
    await assert(
      updated?.action === 'screenColor',
      `expected screenColor action, got ${String(updated?.action)}`
    );
    await assert(
      updated?.payload?.color === '#ff0000',
      `expected updated primary color, got ${String(updated?.payload?.color)}`
    );

    // Break the local loop: the manager should auto stop + remove the deployed loop on client.
    const graphV3 = nonLoopGraph({ clientId: CLIENT_ID, primary: '#ff0000' });
    await managerPage.evaluate((graph) => window.__shuguNodeEngine.loadGraph(graph), graphV3);
    await managerPage.waitForFunction(() => document.querySelectorAll('.loop-frame').length === 0, null, {
      timeout: E2E_STEP_TIMEOUT_MS,
    });

    await managerPage.waitForTimeout(400);
    const breakCount = await clientPage.evaluate(() => (window.__SHUGU_E2E_COMMANDS || []).length);
    await managerPage.waitForTimeout(800);
    const breakAfter = await clientPage.evaluate(() => (window.__SHUGU_E2E_COMMANDS || []).length);
    await assert(breakAfter === breakCount, 'expected no new commands after breaking the loop');

    console.log('[e2e] ✅ node-executor loop deploy/stop/redeploy/auto-remove OK');

    await browser.close();
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error('[e2e] ❌ failed:', message);
    throw error;
  } finally {
    await cleanup();
  }
}

await main();
