/**
 * Purpose: FF-16 Display stop-all cleanup adapter for media, overlay, and node execution.
 */

import type { Writable } from 'svelte/store';
import { executeStopAllCleanup, type NodeExecutor } from '@shugu/sdk-client';
import type { MultimediaCore } from '@shugu/multimedia-core';
import type { ScreenColorPayload } from '@shugu/protocol';
import { createClearedDisplayScreenOverlayState, type ScreenOverlayState } from './display-screen-overlay';

export function stopAllDisplaySideEffects(input: {
  multimediaCore: MultimediaCore | null;
  nodeExecutor: NodeExecutor | null;
  screenOverlay: Writable<ScreenOverlayState>;
  setScreenColor: (payload: ScreenColorPayload) => void;
  clearActiveImageObjectUrl: () => void;
}): void {
  input.clearActiveImageObjectUrl();
  executeStopAllCleanup({
    media: input.multimediaCore?.media ?? null,
    screen: {
      clear: () => input.screenOverlay.set(createClearedDisplayScreenOverlayState()),
      setColor: input.setScreenColor,
    },
    nodeExecutor: input.nodeExecutor,
  });
}
