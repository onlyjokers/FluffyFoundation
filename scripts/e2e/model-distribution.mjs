import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import process from 'node:process';
import { chromium } from 'playwright';

const ROOT = process.cwd();

const CLIENT_A_ID = 'c_e2e_owner';
const CLIENT_B_ID = 'c_e2e_non_owner';
const MANAGER_USER = 'Eureka';
const ASSET_WRITE_TOKEN = 'dev-write';

const GROUP_ID = 'g_e2e_models';
const E2E_STEP_TIMEOUT_MS = 40_000;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function launchChromium() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Executable doesn't exist")) throw error;
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
    if (code && code !== 0) console.error(`${prefix} exited with code ${code}`);
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

async function findAvailablePort(
  startPort,
  reservedPorts,
  { host = '127.0.0.1', maxAttempts = 50 } = {}
) {
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

async function assert(condition, message) {
  if (condition) return;
  throw new Error(message);
}

function loopGraphWithAi({ clientId, modelRef }) {
  const ids = {
    client: 'node-client-e2e',
    sensors: 'node-sensors-e2e',
    screen: 'node-screen-e2e',
    ai: 'node-ai-e2e',
  };

  return {
    nodes: [
      {
        id: ids.client,
        type: 'client-object',
        position: { x: 60, y: 140 },
        config: { clientId },
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
          primary: '#ff0000',
          secondary: '#ffffff',
          maxOpacity: 1,
          minOpacity: 0,
          waveform: 'sine',
          frequencyHz: 1.5,
        },
        inputValues: {},
        outputValues: {},
      },
      {
        id: ids.ai,
        type: 'ai-model-ref',
        position: { x: 360, y: 340 },
        config: {
          enabled: true,
          model: modelRef,
        },
        inputValues: {},
        outputValues: {},
      },
    ],
    connections: [
      {
        id: 'conn-e2e-client-to-sensors',
        sourceNodeId: ids.client,
        sourcePortId: 'out',
        targetNodeId: ids.sensors,
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
        targetNodeId: ids.client,
        targetPortId: 'in',
      },
    ],
  };
}

async function uploadModelAsset({ serverOrigin }) {
  const buf = fs.readFileSync(`${ROOT}/.tmp/e2e-model.onnx`);
  const fd = new FormData();
  fd.set('file', new Blob([buf], { type: 'model/onnx' }), 'e2e-model.onnx');
  fd.set('kind', 'model');
  fd.set('originalName', 'e2e-model.onnx');

  const resp = await fetch(`${serverOrigin}/api/assets`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ASSET_WRITE_TOKEN}`,
    },
    body: fd,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`upload failed: ${resp.status} ${resp.statusText}: ${text}`);
  }
  const json = await resp.json();
  const assetId = String(json?.asset?.id ?? '').trim();
  if (!assetId) throw new Error('upload succeeded but asset.id missing');
  return assetId;
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
    spawnService('server', ['--filter', '@shugu/server', 'run', 'dev'], {
      PORT: String(serverPort),
      ASSET_WRITE_TOKEN,
    }),
    spawnService(
      'manager',
      [
        '--filter',
        '@shugu/manager',
        'exec',
        'vite',
        'dev',
        '--port',
        String(managerPort),
        '--strictPort',
      ],
      {}
    ),
    spawnService(
      'client',
      [
        '--filter',
        '@shugu/client',
        'exec',
        'vite',
        'dev',
        '--port',
        String(clientPort),
        '--strictPort',
      ],
      {}
    ),
  ];

  const cleanup = async () => {
    for (const p of procs) killProcess(p, 'SIGTERM');
    await Promise.all(procs.map((p) => waitForExit(p, { timeoutMs: 12_000 })));
  };

  process.on('SIGINT', () => cleanup().finally(() => process.exit(130)));
  process.on('SIGTERM', () => cleanup().finally(() => process.exit(143)));

  try {
    await Promise.all([waitForPort(serverPort), waitForPort(managerPort), waitForPort(clientPort)]);

    const modelAssetId = await uploadModelAsset({ serverOrigin: SERVER_ORIGIN });
    const modelRef = `asset:${modelAssetId}`;

    const browser = await launchChromium();
    const managerContext = await browser.newContext({ ignoreHTTPSErrors: true });

    await managerContext.addCookies([
      { name: 'shugu-manager-auth', value: MANAGER_USER, url: MANAGER_ORIGIN, sameSite: 'Lax' },
    ]);

    const clientContextA = await browser.newContext({ ignoreHTTPSErrors: true });
    const clientPageA = await clientContextA.newPage();
    await clientPageA.addInitScript(
      ({ serverUrl, clientId }) => {
        localStorage.setItem('shugu-server-url', serverUrl);
        localStorage.setItem('shugu-device-id', clientId);
        sessionStorage.setItem('shugu-client-instance-id', `i_${clientId}`);
        sessionStorage.setItem('shugu-client-id', clientId);
        window.__SHUGU_E2E = true;
      },
      { serverUrl: SERVER_ORIGIN, clientId: CLIENT_A_ID }
    );
    await clientPageA.goto(`${CLIENT_ORIGIN}/?server=${encodeURIComponent(SERVER_ORIGIN)}&e2e=1`, {
      waitUntil: 'domcontentloaded',
    });

    await clientPageA.evaluate(async () => {
      window.__E2E_TRANSFER_OFFER = null;
      const mod = await import('/src/lib/stores/client.ts');
      mod.transferOffer.subscribe((offer) => {
        window.__E2E_TRANSFER_OFFER = offer;
      });
    });

    const managerPage = await managerContext.newPage();
    managerPage.on('dialog', (dialog) => {
      console.log('[e2e] dialog:', dialog.message());
      dialog.accept();
    });
    await managerPage.addInitScript(
      ({ serverUrl, writeToken }) => {
        localStorage.setItem('shugu-server-url', serverUrl);
        localStorage.setItem('shugu-asset-write-token', writeToken);
      },
      { serverUrl: SERVER_ORIGIN, writeToken: ASSET_WRITE_TOKEN }
    );

    await managerPage.goto(`${MANAGER_ORIGIN}/root`, { waitUntil: 'domcontentloaded' });

    await managerPage.evaluate(async () => {
      window.__E2E_MANAGER_STATE = null;
      window.__E2E_AI_READINESS = [];
      const mgr = await import('/src/lib/stores/manager.ts');
      mgr.state.subscribe((st) => {
        window.__E2E_MANAGER_STATE = {
          status: st.status,
          managerId: st.managerId,
          clients: st.clients,
          selectedClientIds: st.selectedClientIds,
          controlPlane: {
            safeMode: Boolean(st.controlPlane?.safeMode),
            ownership: st.controlPlane?.ownership ?? {},
          },
        };
      });
      mgr.clientAiReadiness.subscribe((map) => {
        window.__E2E_AI_READINESS = Array.from(map.entries());
      });
    });

    await managerPage.getByRole('button', { name: 'Connect' }).click();

    await managerPage.waitForFunction(
      (clientId) => {
        const st = window.__E2E_MANAGER_STATE;
        if (!st || st.status !== 'connected') return false;
        const clients = Array.isArray(st.clients) ? st.clients : [];
        return clients.some((c) => String(c?.clientId ?? '') === String(clientId));
      },
      CLIENT_A_ID,
      { timeout: 60_000 }
    );

    await managerPage.waitForFunction(() => Boolean(window.__shuguNodeEngine), null, {
      timeout: E2E_STEP_TIMEOUT_MS,
    });

    const managerId = await managerPage.evaluate(
      () => window.__E2E_MANAGER_STATE?.managerId ?? null
    );
    await assert(typeof managerId === 'string' && managerId, 'managerId missing after connect');

    await managerPage.evaluate(
      async ({ groupId, managerId, modelAssetId }) => {
        const mgr = await import('/src/lib/stores/manager.ts');
        const modelDist = await import('/src/lib/stores/model-distribution.ts');
        mgr.setGroupPolicies([{ groupId, managerId, transferable: true }]);
        modelDist.modelDistributionStore.setGroupModels(groupId, [modelAssetId]);
        mgr.resumeControlPlane();
        mgr.requestControlPlaneSnapshot();
      },
      { groupId: GROUP_ID, managerId, modelAssetId }
    );

    await managerPage.waitForFunction(
      () => window.__E2E_MANAGER_STATE?.controlPlane?.safeMode === false,
      null,
      { timeout: E2E_STEP_TIMEOUT_MS }
    );

    await managerPage.waitForFunction(
      ({ groupId, managerId }) => {
        const ownership = window.__E2E_MANAGER_STATE?.controlPlane?.ownership ?? {};
        const o = ownership[groupId];
        const stack = Array.isArray(o?.ownerStack) ? o.ownerStack.map(String) : [];
        return stack.length > 0 && stack[stack.length - 1] === managerId;
      },
      { groupId: GROUP_ID, managerId },
      { timeout: E2E_STEP_TIMEOUT_MS }
    );

    await managerPage.evaluate(
      async ({ toActorId, groupId }) => {
        const mgr = await import('/src/lib/stores/manager.ts');
        mgr.offerTransfer(toActorId, [groupId]);
      },
      { toActorId: CLIENT_A_ID, groupId: GROUP_ID }
    );

    await managerPage.waitForFunction(
      ({ groupId, managerId, toActorId }) => {
        const ownership = window.__E2E_MANAGER_STATE?.controlPlane?.ownership ?? {};
        const pending = ownership?.[groupId]?.pendingTransfer;
        if (!pending?.offerId) return false;
        if (String(pending.from ?? '') !== String(managerId)) return false;
        if (String(pending.to ?? '') !== String(toActorId)) return false;
        return true;
      },
      { groupId: GROUP_ID, managerId, toActorId: CLIENT_A_ID },
      { timeout: E2E_STEP_TIMEOUT_MS }
    );

    await clientPageA.waitForFunction(() => Boolean(window.__E2E_TRANSFER_OFFER?.offerId), null, {
      timeout: E2E_STEP_TIMEOUT_MS,
    });

    await clientPageA.evaluate(async () => {
      const offer = window.__E2E_TRANSFER_OFFER;
      if (!offer?.offerId) throw new Error('transferOffer missing');
      const mod = await import('/src/lib/stores/client.ts');
      mod.getSDK()?.acceptTransfer(String(offer.offerId));
    });

    await managerPage.waitForFunction(
      ({ groupId, clientId }) => {
        const ownership = window.__E2E_MANAGER_STATE?.controlPlane?.ownership ?? {};
        const o = ownership[groupId];
        const stack = Array.isArray(o?.ownerStack) ? o.ownerStack.map(String) : [];
        return stack.length > 0 && stack[stack.length - 1] === clientId;
      },
      { groupId: GROUP_ID, clientId: CLIENT_A_ID },
      { timeout: E2E_STEP_TIMEOUT_MS }
    );

    await clientPageA.waitForFunction(
      (expectedRef) => {
        const entry = window.__SHUGU_E2E_LAST_MANIFEST;
        if (!entry || typeof entry !== 'object') return false;
        const assets = Array.isArray(entry.assets) ? entry.assets : [];
        return assets.includes(expectedRef);
      },
      modelRef,
      { timeout: E2E_STEP_TIMEOUT_MS }
    );

    // Connect a second client after ownership is established.
    const clientContextB = await browser.newContext({ ignoreHTTPSErrors: true });
    const clientPageB = await clientContextB.newPage();
    await clientPageB.addInitScript(
      ({ serverUrl, clientId }) => {
        localStorage.setItem('shugu-server-url', serverUrl);
        localStorage.setItem('shugu-device-id', clientId);
        sessionStorage.setItem('shugu-client-instance-id', `i_${clientId}`);
        sessionStorage.setItem('shugu-client-id', clientId);
        window.__SHUGU_E2E = true;
      },
      { serverUrl: SERVER_ORIGIN, clientId: CLIENT_B_ID }
    );

    await clientPageB.goto(`${CLIENT_ORIGIN}/?server=${encodeURIComponent(SERVER_ORIGIN)}&e2e=1`, {
      waitUntil: 'domcontentloaded',
    });

    await clientPageB.waitForFunction(
      () => {
        const entry = window.__SHUGU_E2E_LAST_MANIFEST;
        return Boolean(entry && typeof entry === 'object' && Array.isArray(entry.assets));
      },
      null,
      { timeout: E2E_STEP_TIMEOUT_MS }
    );

    const nonOwnerHasModel = await clientPageB.evaluate((expectedRef) => {
      const entry = window.__SHUGU_E2E_LAST_MANIFEST;
      if (!entry || typeof entry !== 'object') return false;
      const assets = Array.isArray(entry.assets) ? entry.assets : [];
      return assets.includes(expectedRef);
    }, modelRef);
    await assert(!nonOwnerHasModel, 'expected non-owner client manifest to exclude model asset');

    // AI: deploy a loop graph containing ai-model-ref and wait for manager AI readiness.
    const graph = loopGraphWithAi({ clientId: CLIENT_A_ID, modelRef });
    await managerPage.evaluate((g) => window.__shuguNodeEngine.loadGraph(g), graph);
    await managerPage.waitForSelector('.loop-frame', { timeout: E2E_STEP_TIMEOUT_MS });

    // Some server flows require explicit client selection before sending plugins.
    await managerPage.evaluate(async (clientId) => {
      const mgr = await import('/src/lib/stores/manager.ts');
      mgr.selectClients([String(clientId)]);
    }, CLIENT_A_ID);

    await managerPage.getByRole('button', { name: 'Start' }).click();
    await managerPage.getByRole('button', { name: /^Deploy$/ }).click();
    await managerPage.waitForSelector('text=Stop Loop', { timeout: E2E_STEP_TIMEOUT_MS });

    await managerPage.waitForFunction(
      (clientId) => {
        const entries = Array.isArray(window.__E2E_AI_READINESS) ? window.__E2E_AI_READINESS : [];
        for (const [id, info] of entries) {
          if (String(id) !== String(clientId)) continue;
          return Boolean(info && info.enabled === true);
        }
        return false;
      },
      CLIENT_A_ID,
      { timeout: E2E_STEP_TIMEOUT_MS }
    );

    console.log('[e2e] ✅ model distribution + AI telemetry OK');

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
