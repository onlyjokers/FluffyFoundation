/**
 * Purpose: Dispose Tone adapter node instances by node id.
 */
import { audioDataInstances, effectInstances, granularInstances, lfoInstances, oscInstances, playerInstances } from '../state.js';
import { maybeStopTransport, scheduleGraphWiring } from '../engine-host.js';
import { disposeLoop } from './osc-lfo.js';

export function disposeOscInstance(nodeId: string): void {
  const inst = oscInstances.get(nodeId);
  if (!inst) return;
  disposeLoop(inst);
  try {
    inst.osc?.stop();
  } catch {
    // ignore
  }
  try {
    inst.osc?.dispose();
  } catch {
    // ignore
  }
  try {
    inst.gain?.dispose();
  } catch {
    // ignore
  }
  oscInstances.delete(nodeId);
  maybeStopTransport();
}

export function disposeEffectInstance(nodeId: string): void {
  const inst = effectInstances.get(nodeId);
  if (!inst) return;
  try {
    inst.wrapper.dispose();
  } catch {
    // ignore
  }
  effectInstances.delete(nodeId);
}

export function disposeGranularInstance(nodeId: string): void {
  const inst = granularInstances.get(nodeId);
  if (!inst) return;
  try {
    inst.player?.stop();
  } catch {
    // ignore
  }
  try {
    inst.player?.dispose();
  } catch {
    // ignore
  }
  try {
    inst.gain?.dispose();
  } catch {
    // ignore
  }
  granularInstances.delete(nodeId);
}

export function disposePlayerInstance(nodeId: string): void {
  const inst = playerInstances.get(nodeId);
  if (!inst) return;
  try {
    inst.loadController?.abort();
  } catch {
    // ignore
  }
  inst.loadController = null;
  try {
    inst.manualStopPending = true;
    inst.player?.stop();
  } catch {
    inst.manualStopPending = false;
  }
  try {
    inst.player?.dispose();
  } catch {
    // ignore
  }
  try {
    inst.gain?.dispose();
  } catch {
    // ignore
  }
  playerInstances.delete(nodeId);
}

export function disposeToneLfoInstance(nodeId: string): void {
  const inst = lfoInstances.get(nodeId);
  if (!inst) return;
  try {
    inst.lfo?.stop();
  } catch {
    // ignore
  }
  try {
    inst.lfo?.dispose();
  } catch {
    // ignore
  }
  lfoInstances.delete(nodeId);
  scheduleGraphWiring();
}

export function disposeAudioDataInstance(nodeId: string): void {
  const inst = audioDataInstances.get(nodeId);
  if (!inst) return;
  try {
    inst.output?.disconnect();
  } catch {
    // ignore
  }
  try {
    inst.input?.disconnect();
  } catch {
    // ignore
  }
  try {
    inst.analyser?.disconnect();
  } catch {
    // ignore
  }
  try {
    inst.output?.dispose();
  } catch {
    // ignore
  }
  try {
    inst.input?.dispose();
  } catch {
    // ignore
  }
  audioDataInstances.delete(nodeId);
  scheduleGraphWiring();
}

export function disposeNodeById(nodeId: string): void {
  disposeOscInstance(nodeId);
  disposeAudioDataInstance(nodeId);
  disposeEffectInstance(nodeId);
  disposeGranularInstance(nodeId);
  disposePlayerInstance(nodeId);
  disposeToneLfoInstance(nodeId);
  scheduleGraphWiring();
}
