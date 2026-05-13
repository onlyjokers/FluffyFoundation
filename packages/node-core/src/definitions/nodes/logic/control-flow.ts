/**
 * Purpose: Control-flow logic node definitions.
 */
import type { NodeDefinition } from '../../../types.js';
import { coerceBoolean } from '../../utils.js';

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
