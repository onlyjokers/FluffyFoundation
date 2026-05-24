/**
 * Purpose: Regression coverage for Arduino UNO serial bridge auto-connect persistence.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { get } from 'svelte/store';

import { ArduinoUnoSerialBridge, type SerialPortLike } from './serial-bridge';

function createMemoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    value: (key: string) => values.get(key) ?? null,
  };
}

function createWritablePort(): SerialPortLike {
  let opened = false;
  return {
    async open() {
      opened = true;
    },
    async close() {
      opened = false;
    },
    get writable() {
      return opened ? new WritableStream<Uint8Array>() : null;
    },
  };
}

test('autoConnectAuthorizedPorts opens previously authorized serial ports and records unavailable saved devices', async () => {
  const storage = createMemoryStorage({
    'shugu-arduino-auto-connect-current-v1': '1',
    'shugu-arduino-connected-count-v1': '2',
  });
  const bridge = new ArduinoUnoSerialBridge({
    serial: {
      requestPort: async () => {
        throw new Error('requestPort should not be used for auto-connect');
      },
      getPorts: async () => [createWritablePort()],
    },
    storage,
    autoStart: false,
    subscribeRuntime: false,
  });

  await bridge.autoConnectAuthorizedPorts();

  const state = get(bridge.state);
  assert.equal(state.status, 'connected');
  assert.equal(state.connectedDevices, 1);
  assert.equal(state.autoConnectCurrentArduino, true);
  assert.equal(state.unavailableAutoConnectDevices, 1);
});

test('setAutoConnectCurrentArduino persists the current connected device count', async () => {
  const storage = createMemoryStorage();
  const bridge = new ArduinoUnoSerialBridge({
    serial: {
      requestPort: async () => createWritablePort(),
      getPorts: async () => [],
    },
    storage,
    autoStart: false,
    subscribeRuntime: false,
  });

  await bridge.connect();
  bridge.setAutoConnectCurrentArduino(true);

  assert.equal(storage.value('shugu-arduino-auto-connect-current-v1'), '1');
  assert.equal(storage.value('shugu-arduino-connected-count-v1'), '1');
  assert.equal(get(bridge.state).autoConnectCurrentArduino, true);
});
