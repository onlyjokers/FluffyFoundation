/**
 * Purpose: Shared types and small helpers for client control message handling.
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
import type { Writable } from 'svelte/store';
import type { ClientTextOverlayState } from '../client-text-overlay';

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
  textOverlay?: Writable<ClientTextOverlayState>;
  stopAllCleanup?: () => void;
};

export type AnyRecord = Record<string, unknown>;

export type WindowE2E = Window & {
  __SHUGU_E2E?: boolean;
  __SHUGU_E2E_LAST_COMMAND?: unknown;
  __SHUGU_E2E_COMMANDS?: unknown[];
  __SHUGU_E2E_LAST_MANIFEST?: unknown;
  __SHUGU_E2E_MANIFESTS?: unknown[];
};

export const asRecord = (value: unknown): AnyRecord | null =>
  value && typeof value === 'object' ? (value as AnyRecord) : null;
