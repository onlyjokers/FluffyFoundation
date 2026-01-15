/**
 * Purpose: Logic/math/control-flow node definitions.
 */
import type { NodeDefinition } from '../../types.js';
import { coerceBoolean } from '../utils.js';

export function createArrayFilterNode(): NodeDefinition {
  return {
    type: 'array-filter',
    label: 'Array Filter',
    category: 'Logic',
    inputs: [
      { id: 'a', label: 'A', type: 'array' },
      { id: 'b', label: 'B', type: 'array' },
    ],
    outputs: [{ id: 'difference', label: 'Difference', type: 'array' }],
    configSchema: [],
    process: (inputs) => {
      const a = Array.isArray(inputs.a) ? inputs.a : [];
      const b = Array.isArray(inputs.b) ? inputs.b : [];
      const bSet = new Set(b.map(String));
      const difference = a.filter((item) => !bSet.has(String(item)));
      return { difference };
    },
  };
}

export function createMathNode(): NodeDefinition {
  return {
    type: 'math',
    label: 'Math',
    category: 'Logic',
    inputs: [
      { id: 'a', label: 'A', type: 'number', defaultValue: 0 },
      { id: 'b', label: 'B', type: 'number', defaultValue: 0 },
      { id: 'operation', label: 'Operation', type: 'string' },
    ],
    outputs: [{ id: 'result', label: 'Result', type: 'number' }],
    configSchema: [
      {
        key: 'operation',
        label: 'Operation',
        type: 'select',
        defaultValue: '+',
        options: [
          { value: '+', label: 'Add (+)' },
          { value: '-', label: 'Subtract (-)' },
          { value: '*', label: 'Multiply (×)' },
          { value: '/', label: 'Divide (÷)' },
          { value: 'min', label: 'Min' },
          { value: 'max', label: 'Max' },
          { value: 'mod', label: 'Modulo (%)' },
          { value: 'pow', label: 'Power (^)' },
        ],
      },
    ],
    process: (inputs, config) => {
      const a = (inputs.a as number) ?? 0;
      const b = (inputs.b as number) ?? 0;
      const op = (() => {
        const fromInput = inputs.operation;
        if (typeof fromInput === 'string' && fromInput.trim()) return fromInput.trim();
        return String(config.operation ?? '+');
      })();

      let result: number;
      switch (op) {
        case '+':
          result = a + b;
          break;
        case '-':
          result = a - b;
          break;
        case '*':
          result = a * b;
          break;
        case '/':
          result = b !== 0 ? a / b : 0;
          break;
        case 'min':
          result = Math.min(a, b);
          break;
        case 'max':
          result = Math.max(a, b);
          break;
        case 'mod':
          result = b !== 0 ? a % b : 0;
          break;
        case 'pow':
          result = Math.pow(a, b);
          break;
        default:
          result = a + b;
      }

      return { result };
    },
  };
}

export function createLogicAddNode(): NodeDefinition {
  return {
    type: 'logic-add',
    label: 'Add',
    category: 'Logic',
    inputs: [
      { id: 'number', label: 'Number', type: 'number', defaultValue: 0 },
      { id: 'any', label: 'Any', type: 'any' },
    ],
    outputs: [
      { id: 'number', label: 'Number', type: 'number' },
      { id: 'any', label: 'Any', type: 'any' },
    ],
    configSchema: [],
    process: (inputs) => {
      const raw = inputs.number;
      const numberValue = typeof raw === 'number' && Number.isFinite(raw) ? raw : Number(raw ?? 0);
      return {
        // Add 1 to the number input on every pass, regardless of which port triggered upstream.
        number: (Number.isFinite(numberValue) ? numberValue : 0) + 1,
        any: inputs.any,
      };
    },
  };
}

export function createLogicMultipleNode(): NodeDefinition {
  return {
    type: 'logic-multiple',
    label: 'Multiple',
    category: 'Logic',
    inputs: [
      { id: 'number', label: 'Number', type: 'number', defaultValue: 0 },
      { id: 'any', label: 'Any', type: 'any' },
    ],
    outputs: [
      { id: 'number', label: 'Number', type: 'number' },
      { id: 'any', label: 'Any', type: 'any' },
    ],
    configSchema: [],
    process: (inputs) => {
      const raw = inputs.number;
      const numberValue = typeof raw === 'number' && Number.isFinite(raw) ? raw : Number(raw ?? 0);
      return {
        number: (Number.isFinite(numberValue) ? numberValue : 0) * 1,
        any: inputs.any,
      };
    },
  };
}

export function createLogicSubtractNode(): NodeDefinition {
  return {
    type: 'logic-subtract',
    label: 'Subtract',
    category: 'Logic',
    inputs: [
      { id: 'number', label: 'Number', type: 'number', defaultValue: 0 },
      { id: 'any', label: 'Any', type: 'any' },
    ],
    outputs: [
      { id: 'number', label: 'Number', type: 'number' },
      { id: 'any', label: 'Any', type: 'any' },
    ],
    configSchema: [],
    process: (inputs) => {
      const raw = inputs.number;
      const numberValue = typeof raw === 'number' && Number.isFinite(raw) ? raw : Number(raw ?? 0);
      return {
        number: (Number.isFinite(numberValue) ? numberValue : 0) - 1,
        any: inputs.any,
      };
    },
  };
}

export function createLogicDivideNode(): NodeDefinition {
  return {
    type: 'logic-divide',
    label: 'Divide',
    category: 'Logic',
    inputs: [
      { id: 'number', label: 'Number', type: 'number', defaultValue: 0 },
      { id: 'any', label: 'Any', type: 'any' },
    ],
    outputs: [
      { id: 'number', label: 'Number', type: 'number' },
      { id: 'any', label: 'Any', type: 'any' },
    ],
    configSchema: [],
    process: (inputs) => {
      const raw = inputs.number;
      const numberValue = typeof raw === 'number' && Number.isFinite(raw) ? raw : Number(raw ?? 0);
      return {
        number: (Number.isFinite(numberValue) ? numberValue : 0) / 1,
        any: inputs.any,
      };
    },
  };
}

export function createLogicNumberToBooleanNode(): NodeDefinition {
  return {
    type: 'logic-number-to-boolean',
    label: 'Number to Boolean',
    category: 'Logic',
    inputs: [
      { id: 'number', label: 'Number', type: 'number', defaultValue: 0 },
      { id: 'trigger', label: 'Trigger', type: 'number', defaultValue: 0.5 },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'boolean' }],
    configSchema: [],
    process: (inputs) => {
      const numberRaw = inputs.number;
      const triggerRaw = inputs.trigger;
      const numberValue =
        typeof numberRaw === 'number' && Number.isFinite(numberRaw)
          ? numberRaw
          : Number(numberRaw ?? 0);
      const triggerValue =
        typeof triggerRaw === 'number' && Number.isFinite(triggerRaw)
          ? triggerRaw
          : Number(triggerRaw ?? 0.5);
      const threshold = Number.isFinite(triggerValue) ? triggerValue : 0.5;
      const current = Number.isFinite(numberValue) ? numberValue : 0;
      return { out: current >= threshold };
    },
  };
}

// Gate: invert a boolean (NOT gate).
export function createLogicNotNode(): NodeDefinition {
  return {
    type: 'logic-not',
    label: 'NOT',
    category: 'Gate',
    inputs: [{ id: 'in', label: 'In', type: 'boolean', defaultValue: false }],
    outputs: [{ id: 'out', label: 'Out', type: 'boolean' }],
    configSchema: [],
    process: (inputs) => ({ out: !coerceBoolean(inputs.in) }),
  };
}

export function createLogicAndNode(): NodeDefinition {
  return {
    type: 'logic-and',
    label: 'AND',
    category: 'Gate',
    inputs: [
      { id: 'a', label: 'A', type: 'boolean', defaultValue: false },
      { id: 'b', label: 'B', type: 'boolean', defaultValue: false },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'boolean' }],
    configSchema: [],
    process: (inputs) => ({ out: coerceBoolean(inputs.a) && coerceBoolean(inputs.b) }),
  };
}

export function createLogicOrNode(): NodeDefinition {
  return {
    type: 'logic-or',
    label: 'OR',
    category: 'Gate',
    inputs: [
      { id: 'a', label: 'A', type: 'boolean', defaultValue: false },
      { id: 'b', label: 'B', type: 'boolean', defaultValue: false },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'boolean' }],
    configSchema: [],
    process: (inputs) => ({ out: coerceBoolean(inputs.a) || coerceBoolean(inputs.b) }),
  };
}

export function createLogicXorNode(): NodeDefinition {
  return {
    type: 'logic-xor',
    label: 'XOR',
    category: 'Gate',
    inputs: [
      { id: 'a', label: 'A', type: 'boolean', defaultValue: false },
      { id: 'b', label: 'B', type: 'boolean', defaultValue: false },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'boolean' }],
    configSchema: [],
    process: (inputs) => ({ out: coerceBoolean(inputs.a) !== coerceBoolean(inputs.b) }),
  };
}

export function createLogicNandNode(): NodeDefinition {
  return {
    type: 'logic-nand',
    label: 'NAND',
    category: 'Gate',
    inputs: [
      { id: 'a', label: 'A', type: 'boolean', defaultValue: false },
      { id: 'b', label: 'B', type: 'boolean', defaultValue: false },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'boolean' }],
    configSchema: [],
    process: (inputs) => ({ out: !(coerceBoolean(inputs.a) && coerceBoolean(inputs.b)) }),
  };
}

export function createLogicNorNode(): NodeDefinition {
  return {
    type: 'logic-nor',
    label: 'NOR',
    category: 'Gate',
    inputs: [
      { id: 'a', label: 'A', type: 'boolean', defaultValue: false },
      { id: 'b', label: 'B', type: 'boolean', defaultValue: false },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'boolean' }],
    configSchema: [],
    process: (inputs) => ({ out: !(coerceBoolean(inputs.a) || coerceBoolean(inputs.b)) }),
  };
}

export function createLogicIfNode(): NodeDefinition {
  return {
    type: 'logic-if',
    label: 'if',
    category: 'Logic',
    inputs: [
      { id: 'input', label: 'input', type: 'boolean', defaultValue: false },
      { id: 'condition', label: 'condition', type: 'boolean', defaultValue: false },
    ],
    outputs: [
      { id: 'false', label: 'false', type: 'boolean' },
      { id: 'true', label: 'true', type: 'boolean' },
    ],
    configSchema: [],
    process: (inputs) => {
      const value = coerceBoolean(inputs.input);
      const condition = coerceBoolean(inputs.condition);
      return {
        true: condition ? value : false,
        false: condition ? false : value,
      };
    },
  };
}

type LogicForState = {
  running: boolean;
  current: number;
  start: number;
  end: number;
  nextEmitAt: number;
  lastRunSignal: boolean;
};

const logicForState = new Map<string, LogicForState>();

export function createLogicForNode(): NodeDefinition {
  return {
    type: 'logic-for',
    label: 'for',
    category: 'Logic',
    inputs: [
      { id: 'run', label: 'start', type: 'boolean', defaultValue: false },
      { id: 'start', label: 'from', type: 'number', defaultValue: 1, min: 1, step: 1 },
      { id: 'end', label: 'to', type: 'number', defaultValue: 1, min: 1, step: 1 },
      { id: 'wait', label: 'wait (ms)', type: 'number', defaultValue: 0, min: 0, step: 10 },
    ],
    outputs: [
      { id: 'index', label: 'index', type: 'number' },
      { id: 'running', label: 'running', type: 'boolean' },
      { id: 'loopEnd', label: 'loop end', type: 'boolean' },
    ],
    configSchema: [],
    process: (inputs, _config, context) => {
      const run = coerceBoolean(inputs.run);
      const startRaw = inputs.start;
      const endRaw = inputs.end;
      const waitRaw = inputs.wait;

      const startValue =
        typeof startRaw === 'number' && Number.isFinite(startRaw)
          ? startRaw
          : Number(startRaw ?? 1);
      const endValue =
        typeof endRaw === 'number' && Number.isFinite(endRaw) ? endRaw : Number(endRaw ?? 1);

      const start = Math.round(Number.isFinite(startValue) ? startValue : 1);
      const end = Math.round(Number.isFinite(endValue) ? endValue : 1);

      const clampedStart = Math.max(1, start);
      const clampedEnd = Math.max(clampedStart, end);

      const prev = logicForState.get(context.nodeId);
      const state: LogicForState = prev ?? {
        running: false,
        current: clampedStart,
        start: clampedStart,
        end: clampedEnd,
        nextEmitAt: context.time,
        lastRunSignal: false,
      };

      const waitParsed = typeof waitRaw === 'number' ? waitRaw : Number(waitRaw ?? 0);
      const waitMs = Number.isFinite(waitParsed) ? Math.max(0, waitParsed) : 0;

      // Allow editing range while idle; keep running range stable once started.
      if (!state.running && (state.start !== clampedStart || state.end !== clampedEnd)) {
        state.start = clampedStart;
        state.end = clampedEnd;
        state.current = clampedStart;
      }

      const rising = run && !state.lastRunSignal;
      state.lastRunSignal = run;

      if (rising && !state.running) {
        state.running = true;
        state.start = clampedStart;
        state.end = clampedEnd;
        state.current = clampedStart;
        state.nextEmitAt = context.time;
      }

      if (!state.running) {
        logicForState.set(context.nodeId, state);
        return { running: false, loopEnd: false };
      }

      if (context.time < state.nextEmitAt) {
        logicForState.set(context.nodeId, state);
        return { running: true, loopEnd: false };
      }

      const out = state.current;
      const done = out >= state.end;
      if (done) {
        state.running = false;
        state.current = state.start;
        logicForState.set(context.nodeId, state);
        return { index: out, running: false, loopEnd: true };
      }

      state.current = out + 1;
      state.nextEmitAt = context.time + waitMs;
      logicForState.set(context.nodeId, state);
      return { index: out, running: true, loopEnd: false };
    },
  };
}

type LogicSleepState = {
  queue: { time: number; value: unknown }[];
  lastOutput: unknown;
};

// Sleep node keeps a small time queue to delay signals by the configured milliseconds.
const logicSleepState = new Map<string, LogicSleepState>();

export function createLogicSleepNode(): NodeDefinition {
  return {
    type: 'logic-sleep',
    label: 'Sleep',
    category: 'Logic',
    inputs: [
      { id: 'input', label: 'input', type: 'any' },
      { id: 'sleepTimeMs', label: 'sleep time (ms)', type: 'number', defaultValue: 0 },
    ],
    outputs: [{ id: 'output', label: 'output', type: 'any' }],
    configSchema: [],
    process: (inputs, _config, context) => {
      const rawDelay = inputs.sleepTimeMs;
      const parsed = typeof rawDelay === 'number' ? rawDelay : Number(rawDelay ?? 0);
      const delayMs = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;

      const state = logicSleepState.get(context.nodeId) ?? {
        queue: [],
        lastOutput: undefined,
      };

      state.queue.push({ time: context.time, value: inputs.input });

      const targetTime = context.time - delayMs;
      while (state.queue.length > 0 && state.queue[0].time <= targetTime) {
        const item = state.queue.shift();
        if (item) state.lastOutput = item.value;
      }

      logicSleepState.set(context.nodeId, state);
      return { output: state.lastOutput };
    },
  };
}

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

// -----------------------------------------------------------------------------
// Number Script Node: generate values over time following a user-defined curve.
// -----------------------------------------------------------------------------

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
 * bezier: [x1, y1, x2, y2] control points (start=0,0, end=1,1)
 */
function evaluateBezier(bezier: BezierValue, t: number): number {
  const x = Math.max(0, Math.min(1, t));

  const x1 = bezier[0],
    y1 = bezier[1],
    x2 = bezier[2],
    y2 = bezier[3];

  // Cubic bezier formula: B(t) = 3(1-t)²t*P1 + 3(1-t)t²*P2 + t³
  // For x: Bx(t) = 3(1-t)²t*x1 + 3(1-t)t²*x2 + t³
  // For y: By(t) = 3(1-t)²t*y1 + 3(1-t)t²*y2 + t³

  // Newton-Raphson to find parameter t for given x
  const sampleCurveX = (t: number) =>
    ((1 - 3 * x2 + 3 * x1) * t + (3 * x2 - 6 * x1)) * t * t + 3 * x1 * t;
  const sampleCurveY = (t: number) =>
    ((1 - 3 * y2 + 3 * y1) * t + (3 * y2 - 6 * y1)) * t * t + 3 * y1 * t;
  const sampleCurveDerivativeX = (t: number) =>
    (3 * (1 - 3 * x2 + 3 * x1) * t + 2 * (3 * x2 - 6 * x1)) * t + 3 * x1;

  // Use Newton-Raphson iteration
  let guessT = x;
  for (let i = 0; i < 8; i++) {
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

      // Parse bezier curve: [x1, y1, x2, y2]
      const curveRaw = config.curve;
      const bezier: BezierValue =
        Array.isArray(curveRaw) &&
        curveRaw.length === 4 &&
        curveRaw.every((v) => typeof v === 'number' && Number.isFinite(v))
          ? (curveRaw as BezierValue)
          : [0.25, 0.1, 0.25, 1.0];

      // Initialize or retrieve state
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

      // Clear finished flag at start of frame
      state.justFinished = false;

      // Edge detection for run signal
      const rising = run && !state.lastRun;
      const falling = !run && state.lastRun;
      state.lastRun = run;

      // Start on rising edge
      if (rising && !state.running) {
        state.running = true;
        state.elapsedMs = 0;
        state.direction = 1;
      }

      // Stop on falling edge (optional: you may want it to continue even if run goes false)
      // For this implementation: we require run=true to continue, stop if run=false
      if (falling && state.running) {
        state.running = false;
      }

      if (!state.running) {
        // Output the start or end value based on direction when stopped
        const outputValue = state.direction === 1 ? start : end;
        return { value: outputValue, running: false, finished: false };
      }

      // Advance time
      state.elapsedMs += context.deltaTime;

      let t = duration > 0 ? state.elapsedMs / duration : 1;
      if (t >= 1) {
        // Cycle completed
        switch (loop) {
          case 'once':
            t = 1;
            state.running = false;
            state.justFinished = true;
            break;
          case 'one-way':
            // Restart from beginning
            state.elapsedMs = state.elapsedMs % duration;
            t = duration > 0 ? state.elapsedMs / duration : 0;
            state.justFinished = true;
            break;
          case 'around':
            // Ping-pong: reverse direction
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

      // Apply direction for "around" mode
      const effectiveT = state.direction === 1 ? t : 1 - t;

      // Evaluate bezier curve
      const curveValue = evaluateBezier(bezier, effectiveT);

      // Map curve output (0..1) to start..end range
      const value = start + curveValue * (end - start);

      numberScriptState.set(context.nodeId, state);

      return {
        value,
        running: state.running,
        finished: state.justFinished,
      };
    },
  };
}
