/**
 * Purpose: Build the process function for Tone load-audio nodes.
 */
import type { ProcessContext } from '@shugu/node-core';
import { toneAudioEngine } from '@shugu/multimedia-core';
import type { ToneAdapterDeps } from '../types.js';
import { DEFAULT_RAMP_SECONDS, ensureTone, latestAudioConnections, playerInstances, toneModule } from '../state.js';
import { createPlayerInstance, disposePlayerInstance, requestTonePlayerLoad } from '../nodes.js';
import { clamp, toAssetVolumeGain, toBoolean, toNonNegativeNumber, toNumber } from '../utils.js';
import type { LoadAudioNodeOptions } from './types.js';

export function createLoadAudioProcess(deps: ToneAdapterDeps, opts: LoadAudioNodeOptions) {
  return (inputs: Record<string, unknown>, config: Record<string, unknown>, context: ProcessContext): Record<string, unknown> => {
        const baseUrlRaw = opts.resolveBaseUrlRaw(inputs, config);
        const url = deps.resolveAssetRef ? deps.resolveAssetRef(baseUrlRaw) : baseUrlRaw;

        const playbackRate = toNonNegativeNumber(inputs.playbackRate ?? config.playbackRate, 1);
        const detune = toNumber(inputs.detune ?? config.detune, 0);
        const volume = toAssetVolumeGain(inputs.volume ?? config.volume);
        const loop = toBoolean(inputs.loop, false);
        const playing = toBoolean(inputs.play, true);
        const reverse = toBoolean(inputs.reverse, false);

        const cursorRequestedRaw = toNumber(inputs.cursorSec, -1);
        const cursorRequested =
          typeof cursorRequestedRaw === 'number' &&
          Number.isFinite(cursorRequestedRaw) &&
          cursorRequestedRaw >= 0
            ? cursorRequestedRaw
            : null;

        const outValue = baseUrlRaw ? (playing ? 1 : 0) : 0;

        if (!toneAudioEngine.isEnabled()) {
          return { ref: outValue, ended: false };
        }

        if (!toneModule) {
          void ensureTone().catch((error) =>
            console.warn('[tone-adapter] Tone.js load failed', error)
          );
          return { ref: outValue, ended: false };
        }

        if (!url) {
          disposePlayerInstance(context.nodeId);
          return { ref: outValue, ended: false };
        }

        const hasAudioConnections = latestAudioConnections.some(
          (conn) => conn.sourceNodeId === context.nodeId || conn.targetNodeId === context.nodeId
        );
        if (!hasAudioConnections) {
          if (playerInstances.has(context.nodeId)) disposePlayerInstance(context.nodeId);
          return { ref: outValue, ended: false };
        }

        let instance = playerInstances.get(context.nodeId);
        const params = {
          playbackRate,
          detune,
          volume,
          loop,
          playing,
        };

        if (!instance) {
          instance = createPlayerInstance(context.nodeId, params);
        }

        if (instance.lastUrl !== url && url) {
          const wasStarted = instance.started;
          instance.lastUrl = url;
          instance.loadedUrl = null;
          instance.failedUrl = null;
          instance.autostarted = false;
          instance.started = false;
          instance.startedAt = 0;
          instance.startOffsetSec = 0;
          instance.startDurationSec = null;
          instance.pausedOffsetSec = null;
          instance.lastClip = null;
          instance.lastCursorSec = null;
          instance.ended = false;
          instance.endedReported = false;
          instance.manualStopPending = false;
          try {
            instance.loadController?.abort();
          } catch {
            // ignore
          }
          instance.loadController = null;
          instance.loadingUrl = null;
          try {
            if (wasStarted) instance.manualStopPending = true;
            instance.player.stop();
          } catch {
            instance.manualStopPending = false;
          }
        }

        requestTonePlayerLoad(instance);

        if (instance.lastParams.playbackRate !== playbackRate)
          instance.player.playbackRate = playbackRate;
        if (instance.lastParams.detune !== detune) instance.player.detune = detune;
        if (instance.lastParams.loop !== loop) instance.player.loop = loop;
        if (instance.lastParams.volume !== volume)
          instance.gain.gain.rampTo(volume, DEFAULT_RAMP_SECONDS);

        const clipStartRaw = Math.max(0, toNumber(inputs.startSec, 0));
        const clipEndRaw = toNumber(inputs.endSec, -1);
        const clipEndCandidate =
          Number.isFinite(clipEndRaw) && clipEndRaw >= 0 ? Math.max(clipStartRaw, clipEndRaw) : -1;

        const bufferDuration = (() => {
          try {
            const dur = instance.player?.buffer?.duration;
            return typeof dur === 'number' && Number.isFinite(dur) && dur > 0 ? dur : null;
          } catch {
            return null;
          }
        })();

        const nowToneSec = toneModule!.now();

        const playbackPositionSec = (opts: {
          clipStart: number;
          resolvedClipEnd: number | null;
          loop: boolean;
          reverse: boolean;
        }): number | null => {
          if (!instance.started) return null;
          const elapsed = instance.startedAt > 0 ? Math.max(0, nowToneSec - instance.startedAt) : 0;
          const direction = opts.reverse ? -1 : 1;
          const rawPos = instance.startOffsetSec + direction * elapsed * playbackRate;
          let position = rawPos;
          const duration =
            opts.resolvedClipEnd !== null ? Math.max(0, opts.resolvedClipEnd - opts.clipStart) : null;
          if (opts.loop && duration !== null && duration > 0 && opts.resolvedClipEnd !== null) {
            if (opts.reverse) {
              const rel = opts.resolvedClipEnd - rawPos;
              const wrapped = ((rel % duration) + duration) % duration;
              position = opts.resolvedClipEnd - wrapped;
            } else {
              const rel = rawPos - opts.clipStart;
              const wrapped = ((rel % duration) + duration) % duration;
              position = opts.clipStart + wrapped;
            }
          } else if (opts.resolvedClipEnd !== null) {
            position = clamp(position, opts.clipStart, opts.resolvedClipEnd);
          } else {
            position = Math.max(opts.clipStart, position);
          }
          return position;
        };

        const activeClip = instance.lastClip;
        const activeResolvedClipEnd =
          activeClip && activeClip.endSec >= 0
            ? activeClip.endSec
            : activeClip && bufferDuration !== null
              ? bufferDuration
              : null;
        const activePlaybackPosSec = activeClip
          ? playbackPositionSec({
              clipStart: activeClip.startSec,
              resolvedClipEnd: activeResolvedClipEnd,
              loop: activeClip.loop,
              reverse: activeClip.reverse,
            })
          : null;

        let clipStart =
          bufferDuration !== null ? clamp(clipStartRaw, 0, bufferDuration) : clipStartRaw;
        let clipEnd =
          clipEndCandidate >= 0
            ? bufferDuration !== null
              ? clamp(clipEndCandidate, clipStart, bufferDuration)
              : Math.max(clipStart, clipEndCandidate)
            : -1;

        if (clipEnd >= 0 && clipEnd < clipStart) clipEnd = clipStart;

        const resolvedClipEnd =
          clipEnd >= 0 ? clipEnd : bufferDuration !== null ? bufferDuration : null;
        const resolvedClipDuration =
          resolvedClipEnd !== null ? Math.max(0, resolvedClipEnd - clipStart) : null;

        const nextClip = { startSec: clipStart, endSec: clipEnd, loop, reverse };
        const clipChanged =
          !instance.lastClip ||
          instance.lastClip.startSec !== nextClip.startSec ||
          instance.lastClip.endSec !== nextClip.endSec ||
          instance.lastClip.loop !== nextClip.loop ||
          instance.lastClip.reverse !== nextClip.reverse;

        if (clipChanged) {
          instance.ended = false;
          instance.endedReported = false;
        }

        const cursorClamped = (() => {
          if (cursorRequested === null) return null;
          const base = Math.max(clipStart, cursorRequested);
          if (resolvedClipEnd !== null) return Math.min(resolvedClipEnd, base);
          return base;
        })();

        const canApplyReverse = !reverse || bufferDuration !== null;
        const canApplyLoopEnd = resolvedClipEnd !== null;
        const canStartNow = !instance.loading && canApplyReverse && (!loop || canApplyLoopEnd);

        const applyClipToPlayer = () => {
          try {
            if (instance.lastParams.reverse !== reverse) instance.player.reverse = reverse;
          } catch {
            // ignore
          }
          try {
            instance.player.loop = loop;
          } catch {
            // ignore
          }

          if (reverse) {
            if (bufferDuration === null) return;
            const endForMap = resolvedClipEnd ?? bufferDuration;
            const loopStart = clamp(bufferDuration - endForMap, 0, bufferDuration);
            const loopEnd = clamp(bufferDuration - clipStart, loopStart, bufferDuration);
            try {
              instance.player.loopStart = loopStart;
            } catch {
              // ignore
            }
            try {
              instance.player.loopEnd = loopEnd;
            } catch {
              // ignore
            }
            return;
          }

          try {
            instance.player.loopStart = clipStart;
          } catch {
            // ignore
          }
          if (resolvedClipEnd !== null) {
            try {
              instance.player.loopEnd = resolvedClipEnd;
            } catch {
              // ignore
            }
          }
        };

        if (!instance.loading) applyClipToPlayer();

        const stopAndMaybePause = () => {
          if (!instance.started) return;
          const now = toneModule!.now();
          const elapsed = instance.startedAt > 0 ? Math.max(0, now - instance.startedAt) : 0;
          const activeReverse = instance.lastClip?.reverse ?? reverse;
          const direction = activeReverse ? -1 : 1;
          const rawPos = instance.startOffsetSec + direction * elapsed * playbackRate;
          let pausedOffset = rawPos;
          if (loop && resolvedClipDuration && resolvedClipDuration > 0 && resolvedClipEnd !== null) {
            if (activeReverse) {
              const rel = resolvedClipEnd - rawPos;
              const wrapped =
                ((rel % resolvedClipDuration) + resolvedClipDuration) % resolvedClipDuration;
              pausedOffset = resolvedClipEnd - wrapped;
            } else {
              const rel = rawPos - clipStart;
              const wrapped =
                ((rel % resolvedClipDuration) + resolvedClipDuration) % resolvedClipDuration;
              pausedOffset = clipStart + wrapped;
            }
          } else if (resolvedClipEnd !== null) {
            pausedOffset = clamp(pausedOffset, clipStart, resolvedClipEnd);
          } else {
            pausedOffset = Math.max(clipStart, pausedOffset);
          }

          instance.pausedOffsetSec = pausedOffset;
          try {
            instance.manualStopPending = true;
            instance.player.stop();
          } catch {
            instance.manualStopPending = false;
          }
          instance.started = false;
          instance.startedAt = 0;
          instance.startOffsetSec = 0;
          instance.startDurationSec = null;
        };

        const segmentStart = reverse ? (resolvedClipEnd ?? clipStart) : clipStart;

        const startFromPosition = (pos: number, reason: string) => {
          if (!canStartNow) return;
          const wasStarted = instance.started;
          instance.ended = false;
          instance.endedReported = false;
          applyClipToPlayer();
          const nextPos =
            resolvedClipEnd !== null
              ? clamp(Math.max(0, pos), clipStart, resolvedClipEnd)
              : Math.max(clipStart, pos);
          const nearEdge = 0.002;
          const noRange =
            !loop &&
            resolvedClipEnd !== null &&
            (resolvedClipDuration !== null && resolvedClipDuration <= nearEdge
              ? true
              : reverse
                ? nextPos <= clipStart + nearEdge
                : nextPos >= resolvedClipEnd - nearEdge);
          if (noRange) {
            try {
              instance.manualStopPending = false;
              if (instance.started) instance.manualStopPending = true;
              instance.player.stop();
            } catch {
              instance.manualStopPending = false;
            }
            instance.started = false;
            instance.startedAt = 0;
            instance.startOffsetSec = 0;
            instance.startDurationSec = null;
            instance.pausedOffsetSec = nextPos;
            return;
          }

          const offset = reverse ? bufferDuration! - nextPos : nextPos;

          try {
            if (instance.started) {
              instance.manualStopPending = true;
              instance.player.stop();
            }
          } catch {
            instance.manualStopPending = false;
          }

          try {
            instance.player.start(undefined, offset);
            instance.started = true;
            instance.startedAt = toneModule!.now();
            instance.startOffsetSec = nextPos;
            instance.startDurationSec = null;
            instance.pausedOffsetSec = null;

            if (!wasStarted && deps.sdk) {
              try {
                const sensorPayload: Record<string, unknown> = {
                  kind: 'node-media',
                  event: 'started',
                  nodeId: context.nodeId,
                  nodeType: opts.sensorNodeType,
                };
                deps.sdk.sendSensorData('custom', sensorPayload, { trackLatest: false });
              } catch {
                // ignore
              }
            }
          } catch (err) {
            console.warn('[tone-adapter] player start failed', { reason }, err);
          }
        };

        const cursorChanged =
          cursorClamped !== null &&
          (instance.lastCursorSec === null ||
            Math.abs(cursorClamped - instance.lastCursorSec) > 0.005);

        if (!playing) {
          stopAndMaybePause();
          instance.ended = false;
          instance.endedReported = false;
          if (cursorClamped !== null) instance.pausedOffsetSec = cursorClamped;
        } else {
          if (clipChanged && instance.started) {
            // Switching reverse while playing should keep the current position when possible.
            if (instance.lastClip && instance.lastClip.reverse !== reverse) {
              stopAndMaybePause();
              const resume = instance.pausedOffsetSec ?? segmentStart;
              instance.pausedOffsetSec = null;
              startFromPosition(resume, 'reverse-change');
            } else {
              instance.pausedOffsetSec = null;
              if (activePlaybackPosSec !== null) {
                if (activePlaybackPosSec < clipStart) {
                  startFromPosition(clipStart, 'clip-range');
                } else if (resolvedClipEnd !== null && activePlaybackPosSec > resolvedClipEnd) {
                  if (loop) startFromPosition(segmentStart, 'clip-range');
                } else {
                  instance.startOffsetSec = activePlaybackPosSec;
                  instance.startedAt = nowToneSec;
                }
              }
            }
          } else if (cursorChanged) {
            instance.pausedOffsetSec = null;
            startFromPosition(cursorClamped ?? segmentStart, 'seek');
          } else if (!instance.started && !instance.loading) {
            if (instance.ended) {
              instance.lastClip = nextClip;
              instance.lastParams = { ...instance.lastParams, ...params, reverse };
              instance.lastCursorSec = cursorClamped;
              instance.playing = playing;
              return { ref: outValue, ended: true };
            }
            const resumeOffsetRaw = instance.pausedOffsetSec ?? cursorClamped ?? segmentStart;
            // When resuming from a stopped state, `pausedOffsetSec` may be clamped to the range edge (e.g. End).
            // Starting exactly at the edge results in an immediate stop, which feels like "Play doesn't work".
            const resumeOffset = (() => {
              if (loop || resolvedClipEnd === null) return resumeOffsetRaw;
              const nearEdge = 0.002;
              if (reverse) {
                return resumeOffsetRaw <= clipStart + nearEdge ? segmentStart : resumeOffsetRaw;
              }
              return resumeOffsetRaw >= resolvedClipEnd - nearEdge ? segmentStart : resumeOffsetRaw;
            })();
            const resumeReason =
              instance.pausedOffsetSec !== null
                ? 'resume'
                : cursorClamped !== null
                  ? 'seek-start'
                  : 'start';
            startFromPosition(resumeOffset, resumeReason);
          }
        }

        instance.playing = playing;
        instance.lastClip = nextClip;
        instance.lastParams = { ...instance.lastParams, ...params, reverse };
        instance.lastCursorSec = cursorClamped;

        // Fallback: if Tone reports the player stopped but we missed the `onstop` callback,
        // treat it as a finish when Play is still enabled.
        if (playing && instance.started && !loop && !instance.ended && !instance.manualStopPending) {
          const playerStopped = (() => {
            try {
              return String(instance.player?.state ?? '') === 'stopped';
            } catch {
              return false;
            }
          })();

          if (playerStopped) {
            const fallbackEndPos =
              reverse ? clipStart : resolvedClipEnd ?? bufferDuration ?? instance.pausedOffsetSec;
            if (typeof fallbackEndPos === 'number' && Number.isFinite(fallbackEndPos)) {
              instance.pausedOffsetSec = Math.max(0, fallbackEndPos);
            }
            instance.ended = true;
            instance.started = false;
            instance.startedAt = 0;
            instance.startOffsetSec = 0;
            instance.startDurationSec = null;
          }
        }

        if (playing && instance.started && !loop && resolvedClipEnd !== null && !instance.manualStopPending) {
          const nowPos = playbackPositionSec({
            clipStart,
            resolvedClipEnd,
            loop: false,
            reverse,
          });
          if (nowPos !== null) {
            const nearEdge = 0.002;
            const reachedEnd = reverse
              ? nowPos <= clipStart + nearEdge
              : nowPos >= resolvedClipEnd - nearEdge;
            if (reachedEnd) {
              instance.pausedOffsetSec = reverse ? clipStart : resolvedClipEnd;
              instance.ended = true;
              try {
                instance.player.stop();
              } catch {
                // ignore
              }
              instance.started = false;
              instance.startedAt = 0;
              instance.startOffsetSec = 0;
              instance.startDurationSec = null;
            }
          }
        }

        if (playing && !loop && instance.ended && !instance.endedReported && deps.sdk) {
          try {
            const sensorPayload: Record<string, unknown> = {
              kind: 'node-media',
              event: 'ended',
              nodeId: context.nodeId,
              nodeType: opts.sensorNodeType,
            };
            deps.sdk.sendSensorData('custom', sensorPayload, { trackLatest: false });
            instance.endedReported = true;
          } catch {
            // ignore
          }
        }

        return { ref: outValue, ended: instance.ended };
  };
}
