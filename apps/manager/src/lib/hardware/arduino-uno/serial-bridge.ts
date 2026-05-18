/**
 * Purpose: Manager-local Web Serial bridge that writes semantic Arduino UNO node state to hardware.
 */
import { get, writable, type Writable } from 'svelte/store';

import { nodeEngine } from '$lib/nodes/engine';
import {
  collectArduinoUnoPayloads,
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
};

const initialState: ArduinoUnoBridgeState = {
  status: typeof navigator !== 'undefined' && 'serial' in navigator ? 'disconnected' : 'unsupported',
  lastError: null,
  lastCommand: null,
  activeNodes: 0,
  pendingCommands: 0,
};

class ArduinoUnoSerialBridge {
  public state: Writable<ArduinoUnoBridgeState> = writable(initialState);

  private port: SerialPortLike | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private encoder = new TextEncoder();
  private active = new Map<string, ArduinoUnoBridgeActive>();
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

      this.port = port;
      this.writer = writer;
      this.active.clear();
      this.patchState({ status: 'connected', lastError: null, lastCommand: null, activeNodes: 0, pendingCommands: 0 });
      this.flushFromGraph();
    } catch (error) {
      await this.closePort();
      this.patchState({
        status: 'error',
        lastError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async disconnect(): Promise<void> {
    await this.resetActivePins();
    await this.closePort();
    this.patchState({ status: this.isSupported() ? 'disconnected' : 'unsupported', pendingCommands: 0 });
  }

  private isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  private flushFromGraph(): void {
    if (!this.writer || get(this.state).status !== 'connected') return;

    const { payloads, errors } = collectArduinoUnoPayloads({
      graph: get(nodeEngine.graphState),
      getComputedInputs: (nodeId) => nodeEngine.getLastComputedInputs(nodeId),
    });
    const plan = diffArduinoUnoBridgeCommands(this.active, payloads);
    this.active = plan.nextActive;

    if (errors.length > 0) {
      this.patchState({ lastError: errors.map((error) => `${error.nodeId}: ${error.message}`).join('; ') });
    } else {
      this.patchState({ lastError: null });
    }

    if (plan.commands.length > 0) this.enqueueCommands(plan.commands);
    this.patchState({ activeNodes: this.active.size });
  }

  private enqueueCommands(commands: ArduinoUnoBridgeCommand[]): void {
    this.patchState({ pendingCommands: get(this.state).pendingCommands + commands.length });
    this.writeChain = this.writeChain.then(async () => {
      for (const entry of commands) {
        await this.writeCommand(entry.command);
      }
    });
    this.writeChain.catch((error) => {
      this.patchState({
        status: 'error',
        lastError: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private async writeCommand(command: string): Promise<void> {
    if (!this.writer) return;
    await this.writer.write(this.encoder.encode(command));
    this.patchState({
      lastCommand: command.trim(),
      pendingCommands: Math.max(0, get(this.state).pendingCommands - 1),
    });
  }

  private async resetActivePins(): Promise<void> {
    if (!this.writer || this.active.size === 0) {
      this.active.clear();
      this.patchState({ activeNodes: 0 });
      return;
    }
    const plan = diffArduinoUnoBridgeCommands(this.active, []);
    this.active.clear();
    this.enqueueCommands(plan.commands);
    await this.writeChain;
    this.patchState({ activeNodes: 0 });
  }

  private async closePort(): Promise<void> {
    const writer = this.writer;
    const port = this.port;
    this.writer = null;
    this.port = null;

    try {
      writer?.releaseLock();
    } catch {
      // Ignore cleanup failures; the following connect attempt will request a fresh port.
    }

    if (port) {
      try {
        await port.close();
      } catch (error) {
        this.patchState({ lastError: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  private patchState(patch: Partial<ArduinoUnoBridgeState>): void {
    this.state.update((state) => ({ ...state, ...patch }));
  }
}

export const arduinoUnoSerialBridge = new ArduinoUnoSerialBridge();
export const arduinoUnoSerialBridgeState = arduinoUnoSerialBridge.state;
export const connectArduinoUno = (): Promise<void> => arduinoUnoSerialBridge.connect();
export const disconnectArduinoUno = (): Promise<void> => arduinoUnoSerialBridge.disconnect();
