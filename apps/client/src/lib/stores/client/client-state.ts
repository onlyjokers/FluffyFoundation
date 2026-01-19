/**
 * Client store state primitives (SDK state + permissions + latency).
 */

import { writable, derived } from 'svelte/store';
import type { ClientState } from '@shugu/sdk-client';

// Core state store
export const state = writable<ClientState>({
  status: 'disconnected',
  clientId: null,
  timeSync: {
    offset: 0,
    samples: [],
    maxSamples: 10,
    initialized: false,
    lastSyncTime: 0,
  },
  visibleClients: [],
  error: null,
});

// Permission states
export const permissions = writable<{
  microphone: 'pending' | 'granted' | 'denied';
  motion: 'pending' | 'granted' | 'denied';
  camera: 'pending' | 'granted' | 'denied';
  wakeLock: 'pending' | 'granted' | 'denied';
  geolocation: 'pending' | 'granted' | 'denied' | 'unavailable' | 'unsupported';
}>({
  microphone: 'pending',
  motion: 'pending',
  camera: 'pending',
  wakeLock: 'pending',
  geolocation: 'pending',
});

// Latency in ms (smooth average)
export const latency = writable<number>(0);

// Derived stores
export const connectionStatus = derived(state, ($state) => $state.status);
export const clientId = derived(state, ($state) => $state.clientId);
