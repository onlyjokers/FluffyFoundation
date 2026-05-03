/**
 * Purpose: FF-16 client stop-all cleanup adapter for runtime-owned side effects.
 */

import { executeStopAllCleanup, type NodeExecutor, type ScreenController, type ToneModulatedSoundPlayer, type ToneSoundPlayer } from '@shugu/sdk-client';
import type { MultimediaCore } from '@shugu/multimedia-core';
import { syncVisualScenesToLegacyStores, visualEffects, visualScenes } from './client-visual';

export function stopAllClientSideEffects(input: {
  multimediaCore: MultimediaCore | null;
  toneSoundPlayer: ToneSoundPlayer | null;
  toneModulatedSoundPlayer: ToneModulatedSoundPlayer | null;
  screenController: ScreenController | null;
  nodeExecutor: NodeExecutor | null;
}): void {
  executeStopAllCleanup({
    media: input.multimediaCore?.media ?? null,
    sound: input.toneSoundPlayer,
    modulatedSound: input.toneModulatedSoundPlayer,
    screen: input.screenController,
    visual: {
      clearScenes: () => {
        visualScenes.set([]);
        syncVisualScenesToLegacyStores([]);
      },
      clearEffects: () => visualEffects.set([]),
    },
    nodeExecutor: input.nodeExecutor,
  });
}
