/**
 * Purpose: Unified FF-16 stop-all cleanup contract for runtime media/audio/visual side effects.
 */

import type { ScreenColorPayload } from '@shugu/protocol';

export type StopAllCleanupDeps = {
  media?: {
    stopAllMedia?: () => void;
    stopAudio?: () => void;
    stopVideo?: () => void;
    hideImage?: () => void;
  } | null;
  sound?: { stop: () => void } | null;
  modulatedSound?: { stop: () => void } | null;
  screen?: { clear?: () => void; setColor?: (payload: ScreenColorPayload) => void } | null;
  visual?: { clearScenes?: () => void; clearEffects?: () => void } | null;
  nodeExecutor?: { stopAll?: () => void; destroy?: () => void } | null;
};

function tryCall(fn: (() => void) | undefined): void {
  try {
    fn?.();
  } catch {
    // Stop-all is an emergency cleanup path; continue clearing remaining side effects.
  }
}

export function executeStopAllCleanup(deps: StopAllCleanupDeps): void {
  if (deps.media?.stopAllMedia) tryCall(() => deps.media?.stopAllMedia?.());
  else {
    tryCall(() => deps.media?.stopVideo?.());
    tryCall(() => deps.media?.hideImage?.());
    tryCall(() => deps.media?.stopAudio?.());
  }

  tryCall(() => deps.sound?.stop?.());
  tryCall(() => deps.modulatedSound?.stop?.());
  tryCall(() => deps.screen?.clear?.());
  tryCall(() => deps.screen?.setColor?.({ color: '#000000', opacity: 0, mode: 'solid' }));
  tryCall(() => deps.visual?.clearScenes?.());
  tryCall(() => deps.visual?.clearEffects?.());
  if (deps.nodeExecutor?.stopAll) tryCall(() => deps.nodeExecutor?.stopAll?.());
  else tryCall(() => deps.nodeExecutor?.destroy?.());
}
