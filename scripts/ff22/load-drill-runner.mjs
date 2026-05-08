// Purpose: Run FF-22 product-runtime load budgets and show-mode resilience drills against a real Socket.IO server.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { io } from 'socket.io-client';

const ROOT = process.cwd();
const EVIDENCE_DIR = path.join(ROOT, '.harness/evidence/FF-22');
const EVIDENCE_PATH = path.join(EVIDENCE_DIR, 'load-drill-report.json');
const HOST = '127.0.0.1';
const GROUP_STAGE = 'stage-ff22';
const GROUP_DISPLAY = 'display';
const CLIENT_COUNT = 12;
const DISPLAY_COUNT = 2;
const TIMEOUT_MS = 15_000;

const BUDGETS = {
  serverStartupMs: 12_000,
  connectAllMs: 8_000,
  clientListPropagationMs: 2_000,
  controlDeliveryMs: 1_500,
  networkRecoveryMs: 4_000,
  displayRefreshRecoveryMs: 4_000,
  clientReconnectRecoveryMs: 4_000,
  rootStopAllDeliveryMs: 1_500,
  harnessRssMb: 512,
};

export async function runFf22LoadDrill() {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const port = await findAvailablePort(3401);
  const server = spawnServer(port);
  const startedAt = Date.now();
  const sockets = [];

  try {
    await waitForPort(port, { timeoutMs: BUDGETS.serverStartupMs });
    const serverStartupMs = Date.now() - startedAt;
    const serverUrl = `https://${HOST}:${port}`;
    const manager = await connectSocket(serverUrl, {
      role: 'manager',
      label: 'manager',
      auth: {},
    });
    const clientListTracker = createClientListTracker(manager.socket);
    sockets.push(manager.socket);

    const connectStartedAt = Date.now();
    const stageClients = [];
    const displayClients = [];
    for (let index = 0; index < CLIENT_COUNT; index += 1) {
      stageClients.push(
        connectSocket(serverUrl, {
          role: 'client',
          label: `client-${index}`,
          group: GROUP_STAGE,
          auth: stableIdentity(`ff22-client-${index}`),
        })
      );
    }
    for (let index = 0; index < DISPLAY_COUNT; index += 1) {
      displayClients.push(
        connectSocket(serverUrl, {
          role: 'client',
          label: `display-${index}`,
          group: GROUP_DISPLAY,
          auth: stableIdentity(`ff22-display-${index}`),
        })
      );
    }

    const connected = await Promise.all([...stageClients, ...displayClients]);
    sockets.push(...connected.map((item) => item.socket));
    const connectAllMs = Date.now() - connectStartedAt;

    const clientListStartedAt = Date.now();
    await clientListTracker.waitForCount(CLIENT_COUNT + DISPLAY_COUNT);
    const clientListPropagationMs = Date.now() - clientListStartedAt;

    const firstClient = connected[0];
    const firstDisplay = connected[CLIENT_COUNT];
    await reclaimGroupOwnership({
      manager: manager.socket,
      target: firstClient.socket,
      targetGroup: GROUP_STAGE,
    });
    const controlDeliveryMs = await measureControlDelivery({
      manager: manager.socket,
      targetGroup: GROUP_STAGE,
      target: firstClient.socket,
      action: 'screenColor',
      payload: { color: '#2255ff', mode: 'solid' },
    });

    const networkRecoveryMs = await measureReconnect({
      serverUrl,
      clientListTracker,
      previous: firstClient,
      group: GROUP_STAGE,
      label: 'network-interruption',
    });

    const displayRefreshRecoveryMs = await measureReconnect({
      serverUrl,
      clientListTracker,
      previous: firstDisplay,
      group: GROUP_DISPLAY,
      label: 'display-refresh',
    });

    const secondClient = connected[1];
    const clientReconnectRecoveryMs = await measureReconnect({
      serverUrl,
      clientListTracker,
      previous: secondClient,
      group: GROUP_STAGE,
      label: 'client-reconnect',
    });

    const rootStopAllDeliveryMs = await measureRootStopAll({
      root: manager.socket,
      targets: connected.slice(2, 6).map((item) => item.socket),
    });

    const harnessRssMb = Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10;
    const budgets = [
      budget('server-startup', serverStartupMs, BUDGETS.serverStartupMs, 'ms'),
      budget('connect-all', connectAllMs, BUDGETS.connectAllMs, 'ms'),
      budget('client-list-propagation', clientListPropagationMs, BUDGETS.clientListPropagationMs, 'ms'),
      budget('control-delivery', controlDeliveryMs, BUDGETS.controlDeliveryMs, 'ms'),
      budget('network-recovery', networkRecoveryMs, BUDGETS.networkRecoveryMs, 'ms'),
      budget('display-refresh-recovery', displayRefreshRecoveryMs, BUDGETS.displayRefreshRecoveryMs, 'ms'),
      budget('client-reconnect-recovery', clientReconnectRecoveryMs, BUDGETS.clientReconnectRecoveryMs, 'ms'),
      budget('root-stop-all-delivery', rootStopAllDeliveryMs, BUDGETS.rootStopAllDeliveryMs, 'ms'),
      budget('harness-rss', harnessRssMb, BUDGETS.harnessRssMb, 'MiB'),
    ];
    const drills = [
      drill('network-interruption', networkRecoveryMs, BUDGETS.networkRecoveryMs),
      drill('display-refresh', displayRefreshRecoveryMs, BUDGETS.displayRefreshRecoveryMs),
      drill('client-reconnect', clientReconnectRecoveryMs, BUDGETS.clientReconnectRecoveryMs),
      drill('root-stop-all', rootStopAllDeliveryMs, BUDGETS.rootStopAllDeliveryMs),
    ];

    const report = {
      id: 'FF-22',
      status: budgets.every((item) => item.status === 'pass') && drills.every((item) => item.status === 'pass')
        ? 'pass'
        : 'fail',
      generatedAt: new Date().toISOString(),
      serverUrl,
      realisticDeviceCounts: {
        managers: 1,
        clients: CLIENT_COUNT,
        displays: DISPLAY_COUNT,
      },
      budgets,
      drills,
      proofMatrix: buildProofMatrix(budgets, drills),
      evidencePath: EVIDENCE_PATH,
      notes: [
        'Started the real @shugu/server process.',
        'Used Socket.IO manager/client/display connections over the runtime msg event.',
        'No deterministic fixture was used as a substitute for runtime proof.',
      ],
    };

    writeFileSync(EVIDENCE_PATH, `${JSON.stringify(report, null, 2)}\n`);
    return report;
  } finally {
    for (const socket of sockets) socket.disconnect();
    killProcess(server, 'SIGTERM');
    await waitForExit(server);
  }
}

function spawnServer(port) {
  const proc = spawn('node', ['apps/server/dist-out/main.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      SHUGU_DEV_HOST: HOST,
      SHUGU_ALLOW_INSECURE_MANAGER: '1',
      SHUGU_CLIENT_GRACE_MS: '500',
      REDIS_URL: '',
      FORCE_COLOR: '1',
    },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout?.on('data', (buf) => process.stdout.write(`[ff22:server] ${buf}`));
  proc.stderr?.on('data', (buf) => process.stderr.write(`[ff22:server] ${buf}`));
  return proc;
}

async function connectSocket(serverUrl, { role, label, group, auth }) {
  const socket = io(serverUrl, {
    transports: ['websocket'],
    query: { role, ...(group ? { group } : {}) },
    auth,
    rejectUnauthorized: false,
    reconnection: false,
  });
  await onceConnect(socket, label);
  const registered = await waitForMessage(socket, (message) => message.action === 'clientRegistered', label);
  return { socket, clientId: registered.payload.clientId, auth, group, label };
}

function stableIdentity(id) {
  return {
    clientId: id,
    deviceId: id,
    instanceId: `${id}-instance`,
  };
}

async function measureControlDelivery({ manager, targetGroup, target, action, payload }) {
  const startedAt = Date.now();
  const received = waitForMessage(
    target,
    (message) => message.type === 'control' && message.action === action && message.payload?.color === payload.color,
    action
  );
  manager.emit('msg', createControlMessage({ role: 'manager', targetGroup, action, payload }));
  await received;
  return Date.now() - startedAt;
}

async function reclaimGroupOwnership({ manager, target, targetGroup }) {
  const routed = waitForMessage(
    target,
    (message) => message.type === 'plugin' && message.pluginId === 'node-executor' && message.command === 'reclaim',
    'node-executor:reclaim'
  );
  manager.emit('msg', createPluginMessage({ targetGroup, pluginId: 'node-executor', command: 'reclaim' }));
  await routed;
}

async function measureReconnect({ serverUrl, clientListTracker, previous, group, label }) {
  const startedAt = Date.now();
  previous.socket.disconnect();
  const reconnected = await connectSocket(serverUrl, {
    role: 'client',
    label,
    group,
    auth: previous.auth,
  });
  await clientListTracker.waitForEntry(reconnected.clientId, true);
  return Date.now() - startedAt;
}

async function measureRootStopAll({ root, targets }) {
  const startedAt = Date.now();
  const deliveries = targets.map((socket) =>
    waitForMessage(socket, (message) => message.type === 'control' && message.action === 'shutdown', 'root-stop-all')
  );
  root.emit('msg', createRootStopAllMessage());
  await Promise.all(deliveries);
  return Date.now() - startedAt;
}

function createClientListTracker(socket) {
  let latestClients = [];
  const waiters = new Set();
  socket.on('msg', (message) => {
    const clients = message.action === 'clientList' ? message.payload?.clients : null;
    if (!Array.isArray(clients)) return;
    latestClients = clients;
    for (const waiter of Array.from(waiters)) waiter();
  });

  const waitFor = (predicate, label) =>
    new Promise((resolve, reject) => {
      if (predicate(latestClients)) {
        resolve(latestClients);
        return;
      }
      const check = () => {
        if (!predicate(latestClients)) return;
        clearTimeout(timeoutId);
        waiters.delete(check);
        resolve(latestClients);
      };
      const timeoutId = setTimeout(() => {
        waiters.delete(check);
        reject(new Error(`timeout waiting for ${label}`));
      }, TIMEOUT_MS);
      waiters.add(check);
    });

  return {
    waitForCount: (minimumCount) =>
      waitFor(
        (clients) => clients.filter((client) => client.connected).length >= minimumCount,
        `clientList:${minimumCount}`
      ),
    waitForEntry: (clientId, connected) =>
      waitFor(
        (clients) => clients.some((client) => client.clientId === clientId && client.connected === connected),
        `clientList:${clientId}`
      ),
  };
}

function waitForMessage(socket, predicate, label) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting for ${label}`));
    }, TIMEOUT_MS);
    const onMsg = (message) => {
      if (!predicate(message)) return;
      cleanup();
      resolve(message);
    };
    const onDisconnect = () => {
      cleanup();
      reject(new Error(`socket disconnected while waiting for ${label}`));
    };
    const cleanup = () => {
      clearTimeout(timeoutId);
      socket.off('msg', onMsg);
      socket.off('disconnect', onDisconnect);
    };
    socket.on('msg', onMsg);
    socket.on('disconnect', onDisconnect);
  });
}

function onceConnect(socket, label) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout connecting ${label}`));
    }, TIMEOUT_MS);
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const cleanup = () => {
      clearTimeout(timeoutId);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    };
    socket.on('connect', onConnect);
    socket.on('connect_error', onError);
  });
}

function createControlMessage({ role, targetGroup, action, payload }) {
  const now = Date.now();
  return {
    type: 'control',
    version: 1,
    from: 'manager',
    actor: role === 'root' ? 'root' : 'ff22-manager',
    role,
    scopeGroupId: targetGroup,
    correlationId: `ff22-corr-${now}-${Math.random().toString(36).slice(2)}`,
    idempotencyKey: `ff22-idem-${now}-${Math.random().toString(36).slice(2)}`,
    target: { mode: 'group', groupId: targetGroup },
    action,
    payload,
    clientTimestamp: now,
  };
}

function createPluginMessage({ targetGroup, pluginId, command, payload = {} }) {
  const now = Date.now();
  return {
    type: 'plugin',
    version: 1,
    from: 'manager',
    actor: 'ff22-manager',
    role: 'manager',
    scopeGroupId: targetGroup,
    correlationId: `ff22-corr-${now}-${Math.random().toString(36).slice(2)}`,
    idempotencyKey: `ff22-idem-${now}-${Math.random().toString(36).slice(2)}`,
    target: { mode: 'group', groupId: targetGroup },
    pluginId,
    command,
    payload,
    clientTimestamp: now,
  };
}

function createRootStopAllMessage() {
  return {
    ...createControlMessage({
      role: 'root',
      targetGroup: '__root_emergency__',
      action: 'shutdown',
      payload: {
        kind: 'stop-all',
        reason: 'root-stop-all',
        clears: ['media', 'sound', 'color', 'visual-scenes', 'node-executors'],
      },
    }),
    target: { mode: 'all' },
  };
}

function budget(id, measured, threshold, unit) {
  return {
    id,
    measured,
    threshold,
    unit,
    status: measured <= threshold ? 'pass' : 'fail',
  };
}

function drill(id, measuredMs, thresholdMs) {
  return {
    id,
    measuredMs,
    thresholdMs,
    status: measuredMs <= thresholdMs ? 'pass' : 'fail',
  };
}

function buildProofMatrix(budgets, drills) {
  return [
    ...budgets.map((item) => ({
      criterion: item.id,
      requiredProofType: 'product-runtime',
      deterministicProof: 'not-used-as-substitute',
      runtimeBrowserProof: 'real-socket.io-server-runtime',
      evidencePath: EVIDENCE_PATH,
      status: item.status,
      deferredRiskAcceptance: 'none',
      reviewerNotes: `${item.measured}${item.unit} <= ${item.threshold}${item.unit}`,
    })),
    ...drills.map((item) => ({
      criterion: item.id,
      requiredProofType: 'product-runtime',
      deterministicProof: 'not-used-as-substitute',
      runtimeBrowserProof: 'real-socket.io-server-runtime',
      evidencePath: EVIDENCE_PATH,
      status: item.status,
      deferredRiskAcceptance: 'none',
      reviewerNotes: `${item.measuredMs}ms <= ${item.thresholdMs}ms`,
    })),
  ];
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 80; port += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (await canListen(port)) return port;
  }
  throw new Error(`unable to find available port from ${startPort}`);
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen(port, HOST, () => server.close(() => resolve(true)));
  });
}

function waitForPort(port, { timeoutMs }) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ port, host: HOST });
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`timeout waiting for ${HOST}:${port}`));
          return;
        }
        setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

function killProcess(proc, signal) {
  if (!proc || proc.exitCode !== null) return;
  try {
    if (process.platform !== 'win32' && typeof proc.pid === 'number') {
      process.kill(-proc.pid, signal);
      return;
    }
  } catch {
    // Fall through to direct kill.
  }
  try {
    proc.kill(signal);
  } catch {
    // ignore
  }
}

function waitForExit(proc, timeoutMs = 10_000) {
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
