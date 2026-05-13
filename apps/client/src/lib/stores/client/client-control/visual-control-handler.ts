/**
 * Purpose: Execute visual scene and effect control actions.
 */
import type { VisualEffectsPayload, VisualScenesPayload } from '@shugu/protocol';
import {
  normalizeVisualEffectsPayload,
  normalizeVisualScenesPayload,
  syncVisualScenesToLegacyStores,
  visualEffects,
  visualScenes,
} from '../client-visual';

export function executeVisualControl(action: string, payload: unknown): boolean {
  switch (action) {
    case 'visualScenes': {
      const scenes = normalizeVisualScenesPayload(payload as VisualScenesPayload);
      visualScenes.set(scenes);
      syncVisualScenesToLegacyStores(scenes);
      return true;
    }
    case 'visualEffects': {
      const effects = normalizeVisualEffectsPayload(payload as VisualEffectsPayload);
      visualEffects.set(effects);
      return true;
    }
    default:
      return false;
  }
}
