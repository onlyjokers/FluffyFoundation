/**
 * Client store runtime wiring (SDK lifecycle, controller instances, permissions flow).
 *
 * Public exports from this module are re-exported by `src/lib/stores/client.ts`.
 */

import { get } from 'svelte/store';
import {
  ClientSDK,
  SensorManager,
  FlashlightController,
  ScreenController,
  VibrationController,
  ToneSoundPlayer,
  ToneModulatedSoundPlayer,
  WakeLockController,
  NodeExecutor,
  type NodeCommand,
  type ClientSDKConfig,
} from '@shugu/sdk-client';
import {
  MultimediaCore,
  toneAudioEngine,
  type MediaEngineState,
} from '@shugu/multimedia-core';
import { permissions, state, latency } from './client-state';
import { audioStream, imageState, videoState } from './client-media';
import { createClientControlHandlers } from './client-control';
import {
  enableToneAudio,
  getLastToneReadyPayload,
  reportToneReady,
  type ToneReadyPayload,
} from './client-tone';
import { getOrCreateClientIdentity, persistAssignedClientId } from './client-identity';

// SDK and controller instances
let sdk: ClientSDK | null = null;
let sensorManager: SensorManager | null = null;
let flashlightController: FlashlightController | null = null;
let screenController: ScreenController | null = null;
let vibrationController: VibrationController | null = null;
let toneSoundPlayer: ToneSoundPlayer | null = null;
let toneModulatedSoundPlayer: ToneModulatedSoundPlayer | null = null;
let wakeLockController: WakeLockController | null = null;
let nodeExecutor: NodeExecutor | null = null;
let multimediaCore: MultimediaCore | null = null;
let mediaUnsub: (() => void) | null = null;

const ASSET_READ_TOKEN_STORAGE_KEY = 'shugu-asset-read-token';

const controlHandlers = createClientControlHandlers({
  getSDK: () => sdk,
  getSensorManager: () => sensorManager,
  getFlashlightController: () => flashlightController,
  getScreenController: () => screenController,
  getVibrationController: () => vibrationController,
  getToneSoundPlayer: () => toneSoundPlayer,
  getToneModulatedSoundPlayer: () => toneModulatedSoundPlayer,
  getNodeExecutor: () => nodeExecutor,
  getMultimediaCore: () => multimediaCore,
});

/**
 * Start asset preloading early, before the user clicks Enter.
 * This initializes MultimediaCore independently of the full SDK initialization.
 * Call this from onMount in +page.svelte.
 */
export function startEarlyPreload(serverUrl: string): void {
  if (multimediaCore) return; // Already initialized

  const assetReadToken =
    typeof window !== 'undefined'
      ? window.localStorage.getItem(ASSET_READ_TOKEN_STORAGE_KEY)
      : null;

  multimediaCore = new MultimediaCore({
    serverUrl,
    assetReadToken,
    autoStart: true,
    concurrency: 10,
  });

  console.log('[Client] Early preload started');
}

/**
 * Get the MultimediaCore instance (for external access).
 */
export function getMultimediaCore(): MultimediaCore | null {
  return multimediaCore;
}

/**
 * Initialize and connect to server
 */
export function initialize(config: ClientSDKConfig, options?: { autoConnect?: boolean }): void {
  const identity = getOrCreateClientIdentity();

  // Initialize SDK
  sdk = new ClientSDK({
    ...config,
    identity: config.identity ?? identity ?? undefined,
  });

  // Subscribe to state changes
  sdk.onStateChange((newState) => {
    state.set(newState);
    if (newState.clientId) {
      persistAssignedClientId(newState.clientId);
    }

    // Ensure readiness is reported after the socket becomes ready (covers the case where
    // MultimediaCore finishes preload before clientId is assigned).
    if (newState.status === 'connected' && newState.clientId) {
      const snapshot = multimediaCore?.getState?.();
      try {
        const tonePayload =
          getLastToneReadyPayload() ??
          ({
            kind: 'tone',
            event: 'ready',
            enabled: toneAudioEngine.isEnabled(),
            updatedAt: Date.now(),
          } satisfies ToneReadyPayload);
        reportToneReady(sdk, tonePayload);

        if (!snapshot) return;
        const preloadPayload: Record<string, unknown> = {
          kind: 'multimedia-core',
          event: 'asset-preload',
          status: snapshot.status,
          manifestId: snapshot.manifestId,
          loaded: snapshot.loaded,
          total: snapshot.total,
          error: snapshot.error,
        };
        sdk?.sendSensorData('custom', preloadPayload, { trackLatest: false });
      } catch {
        // ignore
      }
    }
  });

  // Subscribe to control messages
  sdk.onControl(controlHandlers.handleControlMessage);
  sdk.onPluginControl(controlHandlers.handlePluginControlMessage);

  // MultimediaCore: asset resolver + preload/cache + readiness reporting (no UI).
  // Reuse existing instance if startEarlyPreload was called.
  if (!multimediaCore) {
    const assetReadToken =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(ASSET_READ_TOKEN_STORAGE_KEY)
        : null;
    multimediaCore = new MultimediaCore({
      serverUrl: config.serverUrl,
      assetReadToken,
      autoStart: true,
      concurrency: 10,
    });
  }

  mediaUnsub?.();
  mediaUnsub = multimediaCore.media.subscribeState((s: MediaEngineState) => {
    videoState.set(s.video);
    imageState.set(s.image);
  });
  let lastReported = '';
  multimediaCore.subscribeState((s) => {
    const status =
      s.status === 'ready'
        ? 'ready'
        : s.status === 'error'
          ? 'error'
          : s.status === 'loading'
            ? 'loading'
            : 'idle';
    const payload: Record<string, unknown> = {
      kind: 'multimedia-core',
      event: 'asset-preload',
      status,
      manifestId: s.manifestId,
      loaded: s.loaded,
      total: s.total,
      error: s.error,
    };
    const signature = JSON.stringify(payload);
    try {
      const connected =
        Boolean(sdk?.getState?.().clientId) && sdk?.getState?.().status === 'connected';
      // Don't "consume" the state signature until we are actually able to send it.
      if (!connected) return;

      if (signature === lastReported) return;
      sdk?.sendSensorData('custom', payload, { trackLatest: false });
      lastReported = signature;
    } catch {
      // ignore
    }
  });

  // Initialize controllers
  flashlightController = new FlashlightController();
  screenController = new ScreenController();
  vibrationController = new VibrationController();
  toneSoundPlayer = new ToneSoundPlayer();
  toneModulatedSoundPlayer = new ToneModulatedSoundPlayer();
  wakeLockController = new WakeLockController();
  sensorManager = new SensorManager({ throttleMs: 100 });
  nodeExecutor = new NodeExecutor(
    sdk,
    (cmd: NodeCommand) => controlHandlers.executeControl(cmd.action, cmd.payload, cmd.executeAt),
    {
      canRunCapability: (capability) => {
        const p = get(permissions);
        if (capability === 'flashlight') return p.camera === 'granted';
        if (capability === 'sensors') return p.motion === 'granted' || p.microphone === 'granted';
        if (capability === 'sound') {
          const win =
            typeof window !== 'undefined'
              ? (window as Window & { webkitAudioContext?: typeof AudioContext })
              : null;
          const hasAudioContext = Boolean(win?.AudioContext || win?.webkitAudioContext);
          return hasAudioContext;
        }
        return true;
      },
      resolveAssetRef: (ref: string) => multimediaCore?.resolveAssetRef(ref) ?? ref,
      prioritizeFetch: (url: string) => multimediaCore?.prioritizeFetch(url) ?? fetch(url),
    }
  );

  if (options?.autoConnect !== false) {
    sdk.connect();
  }
}

export function connectToServer(): void {
  sdk?.connect();
}

/**
 * Disconnect socket only (keep SDK + controllers alive).
 * Useful for treating "background/lock screen" as offline without losing app state.
 */
export function disconnectFromServer(): void {
  sdk?.disconnect();
}

/**
 * Request all permissions
 */
export async function requestPermissions(): Promise<void> {
  // Kick off permission prompts synchronously (before the first await) so iOS can show them.
  // Some browser APIs require being triggered within the same user gesture stack.
  const motionPermissionPromise = sensorManager
    ? sensorManager.requestPermissions()
    : Promise.resolve({ granted: false, error: 'Sensor manager not initialized' });

  let microphonePromise: Promise<MediaStream>;
  if (navigator.mediaDevices?.getUserMedia) {
    microphonePromise = navigator.mediaDevices.getUserMedia({ audio: true });
  } else {
    microphonePromise = Promise.reject(new Error('mediaDevices.getUserMedia is not supported'));
  }

  const soundInitPromise = enableAudio().catch((error) => {
    console.warn('[Permissions] Tone audio enable failed:', error);
    return null;
  });

  const [motionResult, microphoneResult] = await Promise.allSettled([
    motionPermissionPromise,
    microphonePromise,
  ]);

  // Handle motion sensors
  if (motionResult.status === 'fulfilled') {
    permissions.update((p) => ({
      ...p,
      motion: motionResult.value.granted ? 'granted' : 'denied',
    }));
    if (motionResult.value.granted && sensorManager) {
      sensorManager.start();
      setupSensorReporting();
    } else if (!motionResult.value.granted) {
      console.warn('[Permissions] Motion/orientation denied:', motionResult.value.error);
    }
  } else {
    console.warn(
      '[Permissions] Motion/orientation permission request failed:',
      motionResult.reason
    );
    permissions.update((p) => ({ ...p, motion: 'denied' }));
  }

  // Handle microphone
  if (microphoneResult.status === 'fulfilled') {
    audioStream.set(microphoneResult.value);
    permissions.update((p) => ({ ...p, microphone: 'granted' }));
  } else {
    console.warn('[Permissions] Microphone denied:', microphoneResult.reason);
    permissions.update((p) => ({ ...p, microphone: 'denied' }));
  }

  await soundInitPromise;

  // Request wake lock
  if (wakeLockController) {
    const success = await wakeLockController.request();
    permissions.update((p) => ({ ...p, wakeLock: success ? 'granted' : 'denied' }));
  }

  // Initialize flashlight (camera)
  if (flashlightController) {
    const success = await flashlightController.init();
    permissions.update((p) => ({ ...p, camera: success ? 'granted' : 'denied' }));
  }
}

/**
 * Enable Tone.js audio (must be called from a user gesture).
 */
export async function enableAudio(): Promise<{ enabled: boolean; error?: string } | null> {
  return enableToneAudio(sdk);
}

/**
 * Set up sensor data reporting to server
 */
function setupSensorReporting(): void {
  if (!sensorManager) return;

  sensorManager.onOrientation((data) => {
    sdk?.sendSensorData('orientation', data);
  });

  sensorManager.onGyro((data) => {
    sdk?.sendSensorData('gyro', data);
  });

  sensorManager.onAccel((data) => {
    sdk?.sendSensorData('accel', data);
  });
}

/**
 * Disconnect and cleanup
 */
export function disconnect(): void {
  sdk?.disconnect();
  sdk = null;
  // geolocation is handled by the start gate (page); keep permission state as-is.

  nodeExecutor?.destroy();
  nodeExecutor = null;

  mediaUnsub?.();
  mediaUnsub = null;

  sensorManager?.stop();
  sensorManager = null;

  flashlightController?.destroy();
  flashlightController = null;

  screenController?.destroy();
  screenController = null;

  toneSoundPlayer?.stop();
  toneSoundPlayer = null;

  toneModulatedSoundPlayer?.stop();
  toneModulatedSoundPlayer = null;

  multimediaCore?.destroy();
  multimediaCore = null;

  wakeLockController?.release();
  wakeLockController = null;

  // Stop audio stream
  const stream = get(audioStream);
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    audioStream.set(null);
  }
}

/**
 * Get SDK for plugin access
 */
export function getSDK(): ClientSDK | null {
  return sdk;
}

/**
 * Measure round-trip latency
 */
export async function measureLatency(): Promise<number> {
  if (!sdk) return 0;

  try {
    const rtt = await sdk.ping();
    latency.set(rtt);
    return rtt;
  } catch (e) {
    console.warn('[Client] Latency check failed:', e);
    return 0;
  }
}
