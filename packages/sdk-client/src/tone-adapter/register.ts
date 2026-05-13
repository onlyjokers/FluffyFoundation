/**
 * Purpose: Register Tone adapter node definitions into a NodeRegistry.
 */
import type { NodeRegistry } from '@shugu/node-core';
import type { ToneAdapterDeps, ToneAdapterHandle } from './types.js';
import { setLatestDeps } from './state.js';
import { registerEffectsAndGranularNodes } from './register/effects-granular.js';
import { createToneAdapterHandle } from './register/lifecycle.js';
import { registerLoadAudioNodes } from './register/load-audio-nodes.js';
import { registerOscLfoAudioDataNodes } from './register/osc-lfo-audio-data.js';
import { overrideVideoFinishOutputs } from './register/video-finish.js';

export function registerToneClientDefinitions(
  registry: NodeRegistry,
  deps: ToneAdapterDeps = {}
): ToneAdapterHandle {
  // Store deps for standalone functions (e.g., startTonePlayerLoad).
  setLatestDeps(deps);

  registerOscLfoAudioDataNodes(registry, deps);
  registerEffectsAndGranularNodes(registry, deps);
  registerLoadAudioNodes(registry, deps);
  overrideVideoFinishOutputs(registry);

  return createToneAdapterHandle(registry);
}
