/**
 * Purpose: Execute display control actions against MultimediaCore and display side effects.
 */
import type { Writable } from 'svelte/store';
import type { MultimediaCore } from '@shugu/multimedia-core';
import type {
  ControlAction,
  ControlPayload,
  FctTrackAudioSource,
  FctTrackPalette,
  FctTrackVariant,
  PlayMediaPayload,
  ScreenColorPayload,
  ShowImagePayload,
  ShowTextPayload,
  VisualSceneLayerItem,
  VisualScenesPayload,
} from '@shugu/protocol';
import {
  FCT_TRACK_AUDIO_SOURCES,
  FCT_TRACK_PALETTES,
  FCT_TRACK_VARIANTS,
} from '@shugu/protocol';
import type { NodeExecutor } from '@shugu/sdk-client';
import { stopAllDisplaySideEffects } from '../display-stop-all';
import {
  createDisplayScreenOverlayState,
  type ScreenOverlayState,
} from '../display-screen-overlay';
import {
  createClearedDisplayTextOverlayState,
  createDisplayTextOverlayState,
  type TextOverlayState,
} from '../display-text-overlay';
import {
  clearActiveImageObjectUrl,
  isDataImageUrl,
  normalizeImageUrlForDisplay,
} from './image-object-url';
import {
  parseDisplayFileId,
  resolveDisplayFileUrl,
  warnMissingDisplayLocalMedia,
} from './local-media';
import { parseMediaClipParams } from './media-clip';

export type DisplayControlExecutorDeps = {
  getMultimediaCore: () => MultimediaCore | null;
  getNodeExecutor: () => NodeExecutor | null;
  screenOverlay: Writable<ScreenOverlayState>;
  textOverlay: Writable<TextOverlayState>;
  visualScenes: Writable<VisualSceneLayerItem[]>;
  isDev: boolean;
};

function normalizeVisualScenes(payload: ControlPayload): VisualSceneLayerItem[] {
  const record = payload && typeof payload === 'object' ? (payload as VisualScenesPayload) : null;
  const raw = Array.isArray(record?.scenes) ? record.scenes.slice(0, 12) : [];
  const out: VisualSceneLayerItem[] = [];

  const showBackground = (value: unknown, fallback: boolean): boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value >= 0.5;
    return fallback;
  };

  const audioSource = (value: unknown): FctTrackAudioSource =>
    typeof value === 'string' && FCT_TRACK_AUDIO_SOURCES.includes(value as FctTrackAudioSource)
      ? (value as FctTrackAudioSource)
      : 'microphone';
  const variant = (value: unknown): FctTrackVariant =>
    typeof value === 'string' && FCT_TRACK_VARIANTS.includes(value as FctTrackVariant)
      ? (value as FctTrackVariant)
      : 'shattered-reality';
  const palette = (value: unknown): FctTrackPalette =>
    typeof value === 'string' && FCT_TRACK_PALETTES.includes(value as FctTrackPalette)
      ? (value as FctTrackPalette)
      : 'red-black';
  const numberParam = (value: unknown, fallback: number): number => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(2, n)) : fallback;
  };
  const cssColor = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;

  for (const item of raw) {
    const itemRecord = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
    if (!itemRecord) continue;
    if (itemRecord.type === 'box') {
      out.push({
        type: 'box',
        color: cssColor(itemRecord.color),
        showBackground: showBackground(itemRecord.showBackground, true),
      });
      continue;
    }
    if (itemRecord.type === 'mel') {
      out.push({ type: 'mel', showBackground: showBackground(itemRecord.showBackground, false) });
      continue;
    }
    if (itemRecord.type === 'frontCamera') {
      out.push({ type: 'frontCamera' });
      continue;
    }
    if (itemRecord.type === 'backCamera') {
      out.push({ type: 'backCamera' });
      continue;
    }
    if (itemRecord.type === 'fctTrack') {
      out.push({
        type: 'fctTrack',
        variant: variant(itemRecord.variant),
        palette: palette(itemRecord.palette),
        sensitivity: numberParam(itemRecord.sensitivity, 1),
        brightness: numberParam(itemRecord.brightness, 1),
        contrast: numberParam(itemRecord.contrast, 1),
        blend: itemRecord.blend === 'over' ? 'over' : 'replace',
        audioSource: audioSource(itemRecord.audioSource),
        showBackground: showBackground(itemRecord.showBackground, true),
      });
    }
  }

  const lastCameraIndex = (() => {
    for (let i = out.length - 1; i >= 0; i -= 1) {
      const t = out[i]!.type;
      if (t === 'frontCamera' || t === 'backCamera') return i;
    }
    return -1;
  })();
  if (lastCameraIndex < 0) return out;
  const keep = out[lastCameraIndex]!.type;
  return out.filter((scene) =>
    scene.type === 'frontCamera' || scene.type === 'backCamera' ? scene.type === keep : true
  );
}

export function createDisplayControlExecutor(deps: DisplayControlExecutorDeps): {
  executeControl: (action: ControlAction, payload: ControlPayload, executeAtLocal?: number) => void;
} {
  let lastControlLogAt = 0;
  let textClearHandle: ReturnType<typeof setTimeout> | null = null;

  const setScreenColor = (payload: ScreenColorPayload): void => {
    deps.screenOverlay.set(createDisplayScreenOverlayState(payload));
  };

  const clearText = (): void => {
    if (textClearHandle) {
      clearTimeout(textClearHandle);
      textClearHandle = null;
    }
    deps.textOverlay.set(createClearedDisplayTextOverlayState());
  };

  const executeNow = (action: ControlAction, payload: ControlPayload): void => {
    switch (action) {
      case 'showImage': {
        const imagePayload = payload as ShowImagePayload;
        const clip = typeof imagePayload.url === 'string' ? parseMediaClipParams(imagePayload.url) : null;
        const baseUrl = clip ? clip.baseUrl : String(imagePayload.url ?? '');
        const resolvedDisplayUrl = resolveDisplayFileUrl(baseUrl);
        if (parseDisplayFileId(baseUrl) && !resolvedDisplayUrl) {
          warnMissingDisplayLocalMedia(baseUrl);
          return;
        }
        const fit = clip?.fit ?? null;
        const url = normalizeImageUrlForDisplay(resolvedDisplayUrl ?? baseUrl);
        if (deps.isDev) {
          const now = Date.now();
          if (now - lastControlLogAt >= 500) {
            lastControlLogAt = now;
            console.info('[Display] showImage', {
              dataUrl: isDataImageUrl(baseUrl),
              urlChars: baseUrl.length,
              fit,
            });
          }
        }
        deps.getMultimediaCore()?.media.showImage({
          url,
          duration: imagePayload.duration,
          ...(fit === null ? {} : { fit }),
        });
        return;
      }

      case 'hideImage':
        clearActiveImageObjectUrl();
        if (deps.isDev) {
          const now = Date.now();
          if (now - lastControlLogAt >= 500) {
            lastControlLogAt = now;
            console.info('[Display] hideImage');
          }
        }
        deps.getMultimediaCore()?.media.hideImage();
        return;

      case 'playMedia': {
        const mediaPayload = payload as PlayMediaPayload;
        const clip = typeof mediaPayload.url === 'string' ? parseMediaClipParams(mediaPayload.url) : null;
        const baseUrl = clip ? clip.baseUrl : mediaPayload.url;
        const url = typeof baseUrl === 'string' ? baseUrl : String(baseUrl ?? '');
        const resolvedDisplayUrl = resolveDisplayFileUrl(url);
        if (parseDisplayFileId(url) && !resolvedDisplayUrl) {
          warnMissingDisplayLocalMedia(url);
          return;
        }

        const resolvedUrlString = resolvedDisplayUrl ?? url;
        const isVideo =
          mediaPayload.mediaType === 'video' ||
          Boolean(parseDisplayFileId(url)) ||
          /\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(resolvedUrlString);

        if (!isVideo) {
          deps.getMultimediaCore()?.media.playAudio({
            url: resolvedUrlString,
            loop: mediaPayload.loop ?? false,
            volume: mediaPayload.volume ?? 1,
            playing: true,
          });
          return;
        }

        deps.getMultimediaCore()?.media.playVideo({
          url: resolvedUrlString,
          sourceNodeId: clip?.sourceNodeId ?? null,
          muted: mediaPayload.muted ?? true,
          loop: clip?.loop ?? mediaPayload.loop ?? false,
          volume: mediaPayload.volume ?? 1,
          playing: clip?.play ?? Boolean(resolvedUrlString),
          startSec: clip ? Math.max(0, clip.startSec) : 0,
          endSec: clip ? clip.endSec : -1,
          cursorSec: clip?.cursorSec ?? -1,
          reverse: clip?.reverse ?? false,
          ...(clip?.fit === null || clip?.fit === undefined ? {} : { fit: clip.fit }),
        });
        return;
      }

      case 'stopMedia':
        deps.getMultimediaCore()?.media.stopAllMedia();
        return;

      case 'screenColor':
        setScreenColor(payload as ScreenColorPayload);
        return;

      case 'showText':
        if (textClearHandle) {
          clearTimeout(textClearHandle);
          textClearHandle = null;
        }
        {
          const state = createDisplayTextOverlayState(payload as ShowTextPayload);
          deps.textOverlay.set(state);
          if (state.visible && typeof state.duration === 'number') {
            textClearHandle = setTimeout(clearText, state.duration);
          }
        }
        return;

      case 'hideText':
        clearText();
        return;

      case 'visualScenes':
        deps.visualScenes.set(normalizeVisualScenes(payload));
        return;

      case 'shutdown': {
        const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
        if (record?.reason !== 'root-stop-all' && record?.kind !== 'stop-all') return;
        stopAllDisplaySideEffects({
          multimediaCore: deps.getMultimediaCore(),
          nodeExecutor: deps.getNodeExecutor(),
          screenOverlay: deps.screenOverlay,
          setScreenColor,
          clearActiveImageObjectUrl,
        });
        clearText();
        deps.visualScenes.set([]);
        return;
      }

      default:
        console.info('[Display] noop action:', action, payload);
    }
  };

  return {
    executeControl: (action, payload, executeAtLocal) => {
      if (typeof executeAtLocal === 'number' && Number.isFinite(executeAtLocal)) {
        const delay = executeAtLocal - Date.now();
        if (delay > 0) {
          setTimeout(() => executeNow(action, payload), delay);
          return;
        }
      }

      executeNow(action, payload);
    },
  };
}
