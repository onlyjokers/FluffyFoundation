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

type SerialPortLike = {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  writable: WritableStream<Uint8Array> | null;
};

type SerialNavigator = Navigator & {
  serial?: {
    requestPort(): Promise<SerialPortLike>;
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
};

const initialState: ArduinoUnoBridgeState = {
  status: typeof navigator !== 'undefined' && 'serial' in navigator ? 'disconnected' : 'unsupported',
  lastError: null,
  lastCommand: null,
  activeNodes: 0,
  pendingCommands: 0,
  connectedDevices: 0,
};

type ArduinoUnoSerialDevice = {
  id: string;
  port: SerialPortLike;
  writer: WritableStreamDefaultWriter<Uint8Array>;
  active: Map<string, ArduinoUnoBridgeActive>;
};

class ArduinoUnoSerialBridge {
  public state: Writable<ArduinoUnoBridgeState> = writable(initialState);

  private encoder = new TextEncoder();
  private devices = new Map<string, ArduinoUnoSerialDevice>();
  private writeChain: Promise<void> = Promise.resolve();

  constructor() {
    if (typeof window !== 'undefined') {
      nodeEngine.tickTime.subscribe(() => this.flushFromGraph());
      nodeEngine.graphState.subscribe(() => this.flushFromGraph());
      nodeEngine.isRunning.subscribe((running) => {
        if (!running) void this.resetActivePins();
      });
    }
  }

  async connect(): Promise<void> {
    const serial = (navigator as SerialNavigator | undefined)?.serial;
    if (!serial) {
      this.patchState({ status: 'unsupported', lastError: 'Web Serial is not supported in this browser.' });
      return;
    }

    this.patchState({ status: 'connecting', lastError: null });
    try {
      const port = await serial.requestPort();
      await port.open({ baudRate: 9600 });
      const writer = port.writable?.getWriter();
      if (!writer) throw new Error('Selected serial port is not writable.');

      const deviceId = this.createDeviceId();
      this.devices.set(deviceId, { id: deviceId, port, writer, active: new Map() });
      this.patchState({
        status: 'connected',
        lastError: null,
        lastCommand: null,
        activeNodes: 0,
        pendingCommands: 0,
        connectedDevices: this.devices.size,
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
    });
  }

  private isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
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

  private patchState(patch: Partial<ArduinoUnoBridgeState>): void {
    this.state.update((state) => ({ ...state, ...patch }));
  }
}

export const arduinoUnoSerialBridge = new ArduinoUnoSerialBridge();
export const arduinoUnoSerialBridgeState = arduinoUnoSerialBridge.state;
export const connectArduinoUno = (): Promise<void> => arduinoUnoSerialBridge.connect();
export const disconnectArduinoUno = (): Promise<void> => arduinoUnoSerialBridge.disconnect();
