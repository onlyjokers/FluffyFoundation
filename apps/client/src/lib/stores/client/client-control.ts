/**
 * Client-side control executor for Manager->Client Control and PluginControl messages.
 *
 * This module is deliberately "runtime-agnostic": it receives SDK/controllers via getters so
 * the store entrypoint can own lifecycle concerns (init/disconnect).
 */

import type {
  ClientSDK,
  FlashlightController,
  NodeExecutor,
  ScreenController,
  SensorManager,
  ToneModulatedSoundPlayer,
  ToneSoundPlayer,
  VibrationController,
} from '@shugu/sdk-client';
import type { MultimediaCore } from '@shugu/multimedia-core';
import type { GraphChange } from '@shugu/node-core';
import type {
  ControlAction,
  ControlBatchPayload,
  ControlMessage,
  ControlPayload,
  FlashlightPayload,
  ModulateSoundPayload,
  PlayMediaPayload,
  PlaySoundPayload,
  PluginControlMessage,
  ScreenColorPayload,
  ShowImagePayload,
  VibratePayload,
  VisualEffectsPayload,
  VisualScenesPayload,
} from '@shugu/protocol';
import { parseMediaClipParams } from './client-media';
import { handlePushImageUpload, type PushImageUploadPayload } from './client-screenshot';
import {
  normalizeVisualEffectsPayload,
  normalizeVisualScenesPayload,
  syncVisualScenesToLegacyStores,
  visualEffects,
  visualScenes,
} from './client-visual';
import { applyGraphChangesToExecutor } from './graph-change-consumer';

export type ClientControlDeps = {
  getSDK: () => ClientSDK | null;
  getSensorManager: () => SensorManager | null;
  getFlashlightController: () => FlashlightController | null;
  getScreenController: () => ScreenController | null;
  getVibrationController: () => VibrationController | null;
  getToneSoundPlayer: () => ToneSoundPlayer | null;
  getToneModulatedSoundPlayer: () => ToneModulatedSoundPlayer | null;
  getNodeExecutor: () => NodeExecutor | null;
  getMultimediaCore: () => MultimediaCore | null;
};

type AnyRecord = Record<string, unknown>;

const asRecord = (value: unknown): AnyRecord | null =>
  value && typeof value === 'object' ? (value as AnyRecord) : null;

type WindowE2E = Window & {
  __SHUGU_E2E?: boolean;
  __SHUGU_E2E_LAST_COMMAND?: unknown;
  __SHUGU_E2E_COMMANDS?: unknown[];
};

function isControlBatchPayload(payload: ControlPayload): payload is ControlBatchPayload {
  const record = asRecord(payload);
  if (!record) return false;
  if (record.kind !== 'control-batch') return false;
  return Array.isArray(record.items);
}

export function createClientControlHandlers(deps: ClientControlDeps): {
  handleControlMessage: (message: ControlMessage) => void;
  handlePluginControlMessage: (message: PluginControlMessage) => void;
  executeControl: (action: ControlAction, payload: ControlPayload, executeAt?: number) => void;
} {
  function executeControl(action: ControlAction, payload: ControlPayload, executeAt?: number): void {
    // Expand control batches early so we don't schedule the wrapper message (avoid double scheduling).
    if (action === 'custom' && isControlBatchPayload(payload)) {
      const batch = payload as ControlBatchPayload;
      const batchExecuteAt =
        typeof batch.executeAt === 'number' && Number.isFinite(batch.executeAt)
          ? batch.executeAt
          : executeAt;

      for (const raw of batch.items) {
        const itemRecord = asRecord(raw);
        if (!itemRecord) continue;
        const actionRaw = itemRecord.action;
        if (typeof actionRaw !== 'string') continue;
        const itemAction = actionRaw as ControlAction;
        const itemPayload = (asRecord(itemRecord.payload) ?? {}) as ControlPayload;
        const itemExecuteAtRaw = itemRecord.executeAt;
        const itemExecuteAt =
          typeof itemExecuteAtRaw === 'number' && Number.isFinite(itemExecuteAtRaw)
            ? itemExecuteAtRaw
            : batchExecuteAt;
        executeControl(itemAction, itemPayload, itemExecuteAt);
      }
      return;
    }

    const executeAction = (delaySeconds = 0) => {
      if (import.meta.env.DEV && typeof window !== 'undefined' && (window as WindowE2E).__SHUGU_E2E) {
        const entry = { at: Date.now(), action, payload, executeAt };
        const win = window as WindowE2E;
        win.__SHUGU_E2E_LAST_COMMAND = entry;
        const list = (win.__SHUGU_E2E_COMMANDS ??= []);
        list.push(entry);
        if (list.length > 200) list.splice(0, list.length - 200);
      }

      switch (action) {
        case 'flashlight':
          deps.getFlashlightController()?.setMode(payload as FlashlightPayload);
          break;

        case 'screenColor':
          deps.getScreenController()?.setColor(payload as ScreenColorPayload);
          break;

        case 'screenBrightness':
          {
            const brightness = (payload as { brightness: number }).brightness;
            deps.getScreenController()?.setBrightness(brightness);
          }
          break;

        case 'vibrate':
          deps.getVibrationController()?.vibrate(payload as VibratePayload);
          break;

        case 'modulateSound':
          deps.getToneModulatedSoundPlayer()?.play(payload as ModulateSoundPayload, delaySeconds);
          break;
        case 'modulateSoundUpdate':
          {
            const modPayload = payload as ModulateSoundPayload;
            const payloadRecord = asRecord(payload);
            const durationMs =
              typeof payloadRecord?.durationMs === 'number' ? payloadRecord.durationMs : modPayload.duration;
            deps.getToneModulatedSoundPlayer()?.update({
              frequency: modPayload.frequency,
              volume: modPayload.volume,
              waveform: modPayload.waveform,
              modFrequency: modPayload.modFrequency,
              modDepth: modPayload.modDepth,
              durationMs,
            });
          }
          break;

        case 'playSound':
          {
            const soundPayload = payload as PlaySoundPayload;
            const multimediaCore = deps.getMultimediaCore();
            const url =
              typeof soundPayload.url === 'string'
                ? (multimediaCore?.resolveAssetRef(soundPayload.url) ?? soundPayload.url)
                : soundPayload.url;
            // Always go through ToneSoundPlayer; it has an internal HTMLAudio fallback path.
            deps.getToneSoundPlayer()?.play({ ...soundPayload, url }, delaySeconds);
          }
          break;

        case 'playMedia': {
          const mediaPayload = payload as PlayMediaPayload;
          const multimediaCore = deps.getMultimediaCore();
          const clip =
            typeof mediaPayload.url === 'string' ? parseMediaClipParams(mediaPayload.url) : null;
          const baseUrl = clip ? clip.baseUrl : mediaPayload.url;
          const resolvedUrl =
            typeof baseUrl === 'string'
              ? (multimediaCore?.resolveAssetRef(baseUrl) ?? baseUrl)
              : baseUrl;
          // Check if it's a video by extension or explicit type
          const resolvedUrlString =
            typeof resolvedUrl === 'string' ? resolvedUrl : String(resolvedUrl ?? '');
          const isVideo =
            mediaPayload.mediaType === 'video' ||
            /\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(resolvedUrlString);

          if (isVideo) {
            const loop = clip?.loop ?? mediaPayload.loop ?? false;
            const playing = clip?.play ?? Boolean(resolvedUrlString);
            const startSec = clip ? Math.max(0, clip.startSec) : 0;
            const endSec = clip ? clip.endSec : -1;
            const cursorSec = clip?.cursorSec ?? -1;
            const reverse = clip?.reverse ?? false;
            const fit = clip?.fit ?? null;
            multimediaCore?.media.playVideo({
              url: resolvedUrlString,
              sourceNodeId: clip?.sourceNodeId ?? null,
              muted: mediaPayload.muted ?? true,
              loop,
              volume: mediaPayload.volume ?? 1,
              playing,
              startSec,
              endSec,
              cursorSec,
              reverse,
              ...(fit === null ? {} : { fit }),
            });
          } else {
            // Audio path: prefer ToneSoundPlayer when enabled; fallback to legacy SoundPlayer otherwise.
            const audioPayload: PlaySoundPayload = {
              url: resolvedUrl as PlaySoundPayload['url'],
              volume: mediaPayload.volume,
              loop: mediaPayload.loop,
              fadeIn: mediaPayload.fadeIn,
            };
            void deps
              .getToneSoundPlayer()
              ?.update(audioPayload, delaySeconds)
              .then((updated) => {
                if (updated) return;
                return deps.getToneSoundPlayer()?.play(audioPayload, delaySeconds);
              })
              .catch(() => undefined);
          }
          break;
        }

        case 'stopMedia':
          deps.getMultimediaCore()?.media.stopVideo();
          deps.getToneSoundPlayer()?.stop();
          break;

        case 'stopSound':
          deps.getToneSoundPlayer()?.stop();
          deps.getToneModulatedSoundPlayer()?.stop();
          break;

        case 'showImage': {
          const imagePayload = payload as ShowImagePayload;
          const multimediaCore = deps.getMultimediaCore();
          const clip =
            typeof imagePayload.url === 'string' ? parseMediaClipParams(imagePayload.url) : null;
          const baseUrl = clip ? clip.baseUrl : imagePayload.url;
          const url =
            typeof baseUrl === 'string'
              ? (multimediaCore?.resolveAssetRef(baseUrl) ?? baseUrl)
              : baseUrl;
          const fit = clip?.fit ?? null;
          const scale = clip?.scale ?? null;
          const offsetX = clip?.offsetX ?? null;
          const offsetY = clip?.offsetY ?? null;
          const opacity = clip?.opacity ?? null;
          multimediaCore?.media.showImage({
            url: String(url ?? ''),
            duration: imagePayload.duration,
            ...(fit === null ? {} : { fit }),
            ...(scale === null ? {} : { scale }),
            ...(offsetX === null ? {} : { offsetX }),
            ...(offsetY === null ? {} : { offsetY }),
            ...(opacity === null ? {} : { opacity }),
          });
          break;
        }

        case 'hideImage':
          deps.getMultimediaCore()?.media.hideImage();
          break;

        case 'visualScenes':
          {
            const scenes = normalizeVisualScenesPayload(payload as VisualScenesPayload);
            visualScenes.set(scenes);
            syncVisualScenesToLegacyStores(scenes);
          }
          break;

        case 'setDataReportingRate':
          {
            const ratePayload = payload as { sensorHz?: number };
            if (deps.getSensorManager() && ratePayload.sensorHz) {
              deps.getSensorManager()?.setThrottleMs(1000 / ratePayload.sensorHz);
            }
          }
          break;

        case 'setSensorState':
          {
            const sensorStatePayload = payload as { active: boolean };
            if (deps.getSensorManager()) {
              if (sensorStatePayload.active) {
                deps.getSensorManager()?.start();
              } else {
                deps.getSensorManager()?.stop();
              }
            }
          }
          break;

        case 'visualEffects':
          {
            const effects = normalizeVisualEffectsPayload(payload as VisualEffectsPayload);
            visualEffects.set(effects);
          }
          break;

        case 'custom':
          {
            const raw = payload as Partial<PushImageUploadPayload> | null;
            if (raw && typeof raw === 'object' && raw.kind === 'push-image-upload') {
              console.info('[Client] push-image-upload requested', {
                seq: typeof raw.seq === 'number' && Number.isFinite(raw.seq) ? raw.seq : null,
                speed:
                  typeof raw.speed === 'number' && Number.isFinite(raw.speed) ? raw.speed : null,
                format: typeof raw.format === 'string' ? raw.format : null,
                quality:
                  typeof raw.quality === 'number' && Number.isFinite(raw.quality)
                    ? raw.quality
                    : null,
                maxWidth:
                  typeof raw.maxWidth === 'number' && Number.isFinite(raw.maxWidth)
                    ? raw.maxWidth
                    : null,
              });
              void handlePushImageUpload(deps.getSDK(), raw as PushImageUploadPayload);
              break;
            }
            console.log('[Client] Unknown custom payload:', payload);
          }
          break;

        default:
          console.log('[Client] Unknown action:', action);
      }
    };

    const sdkNow = deps.getSDK();
    if (executeAt && sdkNow) {
      // Special efficient path for audio: use Web Audio scheduling
        const shouldUseAudioScheduling =
          action === 'modulateSound' ||
          action === 'playSound' ||
          (action === 'playMedia' &&
            (() => {
              const payloadRecord = asRecord(payload);
              const mediaType = typeof payloadRecord?.mediaType === 'string' ? payloadRecord.mediaType : null;
              if (mediaType === 'video') return false;
              const rawUrl = payloadRecord?.url;
              const url = typeof rawUrl === 'string' ? rawUrl : String(rawUrl ?? '');
              return !/\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(url);
            })());

      if (shouldUseAudioScheduling) {
        const delayMs = sdkNow.getDelayUntil(executeAt);
        const delaySeconds = Math.max(0, delayMs / 1000);

        // Execute immediately but pass the Future Delay to the audio engine
        // This bypasses setTimeout jitter
        executeAction(delaySeconds);
      } else {
        // Standard scheduling for visual effects (setTimeout is fine)
        const { cancel, delay } = sdkNow.scheduleAt(executeAt, () => executeAction(0));
        if (delay < 0) {
          // Already past: execute immediately and cancel the scheduled callback to avoid double execution.
          cancel();
          executeAction(0);
        }
      }
    } else {
      executeAction(0);
    }
  }

  function handleControlMessage(message: ControlMessage): void {
    // Calculate and log message size
    try {
      const messageJson = JSON.stringify(message);
      const messageSizeBytes = new Blob([messageJson]).size;
      const messageSizeKB = (messageSizeBytes / 1024).toFixed(2);

      console.log(
        `[Message] Received ${message.action} | Size: ${messageSizeBytes} bytes (${messageSizeKB} KB)`
      );
    } catch (err) {
      console.warn('[Message] Failed to calculate message size:', err);
    }

    executeControl(message.action, message.payload, message.executeAt);
  }

  function handlePluginControlMessage(message: PluginControlMessage): void {
    // Calculate and log message size
    try {
      const messageJson = JSON.stringify(message);
      const messageSizeBytes = new Blob([messageJson]).size;
      const messageSizeKB = (messageSizeBytes / 1024).toFixed(2);

      console.log(
        `[Plugin] ${message.pluginId} ${message.command} | Size: ${messageSizeBytes} bytes (${messageSizeKB} KB)`
      );
    } catch (err) {
      console.log('[Client] Plugin control:', message.pluginId, message.command);
    }

    if (message.pluginId === 'node-executor') {
      if (message.command === 'graph-changes') {
        const payloadRecord = asRecord(message.payload);
        const rawChanges = payloadRecord?.changes;
        const changes = Array.isArray(rawChanges) ? (rawChanges as GraphChange[]) : [];
        applyGraphChangesToExecutor(deps.getNodeExecutor(), changes);
        return;
      }
      deps.getNodeExecutor()?.handlePluginControl(message);
      return;
    }
    if (message.pluginId === 'multimedia-core' && message.command === 'configure') {
      const payloadRecord = asRecord(message.payload) ?? {};
      const manifestId = typeof payloadRecord.manifestId === 'string' ? payloadRecord.manifestId : '';
      const assets = Array.isArray(payloadRecord.assets) ? payloadRecord.assets.map(String) : [];
      const updatedAt =
        typeof payloadRecord.updatedAt === 'number' && Number.isFinite(payloadRecord.updatedAt)
          ? payloadRecord.updatedAt
          : undefined;
      if (!manifestId) return;
      deps.getMultimediaCore()?.setAssetManifest({ manifestId, assets, updatedAt });
      return;
    }
  }

  return { handleControlMessage, handlePluginControlMessage, executeControl };
}
