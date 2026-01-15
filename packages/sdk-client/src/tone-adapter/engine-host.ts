/**
 * Purpose: Tone adapter engine host (Tone loading, transport, graph wiring).
 */

import type { Connection, NodeInstance, NodeRegistry } from '@shugu/node-core';
import { toneAudioEngine } from '@shugu/multimedia-core';
import type { ToneAdapterDeps, ToneConnectable, ToneNodeKind, ToneParamLike } from './types.js';
import {
  AUDIO_INPUT_PORTS,
  AUDIO_NODE_KINDS,
  AUDIO_OUTPUT_PORTS,
  audioDataInstances,
  effectInstances,
  ensureMasterGain,
  ensureTone,
  granularInstances,
  latestAudioConnections,
  latestGraphNodesById,
  latestToneLfoActiveTargets,
  latestToneLfoConnections,
  latestToneLfoDesiredTargets,
  lfoInstances,
  masterGain,
  oscInstances,
  playerInstances,
  toneModule,
  transportState,
} from './state.js';

function toneLfoTargetKey(nodeId: string, portId: string): string {
  return `${nodeId}|${portId}`;
}

export function isToneLfoTargetActive(nodeId: string, portId: string): boolean {
  return latestToneLfoActiveTargets.has(toneLfoTargetKey(nodeId, portId));
}

function isAudioNodeKind(type: string): type is ToneNodeKind {
  return AUDIO_NODE_KINDS.has(type as ToneNodeKind);
}

function isToneLfoConnection(conn: Connection, nodesById: Map<string, NodeInstance>): boolean {
  const source = nodesById.get(conn.sourceNodeId);
  const target = nodesById.get(conn.targetNodeId);
  if (!source || !target) return false;
  if (source.type !== 'tone-lfo') return false;
  if (conn.sourcePortId !== 'value') return false;
  // LFO connections are control-rate (number) on the graph, but executed as audio-rate modulation in Tone.
  return true;
}

function isAudioConnection(
  conn: Connection,
  nodesById: Map<string, NodeInstance>,
  registry: NodeRegistry | null
): boolean {
  const source = nodesById.get(conn.sourceNodeId);
  const target = nodesById.get(conn.targetNodeId);
  if (!source || !target) return false;

  // Prefer port typing from the single source of truth (node registry definitions).
  // If ports are explicitly typed as `audio`, treat it as an audio connection.
  if (registry) {
    const sourceDef = registry.get(source.type);
    const targetDef = registry.get(target.type);
    const outPort = sourceDef?.outputs?.find((p) => p.id === conn.sourcePortId);
    const inPort = targetDef?.inputs?.find((p) => p.id === conn.targetPortId);
    if (outPort?.type === 'audio' && inPort?.type === 'audio') return true;
  }

  // Fallback for older graphs/definitions: use a conservative allowlist.
  if (!isAudioNodeKind(source.type) || !isAudioNodeKind(target.type)) return false;
  const sourcePorts = AUDIO_OUTPUT_PORTS.get(source.type);
  const targetPorts = AUDIO_INPUT_PORTS.get(target.type);
  if (!sourcePorts || !targetPorts) return false;
  return sourcePorts.includes(conn.sourcePortId) && targetPorts.includes(conn.targetPortId);
}

export function updateAudioGraphSnapshot(
  registry: NodeRegistry | null,
  nodes: NodeInstance[],
  connections: Connection[]
): void {
  latestGraphNodesById.clear();
  for (const node of nodes) {
    latestGraphNodesById.set(node.id, node);
  }

  const nextConnections = Array.isArray(connections) ? connections : [];

  latestAudioConnections.length = 0;
  for (const conn of nextConnections) {
    if (isAudioConnection(conn, latestGraphNodesById, registry)) {
      latestAudioConnections.push(conn);
    }
  }

  latestToneLfoConnections.length = 0;
  for (const conn of nextConnections) {
    if (isToneLfoConnection(conn, latestGraphNodesById)) {
      latestToneLfoConnections.push(conn);
    }
  }

  latestToneLfoDesiredTargets.clear();
  for (const conn of latestToneLfoConnections) {
    latestToneLfoDesiredTargets.add(
      toneLfoTargetKey(String(conn.targetNodeId), String(conn.targetPortId))
    );
  }
}

function getAudioOutputNode(nodeId: string): ToneConnectable | null {
  const osc = oscInstances.get(nodeId);
  if (osc?.gain) return osc.gain;
  const audioData = audioDataInstances.get(nodeId);
  if (audioData?.output) return audioData.output;
  const granular = granularInstances.get(nodeId);
  if (granular?.gain) return granular.gain;
  const player = playerInstances.get(nodeId);
  if (player?.gain) return player.gain;
  const effect = effectInstances.get(nodeId);
  if (effect?.wrapper?.output) return effect.wrapper.output;
  return null;
}

function getAudioInputNode(nodeId: string): ToneConnectable | null {
  const audioData = audioDataInstances.get(nodeId);
  if (audioData?.input) return audioData.input;
  const effect = effectInstances.get(nodeId);
  if (effect?.wrapper?.input) return effect.wrapper.input;
  return null;
}

function resolveToneLfoDestination(
  targetNodeId: string,
  targetPortId: string
): ToneParamLike | null {
  const target = latestGraphNodesById.get(targetNodeId);
  if (!target) return null;

  if (target.type === 'tone-delay') {
    const inst = effectInstances.get(targetNodeId);
    if (!inst) return null;
    if (targetPortId === 'wet') return inst.wrapper.wetParam ?? null;
    if (targetPortId === 'time') return inst.wrapper.effect?.delayTime ?? null;
    if (targetPortId === 'feedback') return inst.wrapper.effect?.feedback ?? null;
    return null;
  }

  if (target.type === 'tone-resonator') {
    const inst = effectInstances.get(targetNodeId);
    if (!inst) return null;
    if (targetPortId === 'wet') return inst.wrapper.wetParam ?? null;
    return null;
  }

  if (target.type === 'tone-reverb') {
    const inst = effectInstances.get(targetNodeId);
    if (!inst) return null;
    if (targetPortId === 'wet') return inst.wrapper.wetParam ?? null;
    return null;
  }

  return null;
}

function applyToneLfoWiring(): void {
  if (!toneModule || !toneAudioEngine.isEnabled()) {
    latestToneLfoActiveTargets.clear();
    return;
  }

  for (const inst of lfoInstances.values()) {
    try {
      inst.lfo.disconnect();
    } catch {
      // ignore
    }
  }

  const nextActiveTargets = new Set<string>();
  for (const conn of latestToneLfoConnections) {
    const inst = lfoInstances.get(conn.sourceNodeId);
    if (!inst || !inst.started) continue;

    const destination = resolveToneLfoDestination(conn.targetNodeId, conn.targetPortId);
    if (!destination) continue;

    try {
      inst.lfo.connect(destination);
      nextActiveTargets.add(toneLfoTargetKey(conn.targetNodeId, conn.targetPortId));
    } catch (error) {
      console.warn('[tone-adapter] lfo connect failed', conn, error);
    }
  }

  latestToneLfoActiveTargets.clear();
  for (const key of nextActiveTargets) latestToneLfoActiveTargets.add(key);
}

function disconnectAllAudioOutputs(): void {
  for (const inst of oscInstances.values()) {
    try {
      inst.gain.disconnect();
    } catch {
      // ignore
    }
  }
  for (const inst of audioDataInstances.values()) {
    try {
      inst.output.disconnect();
    } catch {
      // ignore
    }
  }
  for (const inst of effectInstances.values()) {
    try {
      inst.wrapper.output.disconnect();
    } catch {
      // ignore
    }
  }
  for (const inst of granularInstances.values()) {
    try {
      inst.gain.disconnect();
    } catch {
      // ignore
    }
  }
  for (const inst of playerInstances.values()) {
    try {
      inst.gain.disconnect();
    } catch {
      // ignore
    }
  }
}

// Rebuild explicit audio connections from the last deployed graph snapshot.
function applyGraphWiring(): boolean {
  if (!toneModule) return false;
  if (!toneAudioEngine.isEnabled()) return false;
  disconnectAllAudioOutputs();

  let missing = false;

  for (const conn of latestAudioConnections) {
    const output = getAudioOutputNode(conn.sourceNodeId);
    if (!output) {
      missing = true;
      continue;
    }

    const target = latestGraphNodesById.get(conn.targetNodeId);
    if (target?.type === 'audio-out') {
      ensureMasterGain();
      try {
        output.connect(masterGain ?? toneModule.Destination);
      } catch (error) {
        missing = true;
        console.warn('[tone-adapter] audio connect to audio-out failed', error);
      }
      continue;
    }

    const input = getAudioInputNode(conn.targetNodeId);
    if (!input) {
      missing = true;
      continue;
    }
    try {
      output.connect(input);
    } catch (error) {
      missing = true;
      console.warn('[tone-adapter] audio connect failed', error);
    }
  }

  return !missing;
}

// Mark the audio graph as dirty and rebuild if Tone is ready.
export function scheduleGraphWiring(): void {
  if (!toneModule || !toneAudioEngine.isEnabled()) {
    latestToneLfoActiveTargets.clear();
    return;
  }

  applyGraphWiring();
  applyToneLfoWiring();
}

function startTransportNow(): void {
  if (!toneModule || transportState.started) return;
  try {
    toneModule.Transport.start();
    transportState.started = true;
    transportState.scheduledAtMs = null;
    if (transportState.cancel) {
      transportState.cancel();
      transportState.cancel = undefined;
    }
  } catch (error) {
    console.warn('[tone-adapter] transport start failed', error);
  }
}

export function ensureTransportStart(deps: ToneAdapterDeps, startAtServerTimeMs?: number): void {
  if (!toneModule || transportState.started) return;

  if (typeof startAtServerTimeMs === 'number' && Number.isFinite(startAtServerTimeMs)) {
    if (transportState.scheduledAtMs && transportState.scheduledAtMs <= startAtServerTimeMs) {
      return;
    }
    if (transportState.cancel) {
      transportState.cancel();
      transportState.cancel = undefined;
      transportState.scheduledAtMs = null;
    }

    if (deps.sdk) {
      const scheduled = deps.sdk.scheduleAt(startAtServerTimeMs, () => startTransportNow());
      transportState.cancel = scheduled.cancel;
      transportState.scheduledAtMs = startAtServerTimeMs;
      return;
    }

    const delay = Math.max(0, startAtServerTimeMs - Date.now());
    const timeoutId = setTimeout(() => startTransportNow(), delay);
    transportState.cancel = () => clearTimeout(timeoutId);
    transportState.scheduledAtMs = startAtServerTimeMs;
    return;
  }

  startTransportNow();
}

export function maybeStopTransport(): void {
  if (!toneModule || !transportState.started) return;
  const hasLoop = Array.from(oscInstances.values()).some((inst) => inst.loop);
  if (hasLoop) return;
  try {
    toneModule.Transport.stop();
  } catch (error) {
    console.warn('[tone-adapter] transport stop failed', error);
  }
  transportState.started = false;
  transportState.scheduledAtMs = null;
  if (transportState.cancel) {
    transportState.cancel();
    transportState.cancel = undefined;
  }
}

export async function enableToneAudio(): Promise<{ enabled: boolean; error?: string } | null> {
  if (typeof window === 'undefined') return null;
  const result = await toneAudioEngine.start();
  if (result.enabled) {
    await ensureTone();
    ensureMasterGain();
    scheduleGraphWiring();
  }
  return { enabled: result.enabled, error: result.error };
}

export function isToneAudioEnabled(): boolean {
  return toneAudioEngine.isEnabled();
}

export function getToneAudioStatus(): { enabled: boolean; loaded: boolean; error?: string } {
  const status = toneAudioEngine.getStatus();
  // Note: toneModule may be lazily imported; rely on ToneAudioEngine as the source of truth.
  return { enabled: status.enabled, loaded: status.loaded, error: status.error ?? undefined };
}
