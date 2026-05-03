/**
 * Purpose: Register Socket.IO listeners for ClientSDK without growing the SDK class body.
 */
import {
  SOCKET_EVENTS,
  createTimePing,
  processTimePong,
  updateTimeSyncState,
  type Message,
  type TimePongData,
} from '@shugu/protocol';
import type { Socket } from 'socket.io-client';

export function registerClientSocketListeners(input: {
  socket: Socket;
  autoReconnect: boolean;
  updateState: (partial: Record<string, unknown>) => void;
  startTimeSync: () => void;
  stopTimeSync: () => void;
  getTimeSync: () => import('@shugu/protocol').TimeSyncState;
  setTimeSync: (state: import('@shugu/protocol').TimeSyncState) => void;
  handleMessage: (message: Message) => void;
}): void {
  input.socket.on('connect', () => {
    console.log('[SDK Client] Connected');
    input.updateState({ status: 'connected', error: null });
    input.startTimeSync();
  });

  input.socket.on('disconnect', (reason) => {
    console.log('[SDK Client] Disconnected:', reason);
    input.stopTimeSync();

    if (input.autoReconnect && reason !== 'io client disconnect') {
      input.updateState({ status: 'reconnecting', clientId: null });
      if (reason === 'io server disconnect') input.socket.connect();
      return;
    }

    input.updateState({ status: 'disconnected', clientId: null });
  });

  input.socket.on('connect_error', (error) => {
    console.error('[SDK Client] Connection error:', error.message);
    input.updateState({ status: 'error', error: error.message });
  });

  input.socket.io.on('reconnect_attempt', () => {
    input.updateState({ status: 'reconnecting' });
  });

  input.socket.io.on('reconnect', () => {
    console.log('[SDK Client] Reconnected');
    input.updateState({ status: 'connected', error: null });
  });

  input.socket.on(SOCKET_EVENTS.MSG, (message: Message) => {
    input.handleMessage(message);
  });

  input.socket.on(SOCKET_EVENTS.TIME_PONG, (data: TimePongData) => {
    input.setTimeSync(updateTimeSyncState(input.getTimeSync(), processTimePong(data)));
  });
}

export function emitTimePing(socket: Socket | null): void {
  if (!socket?.connected) return;
  socket.emit(SOCKET_EVENTS.TIME_PING, createTimePing());
}
