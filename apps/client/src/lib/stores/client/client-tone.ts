/**
 * Client Tone.js audio enablement + readiness reporting.
 *
 * Note: Tone.js enablement must be triggered by a user gesture.
 */

import { writable } from 'svelte/store';
import type { ClientSDK } from '@shugu/sdk-client';
import { toneAudioEngine } from '@shugu/multimedia-core';

const AUDIO_ENABLED_STORAGE_KEY = 'shugu-audio-enabled';
const storedAudioEnabled =
  typeof window !== 'undefined' &&
  window.localStorage.getItem(AUDIO_ENABLED_STORAGE_KEY) === 'true';

// Tone.js audio enablement state (requires user gesture to flip to true).
export const audioEnabled = writable<boolean>(storedAudioEnabled);

export type ToneReadyPayload = {
  kind: 'tone';
  event: 'ready';
  enabled: boolean;
  error?: string;
  updatedAt: number;
};

// Latest Tone readiness snapshot (used for reconnect + manager-side "Tone Ready gate").
let lastToneReadyPayload: ToneReadyPayload | null = null;

export function getLastToneReadyPayload(): ToneReadyPayload | null {
  return lastToneReadyPayload;
}

export function reportToneReady(sdk: ClientSDK | null, payload: ToneReadyPayload): void {
  lastToneReadyPayload = payload;

  try {
    const sdkNow = sdk;
    const connected =
      Boolean(sdkNow?.getState?.().clientId) && sdkNow?.getState?.().status === 'connected';
    if (!connected) return;
    const sensorPayload: Record<string, unknown> = payload;
    sdkNow?.sendSensorData('custom', sensorPayload, { trackLatest: false });
  } catch {
    // ignore
  }
}

function persistAudioEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AUDIO_ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');
}

export async function enableToneAudio(
  sdk: ClientSDK | null
): Promise<{ enabled: boolean; error?: string } | null> {
  try {
    const result = await toneAudioEngine.start();
    audioEnabled.set(result.enabled);
    persistAudioEnabled(result.enabled);
    reportToneReady(sdk, {
      kind: 'tone',
      event: 'ready',
      enabled: result.enabled,
      ...(result.error ? { error: result.error } : {}),
      updatedAt: Date.now(),
    });
    return result;
  } catch (err) {
    audioEnabled.set(false);
    persistAudioEnabled(false);
    reportToneReady(sdk, {
      kind: 'tone',
      event: 'ready',
      enabled: false,
      error: err instanceof Error ? err.message : String(err),
      updatedAt: Date.now(),
    });
    return { enabled: false, error: err instanceof Error ? err.message : String(err) };
  }
}
