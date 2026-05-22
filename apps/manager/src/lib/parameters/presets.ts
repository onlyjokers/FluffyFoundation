import { parameterRegistry } from './registry';
import type { Parameter } from './parameter';

type ParameterMap = Record<string, Parameter<any>>;

/**
 * Register a minimal set of control-surface parameters so the UI factory can render them.
 * This is intentionally small to keep incremental migration safe.
 */
export function registerDefaultControlParameters(): ParameterMap {
  const params: ParameterMap = {};

  // --- Synth ---
  params['controls/synth/frequency'] = parameterRegistry.register<number>({
    path: 'controls/synth/frequency',
    type: 'number',
    defaultValue: 180,
    min: 20,
    max: 2000,
    metadata: { label: 'Freq (Hz)', group: 'Synth', step: 10, widgetType: 'slider' },
  });

  params['controls/synth/duration'] = parameterRegistry.register<number>({
    path: 'controls/synth/duration',
    type: 'number',
    defaultValue: 200,
    min: 20,
    max: 4000,
    metadata: { label: 'Dur (ms)', group: 'Synth', step: 10, widgetType: 'slider' },
  });

  params['controls/synth/volume'] = parameterRegistry.register<number>({
    path: 'controls/synth/volume',
    type: 'number',
    defaultValue: 0.7,
    min: 0,
    max: 1,
    metadata: { label: 'Volume', group: 'Synth', step: 0.05, widgetType: 'slider' },
  });

  params['controls/synth/modDepth'] = parameterRegistry.register<number>({
    path: 'controls/synth/modDepth',
    type: 'number',
    defaultValue: 0,
    min: 0,
    max: 1,
    metadata: { label: 'Wobble Depth', group: 'Synth', step: 0.05, widgetType: 'slider' },
  });

  params['controls/synth/modLfo'] = parameterRegistry.register<number>({
    path: 'controls/synth/modLfo',
    type: 'number',
    defaultValue: 12,
    min: 1,
    max: 40,
    metadata: { label: 'Wobble Rate (Hz)', group: 'Synth', step: 1, widgetType: 'input' },
  });

  params['controls/synth/waveform'] = parameterRegistry.register<string>({
    path: 'controls/synth/waveform',
    type: 'enum',
    defaultValue: 'square',
    enumOptions: [
      { value: 'square', label: 'Square' },
      { value: 'sine', label: 'Sine' },
      { value: 'triangle', label: 'Triangle' },
      { value: 'sawtooth', label: 'Sawtooth' },
    ],
    metadata: { label: 'Waveform', group: 'Synth', widgetType: 'select' },
  });

  params['controls/synth/wobbleEnabled'] = parameterRegistry.register<boolean>({
    path: 'controls/synth/wobbleEnabled',
    type: 'boolean',
    defaultValue: false,
    metadata: { label: 'Enable Wobble', group: 'Synth', widgetType: 'toggle' },
  });

  // --- Flashlight ---
  params['controls/flashlight/frequencyHz'] = parameterRegistry.register<number>({
    path: 'controls/flashlight/frequencyHz',
    type: 'number',
    defaultValue: 1,
    min: 0.2,
    max: 10,
    metadata: { label: 'Frequency', group: 'Flashlight', step: 0.2, unit: 'Hz', widgetType: 'slider' },
  });

  params['controls/flashlight/dutyCycle'] = parameterRegistry.register<number>({
    path: 'controls/flashlight/dutyCycle',
    type: 'number',
    defaultValue: 0.5,
    min: 0.1,
    max: 0.9,
    metadata: { label: 'Duty Cycle', group: 'Flashlight', step: 0.05, widgetType: 'slider' },
  });

  params['controls/flashlight/durationMs'] = parameterRegistry.register<number>({
    path: 'controls/flashlight/durationMs',
    type: 'number',
    defaultValue: 2000,
    min: 0,
    max: 8000,
    metadata: { label: 'Dur (ms)', group: 'Flashlight', step: 50, unit: 'ms', widgetType: 'slider' },
  });

  // --- Screen Color ---
  params['controls/screenColor/primary'] = parameterRegistry.register<string>({
    path: 'controls/screenColor/primary',
    type: 'color',
    defaultValue: '#6366f1',
    metadata: { label: 'Primary', group: 'Screen Color', widgetType: 'color' },
  });

  params['controls/screenColor/secondary'] = parameterRegistry.register<string>({
    path: 'controls/screenColor/secondary',
    type: 'color',
    defaultValue: '#ffffff',
    metadata: { label: 'Secondary', group: 'Screen Color', widgetType: 'color' },
  });

  params['controls/screenColor/maxOpacity'] = parameterRegistry.register<number>({
    path: 'controls/screenColor/maxOpacity',
    type: 'number',
    defaultValue: 1,
    min: 0,
    max: 1,
    metadata: { label: 'Max Opacity', group: 'Screen Color', step: 0.05, widgetType: 'slider' },
  });

  params['controls/screenColor/minOpacity'] = parameterRegistry.register<number>({
    path: 'controls/screenColor/minOpacity',
    type: 'number',
    defaultValue: 0,
    min: 0,
    max: 1,
    metadata: { label: 'Min Opacity', group: 'Screen Color', step: 0.05, widgetType: 'slider' },
  });

  params['controls/screenColor/frequencyHz'] = parameterRegistry.register<number>({
    path: 'controls/screenColor/frequencyHz',
    type: 'number',
    defaultValue: 1.5,
    min: 0.2,
    max: 20,
    metadata: { label: 'Frequency', group: 'Screen Color', step: 0.1, unit: 'Hz', widgetType: 'slider' },
  });

  params['controls/screenColor/durationMs'] = parameterRegistry.register<number>({
    path: 'controls/screenColor/durationMs',
    type: 'number',
    defaultValue: 2000,
    min: 0,
    max: 8000,
    metadata: { label: 'Dur (ms)', group: 'Screen Color', step: 50, unit: 'ms', widgetType: 'slider' },
  });

  params['controls/screenColor/waveform'] = parameterRegistry.register<string>({
    path: 'controls/screenColor/waveform',
    type: 'enum',
    defaultValue: 'sine',
    enumOptions: [
      { value: 'sine', label: 'Sine' },
      { value: 'square', label: 'Square' },
      { value: 'triangle', label: 'Triangle' },
      { value: 'sawtooth', label: 'Sawtooth' },
    ],
    metadata: { label: 'Waveform', group: 'Screen Color', widgetType: 'select' },
  });

  return params;
}
