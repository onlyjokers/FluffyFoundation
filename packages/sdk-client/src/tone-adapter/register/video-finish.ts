/**
 * Purpose: Override video loader Finish output with media finish pulse state.
 */
import type { NodeRegistry } from '@shugu/node-core';
import { consumeNodeMediaFinishPulse } from '@shugu/multimedia-core';
import { toBoolean } from '../utils.js';

type VideoFinishState = {
  signature: string;
  lastPlay: boolean;
  finished: boolean;
  updatedAt: number;
};

export const videoFinishStates = new Map<string, VideoFinishState>();
const VIDEO_FINISH_MAX_AGE_MS = 10 * 60 * 1000;

export function pruneVideoFinishStates(now: number): void {
  for (const [nodeId, entry] of videoFinishStates.entries()) {
    if (now - entry.updatedAt > VIDEO_FINISH_MAX_AGE_MS) videoFinishStates.delete(nodeId);
  }
}

function videoFinishSignatureFromRef(ref: unknown): string {
  if (typeof ref !== 'string') return '';
  const trimmed = ref.trim();
  if (!trimmed) return '';

  const hashIndex = trimmed.indexOf('#');
  const baseUrl = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
  const paramsRaw = hashIndex >= 0 ? trimmed.slice(hashIndex + 1) : '';
  if (!paramsRaw) return baseUrl;

  try {
    const params = new URLSearchParams(paramsRaw);
    const t = params.get('t') ?? '';
    const p = params.get('p') ?? '';
    const loop = params.get('loop') ?? '';
    const rev = params.get('rev') ?? '';
    return `${baseUrl}#t=${t}&p=${p}&loop=${loop}&rev=${rev}`;
  } catch {
    return baseUrl;
  }
}

function overrideVideoFinishOutput(registry: NodeRegistry, type: 'load-video-from-assets' | 'load-video-from-local'): void {
  const base = registry.get(type);
  if (!base) return;
  registry.register({
    ...base,
    outputs: base.outputs.map((port) =>
      port.id === 'ended' ? { ...port, label: 'Finish' } : port
    ),
    process: (inputs, config, context) => {
      const baseOut = base.process(inputs, config, context) as Record<string, unknown>;
      const nodeId = context.nodeId;
      const now = Date.now();
      pruneVideoFinishStates(now);

      const signature = videoFinishSignatureFromRef(baseOut?.ref);
      if (!signature) {
        videoFinishStates.delete(nodeId);
        // Drain any pending finish pulses so stale ends don't apply after reloads.
        consumeNodeMediaFinishPulse(nodeId);
        return { ...baseOut, ended: false };
      }

      const existing = videoFinishStates.get(nodeId) ?? {
        signature: '',
        lastPlay: false,
        finished: false,
        updatedAt: now,
      };

      const playActive = toBoolean(inputs.play, true);
      const playRising = playActive && !existing.lastPlay;

      const finished = (() => {
        if (signature !== existing.signature) return false;
        if (!playActive || playRising) return false;
        if (consumeNodeMediaFinishPulse(nodeId)) return true;
        return existing.finished;
      })();

      videoFinishStates.set(nodeId, {
        signature,
        lastPlay: playActive,
        finished,
        updatedAt: now,
      });

      return { ...baseOut, ended: finished };
    },
  });
}

export function overrideVideoFinishOutputs(registry: NodeRegistry): void {
  overrideVideoFinishOutput(registry, 'load-video-from-assets');
  overrideVideoFinishOutput(registry, 'load-video-from-local');
}
