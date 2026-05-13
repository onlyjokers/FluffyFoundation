/**
 * Purpose: Build the Tone adapter lifecycle handle.
 */
import type { Connection, NodeInstance, NodeRegistry } from '@shugu/node-core';
import { consumeNodeMediaFinishPulse } from '@shugu/multimedia-core';
import type { ToneAdapterHandle } from '../types.js';
import { audioDataInstances, effectInstances, granularInstances, latestAudioConnections, latestGraphNodesById, latestToneLfoActiveTargets, latestToneLfoConnections, latestToneLfoDesiredTargets, lfoInstances, oscInstances, playerInstances } from '../state.js';
import { maybeStopTransport, scheduleGraphWiring, updateAudioGraphSnapshot } from '../engine-host.js';
import { disposeAudioDataInstance, disposeEffectInstance, disposeGranularInstance, disposeNodeById, disposeOscInstance, disposePlayerInstance, disposeToneLfoInstance } from '../nodes.js';
import { pruneVideoFinishStates, videoFinishStates } from './video-finish.js';

export function createToneAdapterHandle(registry: NodeRegistry): ToneAdapterHandle {
  return {
    disposeNode: (nodeId: string) => {
      disposeNodeById(nodeId);
    },
    disposeAll: () => {
      for (const nodeId of Array.from(oscInstances.keys())) disposeOscInstance(nodeId);
      for (const nodeId of Array.from(audioDataInstances.keys())) disposeAudioDataInstance(nodeId);
      for (const nodeId of Array.from(effectInstances.keys())) disposeEffectInstance(nodeId);
      for (const nodeId of Array.from(granularInstances.keys())) disposeGranularInstance(nodeId);
      for (const nodeId of Array.from(playerInstances.keys())) disposePlayerInstance(nodeId);
      for (const nodeId of Array.from(lfoInstances.keys())) disposeToneLfoInstance(nodeId);
      latestGraphNodesById.clear();
      latestAudioConnections.length = 0;
      latestToneLfoConnections.length = 0;
      latestToneLfoDesiredTargets.clear();
      latestToneLfoActiveTargets.clear();
      maybeStopTransport();
    },
    syncActiveNodes: (
      activeNodeIds: Set<string>,
      nodes: NodeInstance[],
      connections: Connection[]
    ) => {
      updateAudioGraphSnapshot(registry, nodes ?? [], connections ?? []);

      // Best-effort: reset per-node video Finish state on each deploy.
      const now = Date.now();
      pruneVideoFinishStates(now);
      const activeVideoNodeIds = new Set(
        (nodes ?? [])
          .filter(
            (node) =>
              node.type === 'load-video-from-assets' || node.type === 'load-video-from-local'
          )
          .map((node) => node.id)
      );
      for (const nodeId of Array.from(videoFinishStates.keys())) {
        if (!activeVideoNodeIds.has(nodeId)) videoFinishStates.delete(nodeId);
      }
      for (const nodeId of activeVideoNodeIds) {
        consumeNodeMediaFinishPulse(nodeId);
        videoFinishStates.set(nodeId, {
          signature: '',
          lastPlay: false,
          finished: false,
          updatedAt: now,
        });
      }

      for (const nodeId of Array.from(oscInstances.keys())) {
        if (!activeNodeIds.has(nodeId)) disposeOscInstance(nodeId);
      }
      for (const nodeId of Array.from(audioDataInstances.keys())) {
        if (!activeNodeIds.has(nodeId)) disposeAudioDataInstance(nodeId);
      }
      for (const nodeId of Array.from(effectInstances.keys())) {
        if (!activeNodeIds.has(nodeId)) disposeEffectInstance(nodeId);
      }
      for (const nodeId of Array.from(granularInstances.keys())) {
        if (!activeNodeIds.has(nodeId)) disposeGranularInstance(nodeId);
      }
      for (const nodeId of Array.from(playerInstances.keys())) {
        if (!activeNodeIds.has(nodeId)) disposePlayerInstance(nodeId);
      }
      for (const nodeId of Array.from(lfoInstances.keys())) {
        if (!activeNodeIds.has(nodeId)) disposeToneLfoInstance(nodeId);
      }

      scheduleGraphWiring();
    },
  } satisfies ToneAdapterHandle;
}
