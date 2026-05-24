<!-- Purpose: Renders dual-cursor timeline controls for media time-range Rete inputs. -->
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { nodeMediaSignals } from '$lib/stores/manager';
  import {
    getAudioSpectrogramDataUrl,
    getMediaDurationSec,
  } from '$lib/features/assets/media-timeline-preview';
  import { assetsStore } from '$lib/stores/assets';
  import {
    isDisplayFileRef,
    localDisplayMediaStore,
    parseDisplayFileId,
  } from '$lib/stores/local-display-media';
  import { buildAssetContentUrl } from './rete-control-helpers';
  import type { LocalMediaKind } from '$lib/stores/local-media';
  import { nodeEngine } from '$lib/nodes';
  import type { Connection, NodeInstance } from '$lib/nodes/types';

  type AnyRecord = Record<string, unknown>;
  type TimeRangeControlData = AnyRecord & {
    label?: string;
    max?: number;
    min?: number;
    nodeId?: string;
    nodeType?: string;
    readonly?: boolean;
    setValue?: (value: unknown) => void;
    step?: number;
  };

  export let data: TimeRangeControlData;
  export let isInline = false;
  export let hasLabel = false;

  const graphStateStore = nodeEngine.graphState;
  const isRunningStore = nodeEngine.isRunning;
  const tickTimeStore = nodeEngine.tickTime;

  let didRefreshAssetsForTimeRange = false;
  $: if (!didRefreshAssetsForTimeRange) {
    didRefreshAssetsForTimeRange = true;
    void assetsStore.refresh();
  }

  let timeRangeNodeId = '';
  let timeRangeNodeType = '';
  let timeRangeStartSec = 0;
  let timeRangeEndSec = -1;
  let timeRangeCursorSec = -1;
  let timeRangeMin = 0;
  let timeRangeMax = 10;
  let timeRangeStep = 0.01;
  let timeRangeDurationSec: number | null = null;
  let timeRangeBackdropUrl: string | null = null;
  let timeRangeSliderStart = 0;
  let timeRangeSliderEnd = 0;
  let timeRangeSliderCursor = 0;
  let timeRangeStartFrac = 0;
  let timeRangeEndFrac = 1;
  let timeRangeCursorFrac = 0;
  let timeRangeEffectiveEndSec: number | null = null;
  let timeRangeIsPlaying = false;
  let timeRangeLoopEnabled = false;
  let timeRangeReverseEnabled = false;
  let timeRangePlaybackRaf: number | null = null;
  let timeRangePlaybackCursorSec = 0;
  let timeRangePlaybackLastMs = 0;
  let timeRangeLastPlayRequested: boolean | null = null;
  let timeRangeStartSeqBase: number | null = null;
  let timeRangeSignalNodeId = '';
  let timeRangePlayheadLastReportMs = 0;
  let timeRangeLastReportedCursorSec: number | null = null;
  let lastTimelineAssetId = '';
  let lastTimelineUrl = '';
  let lastTimelineDisplayFileId: string | null = null;
  let lastTimelineDisplayFileUrl: string | null = null;

  const TIME_RANGE_PLAYHEAD_REPORT_INTERVAL_MS = 250;

  const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

  const asNodeRecord = (node: NodeInstance | null | undefined): AnyRecord =>
    node ? (node as unknown as AnyRecord) : {};

  const secondsFormatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    useGrouping: false,
  });

  const formatSeconds = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return '—';
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    const rounded = Math.round(num * 100) / 100;
    return secondsFormatter.format(rounded);
  };

  const buildLocalMediaContentUrl = (
    serverUrl: string,
    filePath: string,
    kind: LocalMediaKind
  ): string | null => {
    const trimmed = serverUrl.trim();
    const p = filePath.trim();
    if (!trimmed || !p) return null;
    try {
      const base = trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
      const url = new URL('api/local-media/content', base);
      url.searchParams.set('path', p);
      url.searchParams.set('kind', kind);
      const token = localStorage.getItem('shugu-asset-read-token') ?? '';
      if (token.trim()) url.searchParams.set('token', token.trim());
      return url.toString();
    } catch {
      return null;
    }
  };

  const resolveConnectedNumber = (nodeId: string, portId: string): number | null => {
    const conn = ($graphStateStore.connections ?? []).find(
      (c: Connection) => String(c.targetNodeId) === nodeId && String(c.targetPortId) === portId
    );
    if (!conn) return null;
    const src = nodeEngine.getNode(String(conn.sourceNodeId));
    const raw = src?.outputValues?.[String(conn.sourcePortId)];
    const num = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(num) ? num : null;
  };

  const isInputConnected = (nodeId: string, portId: string): boolean =>
    ($graphStateStore.connections ?? []).some(
      (c: Connection) => String(c.targetNodeId) === nodeId && String(c.targetPortId) === portId
    );

  const readLocalNumber = (node: NodeInstance | undefined, key: string): number | null => {
    const raw = node?.inputValues?.[key];
    const num = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(num) ? num : null;
  };

  const resolveConnectedBoolean = (nodeId: string, portId: string): boolean | null => {
    const conn = ($graphStateStore.connections ?? []).find(
      (c: Connection) => String(c.targetNodeId) === nodeId && String(c.targetPortId) === portId
    );
    if (!conn) return null;
    const src = nodeEngine.getNode(String(conn.sourceNodeId));
    const raw = src?.outputValues?.[String(conn.sourcePortId)];
    if (typeof raw === 'boolean') return raw;
    const num = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(num) ? num >= 0.5 : null;
  };

  const computeEffectiveRange = (
    nodeId: string
  ): { startSec: number; endSec: number; cursorSec: number } => {
    const node = nodeEngine.getNode(nodeId);
    const startRaw =
      resolveConnectedNumber(nodeId, 'startSec') ?? readLocalNumber(node, 'startSec') ?? 0;
    const endRaw =
      resolveConnectedNumber(nodeId, 'endSec') ?? readLocalNumber(node, 'endSec') ?? -1;
    const cursorRaw =
      resolveConnectedNumber(nodeId, 'cursorSec') ?? readLocalNumber(node, 'cursorSec') ?? -1;

    const startSec = Math.max(0, startRaw);
    const endSec = endRaw >= 0 ? Math.max(startSec, endRaw) : -1;
    const cursorSec = cursorRaw >= 0 ? Math.max(0, cursorRaw) : -1;
    return { startSec, endSec, cursorSec };
  };

  const reportTimeRangePlayhead = (cursorSec: number, nowMs: number) => {
    if (!timeRangeNodeId) return;
    if (
      timeRangeNodeType !== 'load-audio-from-assets' &&
      timeRangeNodeType !== 'load-video-from-assets' &&
      timeRangeNodeType !== 'load-audio-from-local' &&
      timeRangeNodeType !== 'load-video-from-local'
    ) {
      return;
    }
    if (!Number.isFinite(cursorSec) || cursorSec < 0) return;
    if (nowMs - timeRangePlayheadLastReportMs < TIME_RANGE_PLAYHEAD_REPORT_INTERVAL_MS) return;
    timeRangePlayheadLastReportMs = nowMs;

    const rounded = Math.round(cursorSec * 1000) / 1000;
    if (
      timeRangeLastReportedCursorSec !== null &&
      Math.abs(rounded - timeRangeLastReportedCursorSec) < 0.001
    ) {
      return;
    }
    timeRangeLastReportedCursorSec = rounded;
    nodeEngine.setTimeRangePlayheadSec(timeRangeNodeId, rounded);
  };

  const clearTimeRangePlayhead = () => {
    if (timeRangeNodeId) nodeEngine.setTimeRangePlayheadSec(timeRangeNodeId, null);
    timeRangePlayheadLastReportMs = 0;
    timeRangeLastReportedCursorSec = null;
  };

  const syncTimeRangeUi = (values: { startSec: number; endSec: number; cursorSec: number }) => {
    timeRangeStartSec = values.startSec;
    timeRangeEndSec = values.endSec;
    timeRangeCursorSec = values.cursorSec;

    const maxFromAsset = timeRangeDurationSec;
    const maxFromField = isFiniteNumber(data.max) ? Number(data.max) : null;
    const maxFallback = Math.max(
      10,
      timeRangeStartSec,
      timeRangeEndSec > 0 ? timeRangeEndSec : 0,
      timeRangeCursorSec > 0 ? timeRangeCursorSec : 0
    );
    timeRangeMax = Math.max(
      timeRangeMin + timeRangeStep,
      maxFromAsset ?? maxFromField ?? maxFallback
    );

    const clamp = (v: number) => Math.max(timeRangeMin, Math.min(timeRangeMax, v));
    timeRangeSliderStart = clamp(timeRangeStartSec);
    timeRangeEffectiveEndSec =
      timeRangeEndSec < 0 ? (timeRangeDurationSec ?? null) : timeRangeEndSec;
    timeRangeSliderEnd = timeRangeEndSec < 0 ? timeRangeMax : clamp(timeRangeEndSec);
    if (timeRangeSliderEnd < timeRangeSliderStart) timeRangeSliderEnd = timeRangeSliderStart;

    const cursorFallback = timeRangeCursorSec >= 0 ? timeRangeCursorSec : timeRangeStartSec;
    const nextCursor = clamp(cursorFallback);
    if (!timeRangeIsPlaying) {
      timeRangeSliderCursor = nextCursor;
      timeRangePlaybackCursorSec = nextCursor;
    }
    if (timeRangeSliderCursor < timeRangeSliderStart) timeRangeSliderCursor = timeRangeSliderStart;
    if (timeRangeSliderCursor > timeRangeSliderEnd) timeRangeSliderCursor = timeRangeSliderEnd;

    const span = timeRangeMax - timeRangeMin;
    timeRangeStartFrac = span > 0 ? (timeRangeSliderStart - timeRangeMin) / span : 0;
    timeRangeEndFrac = span > 0 ? (timeRangeSliderEnd - timeRangeMin) / span : 1;
    timeRangeCursorFrac = span > 0 ? (timeRangeSliderCursor - timeRangeMin) / span : 0;
  };

  function stopTimeRangePlayback(): void {
    if (timeRangePlaybackRaf !== null) {
      cancelAnimationFrame(timeRangePlaybackRaf);
      timeRangePlaybackRaf = null;
    }
    timeRangePlaybackLastMs = 0;
    clearTimeRangePlayhead();
  }

  function startTimeRangePlayback(): void {
    stopTimeRangePlayback();
    timeRangePlaybackCursorSec = timeRangeCursorSec >= 0 ? timeRangeCursorSec : timeRangeStartSec;
    timeRangePlaybackLastMs = performance.now();
    reportTimeRangePlayhead(timeRangePlaybackCursorSec, timeRangePlaybackLastMs);

    const frame = (nowMs: number) => {
      const dt = Math.max(0, nowMs - timeRangePlaybackLastMs);
      timeRangePlaybackLastMs = nowMs;

      const start = timeRangeStartSec;
      const endRaw =
        timeRangeEndSec < 0 ? (timeRangeEffectiveEndSec ?? timeRangeMax) : timeRangeEndSec;
      const end = Math.max(start, endRaw);
      const span = Math.max(0.0001, end - start);
      const dir = timeRangeReverseEnabled ? -1 : 1;
      timeRangePlaybackCursorSec += (dir * dt) / 1000;

      if (!timeRangeLoopEnabled) {
        timeRangePlaybackCursorSec = Math.max(start, Math.min(end, timeRangePlaybackCursorSec));
      } else {
        while (timeRangePlaybackCursorSec > end) timeRangePlaybackCursorSec -= span;
        while (timeRangePlaybackCursorSec < start) timeRangePlaybackCursorSec += span;
      }

      timeRangeSliderCursor = Math.max(
        timeRangeSliderStart,
        Math.min(timeRangeSliderEnd, timeRangePlaybackCursorSec)
      );
      const fullSpan = timeRangeMax - timeRangeMin;
      timeRangeCursorFrac = fullSpan > 0 ? (timeRangeSliderCursor - timeRangeMin) / fullSpan : 0;
      reportTimeRangePlayhead(timeRangeSliderCursor, nowMs);

      if (timeRangeIsPlaying) timeRangePlaybackRaf = requestAnimationFrame(frame);
      else stopTimeRangePlayback();
    };

    timeRangePlaybackRaf = requestAnimationFrame(frame);
  }

  const revokeTimelineDisplayUrl = () => {
    if (!lastTimelineDisplayFileUrl) return;
    try {
      URL.revokeObjectURL(lastTimelineDisplayFileUrl);
    } catch {
      // ignore
    }
    lastTimelineDisplayFileUrl = null;
    lastTimelineDisplayFileId = null;
  };

  onDestroy(() => {
    stopTimeRangePlayback();
    revokeTimelineDisplayUrl();
  });

  $: {
    const _tick = $tickTimeStore;
    void _tick;
    const isEngineRunning = $isRunningStore;

    timeRangeNodeId = String(data?.nodeId ?? '');
    timeRangeNodeType = String(data?.nodeType ?? '');

    if (timeRangeNodeId !== timeRangeSignalNodeId) {
      timeRangeSignalNodeId = timeRangeNodeId;
      timeRangeLastPlayRequested = null;
      timeRangeStartSeqBase = null;
    }

    const { startSec, endSec, cursorSec } = computeEffectiveRange(timeRangeNodeId);
    timeRangeMin = isFiniteNumber(data.min) ? Number(data.min) : 0;
    timeRangeStep = isFiniteNumber(data.step) ? Number(data.step) : 0.01;

    const runtimeNode = timeRangeNodeId ? nodeEngine.getNode(timeRangeNodeId) : null;
    const runtimeRecord = asNodeRecord(runtimeNode);
    const runtimeConfig = (runtimeRecord.config && typeof runtimeRecord.config === 'object'
      ? runtimeRecord.config
      : {}) as AnyRecord;
    const runtimeInputs = (runtimeRecord.inputValues && typeof runtimeRecord.inputValues === 'object'
      ? runtimeRecord.inputValues
      : {}) as AnyRecord;
    const assetId =
      typeof runtimeConfig.assetId === 'string'
        ? String(runtimeConfig.assetId).trim()
        : '';
    const localAssetPath =
      typeof runtimeConfig.assetPath === 'string'
        ? String(runtimeConfig.assetPath).trim()
        : '';

    const timelineAssetKey =
      timeRangeNodeType === 'load-audio-from-assets' ||
      timeRangeNodeType === 'load-video-from-assets'
        ? assetId
        : localAssetPath;

    if (timelineAssetKey !== lastTimelineAssetId) {
      lastTimelineAssetId = timelineAssetKey;
      timeRangeDurationSec = null;
      timeRangeBackdropUrl = null;
      lastTimelineUrl = '';
      revokeTimelineDisplayUrl();
    }

    const serverUrl = localStorage.getItem('shugu-server-url') ?? '';
    const contentUrl = (() => {
      if (
        timeRangeNodeType === 'load-audio-from-assets' ||
        timeRangeNodeType === 'load-video-from-assets'
      ) {
        return assetId ? buildAssetContentUrl(serverUrl, assetId) : null;
      }
      const kind: LocalMediaKind | null =
        timeRangeNodeType === 'load-video-from-local'
          ? 'video'
          : timeRangeNodeType === 'load-audio-from-local'
            ? 'audio'
            : null;
      if (!kind || !localAssetPath) return null;
      if (isDisplayFileRef(localAssetPath)) {
        const id = parseDisplayFileId(localAssetPath);
        if (!id) return null;
        const entry = localDisplayMediaStore.getFileById(id);
        if (!entry?.file) return null;
        if (lastTimelineDisplayFileId !== id || !lastTimelineDisplayFileUrl) {
          revokeTimelineDisplayUrl();
          lastTimelineDisplayFileId = id;
          lastTimelineDisplayFileUrl = URL.createObjectURL(entry.file);
        }
        return lastTimelineDisplayFileUrl;
      }
      return buildLocalMediaContentUrl(serverUrl, localAssetPath, kind);
    })();

    if (contentUrl && contentUrl !== lastTimelineUrl) {
      lastTimelineUrl = contentUrl;
      void (async () => {
        const kind: 'video' | 'audio' =
          timeRangeNodeType === 'load-video-from-assets' ||
          timeRangeNodeType === 'load-video-from-local'
            ? 'video'
            : 'audio';
        const duration = await getMediaDurationSec(contentUrl, kind);
        if (duration !== null && contentUrl === lastTimelineUrl) {
          timeRangeDurationSec = duration;
          if (
            kind === 'video' &&
            timeRangeNodeId &&
            (timeRangeNodeType === 'load-video-from-assets' ||
              timeRangeNodeType === 'load-video-from-local') &&
            !isInputConnected(timeRangeNodeId, 'endSec')
          ) {
            const node = nodeEngine.getNode(timeRangeNodeId);
            const endStored = readLocalNumber(node, 'endSec') ?? -1;
            if (endStored < 0) {
              const rounded = Math.round(duration * 100) / 100;
              nodeEngine.updateNodeInputValue(timeRangeNodeId, 'endSec', rounded);
            }
          }
        }
        if (kind === 'audio') {
          const bg = await getAudioSpectrogramDataUrl(contentUrl, {
            width: 360,
            height: 84,
            fftSize: 1024,
          });
          if (bg && contentUrl === lastTimelineUrl) timeRangeBackdropUrl = bg;
        }
      })();
    }

    const playRaw =
      resolveConnectedBoolean(timeRangeNodeId, 'play') ??
      (() => {
        const raw = runtimeInputs.play;
        if (typeof raw === 'boolean') return raw;
        const num = typeof raw === 'number' ? raw : Number(raw);
        return Number.isFinite(num) ? num >= 0.5 : false;
      })();
    const loopRaw =
      resolveConnectedBoolean(timeRangeNodeId, 'loop') ??
      (() => {
        const raw = runtimeInputs.loop;
        if (typeof raw === 'boolean') return raw;
        const num = typeof raw === 'number' ? raw : Number(raw);
        return Number.isFinite(num) ? num >= 0.5 : false;
      })();
    const reverseRaw =
      resolveConnectedBoolean(timeRangeNodeId, 'reverse') ??
      (() => {
        const raw = runtimeInputs.reverse;
        if (typeof raw === 'boolean') return raw;
        const num = typeof raw === 'number' ? raw : Number(raw);
        return Number.isFinite(num) ? num >= 0.5 : false;
      })();

    timeRangeIsPlaying = Boolean(playRaw);
    timeRangeLoopEnabled = Boolean(loopRaw);
    timeRangeReverseEnabled = Boolean(reverseRaw);
    if (
      timeRangeNodeType === 'load-audio-from-assets' ||
      timeRangeNodeType === 'load-video-from-assets' ||
      timeRangeNodeType === 'load-audio-from-local' ||
      timeRangeNodeType === 'load-video-from-local'
    ) {
      const inputHasAsset = ($graphStateStore.connections ?? []).some(
        (c: Connection) =>
          String(c.targetNodeId) === timeRangeNodeId && String(c.targetPortId) === 'asset'
      );
      const localInputValue =
        typeof runtimeInputs.asset === 'string'
          ? String(runtimeInputs.asset).trim()
          : '';
      const hasAsset =
        timeRangeNodeType === 'load-audio-from-assets' ||
        timeRangeNodeType === 'load-video-from-assets'
          ? Boolean(assetId)
          : Boolean(localAssetPath || localInputValue || inputHasAsset);
      const signal = $nodeMediaSignals.get(timeRangeNodeId);
      const startedSeq = typeof signal?.startedSeq === 'number' ? signal.startedSeq : 0;
      const playRequested = Boolean(playRaw);
      if (timeRangeLastPlayRequested === null) {
        timeRangeLastPlayRequested = playRequested;
        timeRangeStartSeqBase = playRequested ? 0 : null;
      } else if (!playRequested) {
        timeRangeLastPlayRequested = false;
        timeRangeStartSeqBase = null;
      } else if (playRequested && !timeRangeLastPlayRequested) {
        timeRangeLastPlayRequested = true;
        timeRangeStartSeqBase = startedSeq;
      }

      const needsStartedSeq = timeRangeStartSeqBase ?? 0;
      const hasStartedSignal = playRequested && startedSeq > needsStartedSeq;
      timeRangeIsPlaying =
        timeRangeIsPlaying && hasAsset && Boolean(isEngineRunning) && hasStartedSignal;
    }

    syncTimeRangeUi({ startSec, endSec, cursorSec });
  }

  $: if (timeRangeIsPlaying) {
    if (timeRangePlaybackRaf === null) startTimeRangePlayback();
  } else {
    stopTimeRangePlayback();
  }

  const setTimeRange = (startSec: number, endSec: number, cursorSec: number) => {
    if (data?.readonly) return;
    const start = Math.max(timeRangeMin, startSec);
    const end = endSec >= 0 ? Math.max(start, endSec) : -1;
    const cursor = cursorSec >= 0 ? Math.max(start, cursorSec) : -1;
    data.setValue?.({ startSec: start, endSec: end, cursorSec: cursor });
  };

  const handleTimeRangeStartSlider = (event: Event) => {
    const target = event.target as HTMLInputElement;
    const n = Number(target.value);
    if (!Number.isFinite(n)) return;
    const nextStart = Math.max(timeRangeMin, n);
    const nextEnd = timeRangeEndSec >= 0 ? Math.max(nextStart, timeRangeEndSec) : -1;
    const nextCursor =
      timeRangeCursorSec >= 0
        ? Math.max(nextStart, Math.min(timeRangeSliderEnd, timeRangeSliderCursor))
        : -1;
    syncTimeRangeUi({ startSec: nextStart, endSec: nextEnd, cursorSec: nextCursor });
    setTimeRange(nextStart, nextEnd, nextCursor);
  };

  const handleTimeRangeEndSlider = (event: Event) => {
    const target = event.target as HTMLInputElement;
    const n = Number(target.value);
    if (!Number.isFinite(n)) return;
    const nearEnd = Math.abs(n - timeRangeMax) <= timeRangeStep * 0.5;
    const nextEnd = nearEnd ? -1 : Math.max(timeRangeStartSec, Math.max(timeRangeMin, n));
    const nextCursor =
      timeRangeCursorSec >= 0
        ? Math.min(
            nextEnd >= 0 ? nextEnd : timeRangeMax,
            Math.max(timeRangeStartSec, timeRangeSliderCursor)
          )
        : -1;
    syncTimeRangeUi({ startSec: timeRangeStartSec, endSec: nextEnd, cursorSec: nextCursor });
    setTimeRange(timeRangeStartSec, nextEnd, nextCursor);
  };

  const handleTimeRangeCursorSlider = (event: Event) => {
    const target = event.target as HTMLInputElement;
    const n = Number(target.value);
    if (!Number.isFinite(n)) return;
    const next = Math.max(timeRangeStartSec, Math.min(timeRangeSliderEnd, n));
    timeRangePlaybackCursorSec = next;
    timeRangeSliderCursor = next;
    const span = timeRangeMax - timeRangeMin;
    timeRangeCursorFrac = span > 0 ? (timeRangeSliderCursor - timeRangeMin) / span : 0;
    setTimeRange(timeRangeStartSec, timeRangeEndSec, next);
  };
</script>

<div class="time-range {isInline ? 'inline' : ''}">
  {#if hasLabel}
    <div class="control-label">{data.label}</div>
  {/if}

  <div class="time-range-row">
    <div class="time-range-kv" aria-hidden="true">
      <div class="time-range-k">Start</div>
      <div class="time-range-v">{formatSeconds(timeRangeStartSec)}s</div>
    </div>

    <div class="time-range-kv" aria-hidden="true">
      <div class="time-range-k">End</div>
      <div class="time-range-v">
        {#if timeRangeEffectiveEndSec !== null}
          {formatSeconds(timeRangeEffectiveEndSec)}s
        {:else if timeRangeEndSec < 0}
          (end)
        {:else}
          {formatSeconds(timeRangeEndSec)}s
        {/if}
      </div>
    </div>

    <div class="time-range-kv" aria-hidden="true">
      <div class="time-range-k">Duration</div>
      <div class="time-range-v">
        {#if timeRangeDurationSec !== null}
          {formatSeconds(timeRangeDurationSec)}s
        {:else}
          —
        {/if}
      </div>
    </div>

    <div class="time-range-kv" aria-hidden="true">
      <div class="time-range-k">Current</div>
      <div class="time-range-v">{formatSeconds(timeRangeSliderCursor)}s</div>
    </div>
  </div>

  <div
    class="time-range-slider"
    on:pointerdown|stopPropagation
    style="background-image: {timeRangeBackdropUrl ? `url('${timeRangeBackdropUrl}')` : 'none'};"
  >
    <div
      class="time-range-highlight"
      style="left: calc(10px + (100% - 20px) * {timeRangeStartFrac}); width: calc((100% - 20px) * {Math.max(
        0,
        timeRangeEndFrac - timeRangeStartFrac
      )});"
    />
    <div
      class="time-range-cursor"
      style="left: calc(10px + (100% - 20px) * {timeRangeCursorFrac});"
      aria-hidden="true"
    />
    <input
      class="time-range-slider-input start"
      type="range"
      min={timeRangeMin}
      max={timeRangeMax}
      step={timeRangeStep}
      value={timeRangeSliderStart}
      disabled={data.readonly}
      on:input={handleTimeRangeStartSlider}
    />
    <input
      class="time-range-slider-input end"
      type="range"
      min={timeRangeMin}
      max={timeRangeMax}
      step={timeRangeStep}
      value={timeRangeSliderEnd}
      disabled={data.readonly}
      on:input={handleTimeRangeEndSlider}
    />
    <input
      class="time-range-slider-input cursor"
      type="range"
      min={timeRangeMin}
      max={timeRangeMax}
      step={timeRangeStep}
      value={timeRangeSliderCursor}
      disabled={data.readonly}
      on:input={handleTimeRangeCursorSlider}
    />
  </div>
</div>

<style>
  .control-label {
    font-size: 11px;
    letter-spacing: 0.2px;
    color: rgba(255, 255, 255, 0.72);
  }

  .time-range {
    padding: 6px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .time-range-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    align-items: end;
  }

  .time-range-kv {
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(2, 6, 23, 0.25);
    border-radius: 10px;
    padding: 6px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .time-range-k {
    font-size: 10px;
    letter-spacing: 0.2px;
    color: rgba(255, 255, 255, 0.55);
  }

  .time-range-v {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 650;
    color: rgba(255, 255, 255, 0.9);
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .time-range-slider {
    position: relative;
    height: 84px;
    padding: 0 2px;
    border-radius: 10px;
    background-color: rgba(2, 6, 23, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    overflow: hidden;
    background-size: cover;
    background-position: center;
  }

  .time-range-highlight {
    position: absolute;
    height: 6px;
    border-radius: 999px;
    background: rgba(14, 165, 233, 0.7);
    bottom: 10px;
    pointer-events: none;
  }

  .time-range-cursor {
    position: absolute;
    top: 8px;
    bottom: 8px;
    width: 2px;
    background: rgba(255, 255, 255, 0.85);
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.35);
    pointer-events: none;
  }

  .time-range-slider-input {
    -webkit-appearance: none;
    appearance: none;
    position: absolute;
    left: 10px;
    right: 10px;
    width: calc(100% - 20px);
    height: 84px;
    background: transparent;
    pointer-events: none;
  }

  .time-range-slider-input::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    pointer-events: auto;
    width: 16px;
    height: 16px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.92);
    border: 2px solid rgba(14, 165, 233, 0.95);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  }

  .time-range-slider-input::-moz-range-thumb {
    pointer-events: auto;
    width: 16px;
    height: 16px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.92);
    border: 2px solid rgba(14, 165, 233, 0.95);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  }

  .time-range-slider-input::-webkit-slider-runnable-track {
    height: 6px;
    background: rgba(255, 255, 255, 0.12);
    border-radius: 999px;
  }

  .time-range-slider-input::-moz-range-track {
    height: 6px;
    background: rgba(255, 255, 255, 0.12);
    border-radius: 999px;
  }

  .time-range-slider-input.cursor::-webkit-slider-thumb {
    width: 10px;
    height: 18px;
    border-radius: 6px;
    border-color: rgba(255, 255, 255, 0.9);
    background: rgba(255, 255, 255, 0.9);
  }

  .time-range-slider-input.cursor::-moz-range-thumb {
    width: 10px;
    height: 18px;
    border-radius: 6px;
    border-color: rgba(255, 255, 255, 0.9);
    background: rgba(255, 255, 255, 0.9);
  }
</style>
