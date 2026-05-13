/**
 * Purpose: Time-based numeric smoothing and script node definitions.
 */
import type { NodeDefinition } from '../../../types.js';
import { coerceBoolean } from '../../utils.js';

type StabilizerState = {
  value: number;
  target: number;
  startValue: number;
  startTime: number;
  durationMs: number;
};

const stabilizerState = new Map<string, StabilizerState>();

export function createNumberStabilizerNode(): NodeDefinition {
  return {
    type: 'number-stabilizer',
    label: 'Number Stabilizer',
    category: 'Logic',
    inputs: [
      { id: 'in', label: 'In', type: 'number', defaultValue: 0 },
      { id: 'smoothing', label: 'Smoothing', type: 'number' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'number' }],
    configSchema: [
      {
        key: 'smoothing',
        label: 'Smoothing',
        type: 'number',
        defaultValue: 0.2,
        min: 0,
        max: 2000,
        step: 10,
      },
    ],
    process: (inputs, config, context) => {
      const raw = inputs.in;
      const smoothingFromInput = inputs.smoothing;
      const smoothingRaw =
        typeof smoothingFromInput === 'number'
          ? smoothingFromInput
          : Number(config.smoothing ?? 0.2);
      const smoothingFinite = Number.isFinite(smoothingRaw) ? smoothingRaw : 0.2;
      // Backward-compat: if smoothing <= 1, treat it as normalized smoothing (0..1),
      // otherwise interpret it as an explicit duration in ms.
      const durationMs =
        smoothingFinite <= 1
          ? 50 + Math.max(0, Math.min(1, smoothingFinite)) * 950
          : Math.max(0, smoothingFinite);

      const inputValue = typeof raw === 'number' && Number.isFinite(raw) ? (raw as number) : 0;

      const prev = stabilizerState.get(context.nodeId);
      if (!prev) {
        const initial: StabilizerState = {
          value: inputValue,
          target: inputValue,
          startValue: inputValue,
          startTime: context.time,
          durationMs,
        };
        stabilizerState.set(context.nodeId, initial);
        return { out: initial.value };
      }

      if (inputValue !== prev.target || durationMs !== prev.durationMs) {
        prev.startValue = prev.value;
        prev.target = inputValue;
        prev.startTime = context.time;
        prev.durationMs = durationMs;
      }

      const elapsed = Math.max(0, context.time - prev.startTime);
      const t = prev.durationMs <= 0 ? 1 : Math.max(0, Math.min(1, elapsed / prev.durationMs));
      prev.value = prev.startValue + (prev.target - prev.startValue) * t;
      stabilizerState.set(context.nodeId, prev);
      return { out: prev.value };
    },
  };
}

// Cubic bezier value: [x1, y1, x2, y2] where start is (0,0) and end is (1,1)
type BezierValue = [number, number, number, number];

type NumberScriptState = {
  running: boolean;
  /** Accumulated progress in milliseconds */
  elapsedMs: number;
  /** Direction: 1 = forward (start->end), -1 = backward (end->start) */
  direction: 1 | -1;
  /** Whether we just signaled `finished` (rising edge) */
  justFinished: boolean;
  /** Last observed boolean value for edge detection */
  lastRun: boolean;
};

const numberScriptState = new Map<string, NumberScriptState>();

/**
 * Evaluate a cubic bezier curve at normalized time `t` (0..1).
 * Uses Newton-Raphson method to find t for a given x, then returns y.
 */
function evaluateBezier(bezier: BezierValue, t: number): number {
  const x = Math.max(0, Math.min(1, t));

  const x1 = bezier[0],
    y1 = bezier[1],
    x2 = bezier[2],
    y2 = bezier[3];

  const sampleCurveX = (curveT: number) =>
    ((1 - 3 * x2 + 3 * x1) * curveT + (3 * x2 - 6 * x1)) * curveT * curveT +
    3 * x1 * curveT;
  const sampleCurveY = (curveT: number) =>
    ((1 - 3 * y2 + 3 * y1) * curveT + (3 * y2 - 6 * y1)) * curveT * curveT +
    3 * y1 * curveT;
  const sampleCurveDerivativeX = (curveT: number) =>
    (3 * (1 - 3 * x2 + 3 * x1) * curveT + 2 * (3 * x2 - 6 * x1)) * curveT +
    3 * x1;

  let guessT = x;
  for (let i = 0; i < 8; i += 1) {
    const currentX = sampleCurveX(guessT) - x;
    if (Math.abs(currentX) < 1e-6) break;
    const derivative = sampleCurveDerivativeX(guessT);
    if (Math.abs(derivative) < 1e-6) break;
    guessT -= currentX / derivative;
    guessT = Math.max(0, Math.min(1, guessT));
  }

  return sampleCurveY(guessT);
}

export function createNumberScriptNode(): NodeDefinition {
  return {
    type: 'number-script',
    label: 'Number Script',
    category: 'Logic',
    inputs: [
      { id: 'run', label: 'Run', type: 'boolean', defaultValue: false },
      { id: 'loop', label: 'Loop', type: 'string' },
      { id: 'duration', label: 'Duration (ms)', type: 'number', defaultValue: 1000, min: 1 },
      { id: 'start', label: 'Start', type: 'number', defaultValue: 0 },
      { id: 'end', label: 'End', type: 'number', defaultValue: 1 },
    ],
    outputs: [
      { id: 'value', label: 'Value', type: 'number' },
      { id: 'running', label: 'Running', type: 'boolean' },
      { id: 'finished', label: 'Finished', type: 'boolean' },
    ],
    configSchema: [
      {
        key: 'loop',
        label: 'Loop',
        type: 'select',
        defaultValue: 'once',
        options: [
          { value: 'once', label: 'Once' },
          { value: 'one-way', label: 'One-way (repeat)' },
          { value: 'around', label: 'Around (ping-pong)' },
        ],
      },
      { key: 'duration', label: 'Duration (ms)', type: 'number', defaultValue: 1000, min: 1 },
      { key: 'start', label: 'Start', type: 'number', defaultValue: 0 },
      { key: 'end', label: 'End', type: 'number', defaultValue: 1 },
      {
        key: 'curve',
        label: 'Curve',
        type: 'curve',
        defaultValue: [0.25, 0.1, 0.25, 1.0],
      },
    ],
    process: (inputs, config, context) => {
      const run = coerceBoolean(inputs.run);
      const loopRaw = inputs.loop;
      const loop =
        typeof loopRaw === 'string' && loopRaw.trim()
          ? loopRaw.trim()
          : String(config.loop ?? 'once');

      const durationRaw = inputs.duration;
      const durationMs =
        typeof durationRaw === 'number' && Number.isFinite(durationRaw)
          ? durationRaw
          : Number(config.duration ?? 1000);
      const duration = Math.max(1, Number.isFinite(durationMs) ? durationMs : 1000);

      const startRaw = inputs.start;
      const startValue =
        typeof startRaw === 'number' && Number.isFinite(startRaw)
          ? startRaw
          : Number(config.start ?? 0);
      const start = Number.isFinite(startValue) ? startValue : 0;

      const endRaw = inputs.end;
      const endValue =
        typeof endRaw === 'number' && Number.isFinite(endRaw) ? endRaw : Number(config.end ?? 1);
      const end = Number.isFinite(endValue) ? endValue : 1;

      const curveRaw = config.curve;
      const bezier: BezierValue =
        Array.isArray(curveRaw) &&
        curveRaw.length === 4 &&
        curveRaw.every((v) => typeof v === 'number' && Number.isFinite(v))
          ? (curveRaw as BezierValue)
          : [0.25, 0.1, 0.25, 1.0];

      let state = numberScriptState.get(context.nodeId);
      if (!state) {
        state = {
          running: false,
          elapsedMs: 0,
          direction: 1,
          justFinished: false,
          lastRun: false,
        };
        numberScriptState.set(context.nodeId, state);
      }

      state.justFinished = false;
      const rising = run && !state.lastRun;
      const falling = !run && state.lastRun;
      state.lastRun = run;

      if (rising && !state.running) {
        state.running = true;
        state.elapsedMs = 0;
        state.direction = 1;
      }

      if (falling && state.running) {
        state.running = false;
      }

      if (!state.running) {
        const outputValue = state.direction === 1 ? start : end;
        return { value: outputValue, running: false, finished: false };
      }

      state.elapsedMs += context.deltaTime;
      let t = duration > 0 ? state.elapsedMs / duration : 1;
      if (t >= 1) {
        switch (loop) {
          case 'once':
            t = 1;
            state.running = false;
            state.justFinished = true;
            break;
          case 'one-way':
            state.elapsedMs = state.elapsedMs % duration;
            t = duration > 0 ? state.elapsedMs / duration : 0;
            state.justFinished = true;
            break;
          case 'around':
            state.elapsedMs = state.elapsedMs % duration;
            t = duration > 0 ? state.elapsedMs / duration : 0;
            state.direction = state.direction === 1 ? -1 : 1;
            state.justFinished = true;
            break;
          default:
            t = 1;
            state.running = false;
            state.justFinished = true;
        }
      }

      const effectiveT = state.direction === 1 ? t : 1 - t;
      const value = start + evaluateBezier(bezier, effectiveT) * (end - start);

      numberScriptState.set(context.nodeId, state);
      return {
        value,
        running: state.running,
        finished: state.justFinished,
      };
    },
  };
}
