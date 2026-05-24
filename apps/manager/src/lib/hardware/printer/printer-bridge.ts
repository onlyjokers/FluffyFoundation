/**
 * Purpose: Manager-local bridge that submits semantic Printer node payloads to the server CUPS API.
 */
import { get, writable, type Writable } from 'svelte/store';

import { nodeEngine } from '$lib/nodes/engine';
import {
  collectPrinterRoutes,
  diffPrinterBridgeJobs,
  type PrinterBridgeJob,
  type PrinterBridgePrinted,
} from './bridge-core';

export type PrinterInfo = {
  id: string;
  name: string;
  isDefault: boolean;
  status: string;
};

export type PrinterBridgeStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type PrinterBridgeLastJob = {
  printerId: string;
  nodeId: string;
  signature: string;
  jobId: string | null;
};

export type PrinterBridgeState = {
  status: PrinterBridgeStatus;
  serverUrl: string;
  printers: PrinterInfo[];
  connectedPrinterIds: string[];
  unavailableAutoConnectPrinterIds: string[];
  autoConnectCurrentPrinters: boolean;
  lastError: string | null;
  lastJob: PrinterBridgeLastJob | null;
  activeRoutes: number;
  pendingJobs: number;
};

const AUTO_CONNECT_STORAGE_KEY = 'shugu-printer-auto-connect-current-v1';
const CONNECTED_PRINTERS_STORAGE_KEY = 'shugu-printer-connected-ids-v1';

const initialState: PrinterBridgeState = {
  status: 'disconnected',
  serverUrl: '',
  printers: [],
  connectedPrinterIds: [],
  unavailableAutoConnectPrinterIds: [],
  autoConnectCurrentPrinters: false,
  lastError: null,
  lastJob: null,
  activeRoutes: 0,
  pendingJobs: 0,
};

function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Local persistence is best-effort; the live bridge state remains authoritative.
  }
}

function readStoredPrinterIds(): string[] {
  const raw = readStorage(CONNECTED_PRINTERS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function buildApiUrl(serverUrl: string, path: string): string {
  const trimmed = serverUrl.trim();
  if (!trimmed) throw new Error('Missing server URL.');
  const base = trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
  return new URL(path, base).toString();
}

class PrinterBridge {
  public state: Writable<PrinterBridgeState> = writable(initialState);

  private printed = new Map<string, PrinterBridgePrinted>();
  private submitChain: Promise<void> = Promise.resolve();
  private configuredServerUrl = '';
  private didAttemptAutoConnect = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.patchState({
        autoConnectCurrentPrinters: readStorage(AUTO_CONNECT_STORAGE_KEY) === '1',
      });
      nodeEngine.tickTime.subscribe(() => this.flushFromGraph());
      nodeEngine.graphState.subscribe(() => this.flushFromGraph());
      nodeEngine.isRunning.subscribe((running) => {
        if (running) this.flushFromGraph();
      });
    }
  }

  configure(serverUrl: string): void {
    const trimmed = serverUrl.trim();
    if (trimmed === this.configuredServerUrl) return;
    this.configuredServerUrl = trimmed;
    this.didAttemptAutoConnect = false;
    this.printed.clear();
    this.patchState({
      serverUrl: trimmed,
      printers: [],
      connectedPrinterIds: [],
      unavailableAutoConnectPrinterIds: [],
      status: 'disconnected',
      lastError: null,
      activeRoutes: 0,
      pendingJobs: 0,
    });
    void this.refreshPrinters({ autoConnect: true });
  }

  async refreshPrinters(options: { autoConnect?: boolean } = {}): Promise<void> {
    const serverUrl = get(this.state).serverUrl || this.configuredServerUrl;
    try {
      const response = await fetch(buildApiUrl(serverUrl, 'api/printers'));
      if (!response.ok) throw new Error(`Printer list failed (${response.status})`);
      const body = (await response.json()) as { printers?: PrinterInfo[] };
      const printers = Array.isArray(body.printers) ? body.printers : [];
      this.patchState({ printers, lastError: null });
      if (options.autoConnect) this.applyAutoConnect(printers);
    } catch (error) {
      this.patchState({
        status: 'error',
        lastError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async connectCurrentPrinters(): Promise<void> {
    this.patchState({ status: 'connecting', lastError: null });
    await this.refreshPrinters();
    const ids = get(this.state).printers.map((printer) => printer.id).filter(Boolean);
    this.setConnectedPrinterIds(ids, []);
  }

  async connectPrinter(printerId: string): Promise<void> {
    const id = String(printerId ?? '').trim();
    if (!id) return;
    if (!get(this.state).printers.some((printer) => printer.id === id)) {
      await this.refreshPrinters();
    }
    if (!get(this.state).printers.some((printer) => printer.id === id)) {
      this.patchState({ status: 'error', lastError: `Printer is unavailable: ${id}` });
      return;
    }
    const ids = new Set(get(this.state).connectedPrinterIds);
    ids.add(id);
    this.setConnectedPrinterIds(Array.from(ids), get(this.state).unavailableAutoConnectPrinterIds);
  }

  disconnectPrinter(printerId: string): void {
    const id = String(printerId ?? '').trim();
    if (!id) return;
    this.setConnectedPrinterIds(
      get(this.state).connectedPrinterIds.filter((entry) => entry !== id),
      get(this.state).unavailableAutoConnectPrinterIds.filter((entry) => entry !== id)
    );
  }

  disconnectAll(): void {
    this.setConnectedPrinterIds([], []);
  }

  setAutoConnectCurrentPrinters(enabled: boolean): void {
    writeStorage(AUTO_CONNECT_STORAGE_KEY, enabled ? '1' : '0');
    this.patchState({ autoConnectCurrentPrinters: enabled });
    if (enabled) {
      this.persistConnectedPrinterIds(get(this.state).connectedPrinterIds);
    } else {
      writeStorage(CONNECTED_PRINTERS_STORAGE_KEY, '[]');
      this.patchState({ unavailableAutoConnectPrinterIds: [] });
    }
  }

  private applyAutoConnect(printers: PrinterInfo[]): void {
    if (this.didAttemptAutoConnect || !get(this.state).autoConnectCurrentPrinters) return;
    this.didAttemptAutoConnect = true;
    const available = new Set(printers.map((printer) => printer.id));
    const saved = readStoredPrinterIds();
    const connected = saved.filter((id) => available.has(id));
    const unavailable = saved.filter((id) => !available.has(id));
    this.setConnectedPrinterIds(connected, unavailable, { persist: false });
  }

  private setConnectedPrinterIds(
    connectedPrinterIds: string[],
    unavailableAutoConnectPrinterIds: string[],
    options: { persist?: boolean } = {}
  ): void {
    const uniqueConnected = Array.from(new Set(connectedPrinterIds.map(String).filter(Boolean)));
    const uniqueUnavailable = Array.from(new Set(unavailableAutoConnectPrinterIds.map(String).filter(Boolean)));
    const status = uniqueConnected.length > 0 ? 'connected' : 'disconnected';
    this.patchState({
      connectedPrinterIds: uniqueConnected,
      unavailableAutoConnectPrinterIds: uniqueUnavailable,
      status,
      lastError: null,
    });
    if (options.persist !== false && get(this.state).autoConnectCurrentPrinters) {
      this.persistConnectedPrinterIds(uniqueConnected);
    }
    this.flushFromGraph();
  }

  private persistConnectedPrinterIds(ids: string[]): void {
    writeStorage(CONNECTED_PRINTERS_STORAGE_KEY, JSON.stringify(ids));
  }

  private flushFromGraph(): void {
    const state = get(this.state);
    if (state.connectedPrinterIds.length === 0 || state.status !== 'connected') return;
    if (!get(nodeEngine.isRunning)) return;

    const routesPlan = collectPrinterRoutes({
      graph: get(nodeEngine.graphState),
      getComputedInputs: (nodeId) => nodeEngine.getLastComputedInputs(nodeId),
      printerIdsInOrder: () => get(this.state).connectedPrinterIds,
    });

    if (routesPlan.errors.length > 0) {
      this.patchState({
        lastError: routesPlan.errors.map((error) => `${error.nodeId}: ${error.message}`).join('; '),
      });
    } else {
      this.patchState({ lastError: null });
    }

    const plan = diffPrinterBridgeJobs(this.printed, routesPlan.routes);
    this.printed = plan.nextPrinted;
    this.patchState({ activeRoutes: routesPlan.routes.length });
    if (plan.jobs.length > 0) this.enqueueJobs(plan.jobs);
  }

  private enqueueJobs(jobs: PrinterBridgeJob[]): void {
    this.patchState({ pendingJobs: get(this.state).pendingJobs + jobs.length });
    this.submitChain = this.submitChain.then(async () => {
      for (const job of jobs) await this.submitJob(job);
    });
    this.submitChain.catch((error) => {
      this.patchState({
        status: 'error',
        lastError: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private async submitJob(job: PrinterBridgeJob): Promise<void> {
    try {
      const response = await fetch(buildApiUrl(get(this.state).serverUrl, 'api/printers/jobs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerId: job.printerId, payload: job.payload }),
      });
      if (!response.ok) throw new Error(`Print job failed (${response.status})`);
      const body = (await response.json()) as { jobId?: string | null };
      this.patchState({
        lastJob: {
          printerId: job.printerId,
          nodeId: job.payload.nodeId,
          signature: job.payload.signature,
          jobId: body.jobId ?? null,
        },
        lastError: null,
      });
    } catch (error) {
      this.patchState({ lastError: error instanceof Error ? error.message : String(error) });
    } finally {
      this.patchState({ pendingJobs: Math.max(0, get(this.state).pendingJobs - 1) });
    }
  }

  private patchState(patch: Partial<PrinterBridgeState>): void {
    this.state.update((state) => ({ ...state, ...patch }));
  }
}

export const printerBridge = new PrinterBridge();
export const printerBridgeState = printerBridge.state;
export const configurePrinterBridge = (serverUrl: string): void => printerBridge.configure(serverUrl);
export const refreshPrinters = (): Promise<void> => printerBridge.refreshPrinters();
export const connectCurrentPrinters = (): Promise<void> => printerBridge.connectCurrentPrinters();
export const connectPrinter = (printerId: string): Promise<void> => printerBridge.connectPrinter(printerId);
export const disconnectPrinter = (printerId: string): void => printerBridge.disconnectPrinter(printerId);
export const disconnectAllPrinters = (): void => printerBridge.disconnectAll();
export const setPrinterAutoConnect = (enabled: boolean): void =>
  printerBridge.setAutoConnectCurrentPrinters(enabled);
