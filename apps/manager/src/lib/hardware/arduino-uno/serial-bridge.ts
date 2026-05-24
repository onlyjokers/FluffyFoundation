/**
 * Purpose: Manager-local Web Serial bridge that writes semantic Arduino UNO node state to hardware.
 */
import { get, writable, type Writable } from 'svelte/store';

import { nodeEngine } from '$lib/nodes/engine';
import {
  collectArduinoUnoSerialRoutes,
  diffArduinoUnoBridgeCommands,
  type ArduinoUnoBridgeActive,
  type ArduinoUnoBridgeCommand,
} from './bridge-core';

export type SerialPortLike = {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  writable: WritableStream<Uint8Array> | null;
};

type SerialNavigator = Navigator & {
  serial?: {
    requestPort(): Promise<SerialPortLike>;
    getPorts?(): Promise<SerialPortLike[]>;
  };
};

export type ArduinoUnoConnectionStatus =
  | 'unsupported'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export type ArduinoUnoBridgeState = {
  status: ArduinoUnoConnectionStatus;
  lastError: string | null;
  lastCommand: string | null;
  activeNodes: number;
  pendingCommands: number;
  connectedDevices: number;
  autoConnectCurrentArduino: boolean;
  unavailableAutoConnectDevices: number;
};

const initialState: ArduinoUnoBridgeState = {
  status: typeof navigator !== 'undefined' && 'serial' in navigator ? 'disconnected' : 'unsupported',
  lastError: null,
  lastCommand: null,
  activeNodes: 0,
  pendingCommands: 0,
  connectedDevices: 0,
  autoConnectCurrentArduino: false,
  unavailableAutoConnectDevices: 0,
};

type ArduinoUnoSerialDevice = {
  id: string;
  port: SerialPortLike;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  active: Map<string, ArduinoUnoBridgeActive>;
};

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type SerialLike = {
  requestPort(): Promise<SerialPortLike>;
  getPorts?(): Promise<SerialPortLike[]>;
};

type ArduinoUnoSerialBridgeOptions = {
  serial?: SerialLike | null;
  storage?: StorageLike | null;
  autoStart?: boolean;
  subscribeRuntime?: boolean;
};

const AUTO_CONNECT_STORAGE_KEY = 'shugu-arduino-auto-connect-current-v1';
const CONNECTED_COUNT_STORAGE_KEY = 'shugu-arduino-connected-count-v1';

function defaultStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readBoolean(storage: StorageLike | null, key: string): boolean {
  try {
    return storage?.getItem(key) === '1';
  } catch {
    return false;
  }
}

function readCount(storage: StorageLike | null, key: string): number {
  try {
    const value = Number(storage?.getItem(key) ?? 0);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    return 0;
  }
}

function writeStorage(storage: StorageLike | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Local persistence is best-effort; live serial state remains authoritative.
  }
}

export class ArduinoUnoSerialBridge {
  public state: Writable<ArduinoUnoBridgeState> = writable(initialState);

  private encoder = new TextEncoder();
  private devices = new Map<string, ArduinoUnoSerialDevice>();
  private writeChain: Promise<void> = Promise.resolve();
  private readonly serialOverride: SerialLike | null | undefined;
  private readonly storage: StorageLike | null;

  constructor(options: ArduinoUnoSerialBridgeOptions = {}) {
    this.serialOverride = options.serial;
    this.storage = options.storage === undefined ? defaultStorage() : options.storage;
    this.patchState({
      status: this.isSupported() ? 'disconnected' : 'unsupported',
      autoConnectCurrentArduino: readBoolean(this.storage, AUTO_CONNECT_STORAGE_KEY),
    });
    const subscribeRuntime = options.subscribeRuntime ?? true;
    if (typeof window !== 'undefined' && subscribeRuntime) {
      nodeEngine.tickTime.subscribe(() => this.flushFromGraph());
      nodeEngine.graphState.subscribe(() => this.flushFromGraph());
      nodeEngine.isRunning.subscribe((running) => {
        if (!running) void this.resetActivePins();
      });
    }
    if (options.autoStart ?? true) void this.autoConnectAuthorizedPorts();
  }

  async connect(): Promise<void> {
    const serial = this.getSerial();
    if (!serial) {
      this.patchState({ status: 'unsupported', lastError: 'Web Serial is not supported in this browser.' });
      return;
    }

    this.patchState({ status: 'connecting', lastError: null });
    try {
      const port = await serial.requestPort();
      await this.openPort(port);
      this.patchState({
        status: 'connected',
        lastError: null,
        lastCommand: null,
        activeNodes: 0,
        pendingCommands: 0,
        connectedDevices: this.devices.size,
      });
      this.persistConnectedCountIfEnabled();
      this.flushFromGraph();
    } catch (error) {
      await this.closeAllDevices();
      this.patchState({
        status: 'error',
        lastError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async autoConnectAuthorizedPorts(): Promise<void> {
    const serial = this.getSerial();
    if (!serial) {
      this.patchState({ status: 'unsupported', lastError: 'Web Serial is not supported in this browser.' });
      return;
    }
    if (!get(this.state).autoConnectCurrentArduino) return;
    if (!serial.getPorts) {
      this.patchState({ unavailableAutoConnectDevices: readCount(this.storage, CONNECTED_COUNT_STORAGE_KEY) });
      return;
    }

    const savedCount = readCount(this.storage, CONNECTED_COUNT_STORAGE_KEY);
    if (savedCount <= 0) return;
    this.patchState({ status: 'connecting', lastError: null });
    try {
      const ports = (await serial.getPorts()).slice(0, savedCount);
      for (const port of ports) {
        await this.openPort(port);
      }
      const unavailable = Math.max(0, savedCount - ports.length);
      this.patchState({
        status: this.devices.size > 0 ? 'connected' : 'disconnected',
        lastError: null,
        connectedDevices: this.devices.size,
        unavailableAutoConnectDevices: unavailable,
      });
      this.flushFromGraph();
    } catch (error) {
      await this.closeAllDevices();
      this.patchState({
        status: 'error',
        lastError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async disconnect(): Promise<void> {
    await this.resetActivePins();
    await this.closeAllDevices();
    this.patchState({
      status: this.isSupported() ? 'disconnected' : 'unsupported',
      pendingCommands: 0,
      connectedDevices: 0,
      unavailableAutoConnectDevices: 0,
    });
    this.persistConnectedCountIfEnabled();
  }

  setAutoConnectCurrentArduino(enabled: boolean): void {
    writeStorage(this.storage, AUTO_CONNECT_STORAGE_KEY, enabled ? '1' : '0');
    this.patchState({ autoConnectCurrentArduino: enabled });
    if (enabled) {
      this.persistConnectedCountIfEnabled();
    } else {
      writeStorage(this.storage, CONNECTED_COUNT_STORAGE_KEY, '0');
      this.patchState({ unavailableAutoConnectDevices: 0 });
    }
  }

  private isSupported(): boolean {
    return Boolean(this.getSerial());
  }

  private getSerial(): SerialLike | null {
    if (this.serialOverride !== undefined) return this.serialOverride;
    return (navigator as SerialNavigator | undefined)?.serial ?? null;
  }

  private async openPort(port: SerialPortLike): Promise<void> {
    await port.open({ baudRate: 9600 });
    const writer = port.writable?.getWriter();
    if (!writer) throw new Error('Selected serial port is not writable.');

    const deviceId = this.createDeviceId();
    this.devices.set(deviceId, { id: deviceId, port, writer, active: new Map() });
  }

  private flushFromGraph(): void {
    if (this.devices.size === 0 || get(this.state).status !== 'connected') return;

    const routesPlan = collectArduinoUnoSerialRoutes({
      graph: get(nodeEngine.graphState),
      getComputedInputs: (nodeId) => nodeEngine.getLastComputedInputs(nodeId),
      arduinoIdsInOrder: () => Array.from(this.devices.keys()),
    });
    const nextActiveByDevice = new Map<string, Map<string, ArduinoUnoBridgeActive>>();
    const groupedRoutes = new Map<string, typeof routesPlan.routes>();
    for (const route of routesPlan.routes) {
      const list = groupedRoutes.get(route.arduinoId) ?? [];
      list.push(route);
      groupedRoutes.set(route.arduinoId, list);
    }

    if (routesPlan.errors.length > 0) {
      this.patchState({ lastError: routesPlan.errors.map((error) => `${error.nodeId}: ${error.message}`).join('; ') });
    } else {
      this.patchState({ lastError: null });
    }

    const commands: Array<{ deviceId: string; command: ArduinoUnoBridgeCommand }> = [];
    for (const [deviceId, device] of this.devices) {
      const nextPayloads = (groupedRoutes.get(deviceId) ?? []).map((route) => route.payload);
      const plan = diffArduinoUnoBridgeCommands(device.active, nextPayloads);
      nextActiveByDevice.set(deviceId, plan.nextActive);
      for (const command of plan.commands) commands.push({ deviceId, command });
    }

    for (const [deviceId, nextActive] of nextActiveByDevice) {
      const device = this.devices.get(deviceId);
      if (device) device.active = nextActive;
    }

    if (commands.length > 0) this.enqueueCommands(commands);
    const activeNodes = Array.from(this.devices.values()).reduce((sum, device) => sum + device.active.size, 0);
    this.patchState({ activeNodes, connectedDevices: this.devices.size });
  }

  private enqueueCommands(commands: Array<{ deviceId: string; command: ArduinoUnoBridgeCommand }>): void {
    this.patchState({ pendingCommands: get(this.state).pendingCommands + commands.length });
    this.writeChain = this.writeChain.then(async () => {
      for (const entry of commands) {
        await this.writeCommand(entry.deviceId, entry.command.command);
      }
    });
    this.writeChain.catch((error) => {
      this.patchState({
        status: 'error',
        lastError: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private async writeCommand(deviceId: string, command: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) return;
    await device.writer.write(this.encoder.encode(command));
    this.patchState({
      lastCommand: command.trim(),
      pendingCommands: Math.max(0, get(this.state).pendingCommands - 1),
    });
  }

  private async resetActivePins(): Promise<void> {
    if (this.devices.size === 0) {
      this.patchState({ activeNodes: 0 });
      return;
    }
    const commands: Array<{ deviceId: string; command: ArduinoUnoBridgeCommand }> = [];
    for (const [deviceId, device] of this.devices) {
      if (device.active.size === 0) continue;
      const plan = diffArduinoUnoBridgeCommands(device.active, []);
      device.active.clear();
      for (const command of plan.commands) commands.push({ deviceId, command });
    }
    if (commands.length > 0) this.enqueueCommands(commands);
    await this.writeChain;
    this.patchState({ activeNodes: 0 });
  }

  private async closeAllDevices(): Promise<void> {
    const devices = Array.from(this.devices.values());
    this.devices.clear();

    for (const device of devices) {
      try {
        device.writer.releaseLock();
      } catch {
        // Ignore cleanup failures; the following connect attempt will request a fresh port.
      }
      try {
        await device.port.close();
      } catch (error) {
        this.patchState({ lastError: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  private createDeviceId(): string {
    return `arduino-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private persistConnectedCountIfEnabled(): void {
    if (!get(this.state).autoConnectCurrentArduino) return;
    writeStorage(this.storage, CONNECTED_COUNT_STORAGE_KEY, String(this.devices.size));
  }

  private patchState(patch: Partial<ArduinoUnoBridgeState>): void {
    this.state.update((state) => ({ ...state, ...patch }));
  }
}

export const arduinoUnoSerialBridge = new ArduinoUnoSerialBridge();
export const arduinoUnoSerialBridgeState = arduinoUnoSerialBridge.state;
export const connectArduinoUno = (): Promise<void> => arduinoUnoSerialBridge.connect();
export const disconnectArduinoUno = (): Promise<void> => arduinoUnoSerialBridge.disconnect();
export const setArduinoUnoAutoConnect = (enabled: boolean): void =>
  arduinoUnoSerialBridge.setAutoConnectCurrentArduino(enabled);
