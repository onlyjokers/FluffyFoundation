/**
 * Purpose: Pure target/template helpers for the Registry MIDI panel.
 */
import { parameterRegistry } from '$lib/parameters/registry';
import type { Parameter } from '$lib/parameters/parameter';
import {
  templateForNodeInput,
  templateForParam,
  type MidiBindingMode,
  type MidiBindingTemplateV1,
} from '$lib/features/midi/midi-templates';
export {
  clampMidiNumber,
  describeMidiSource,
  formatMidiEvent,
  listMidiTargetGroups,
  type MidiTarget,
  type ParamGroup,
} from './registry-midi-panel-pure-helpers';
import type { MidiTarget } from './registry-midi-panel-pure-helpers';

const paramToNodeInput = new Map<string, { nodeType: string; inputId: string }>([
  ['controls/synth/frequency', { nodeType: 'proc-synth-update', inputId: 'frequency' }],
  ['controls/synth/duration', { nodeType: 'proc-synth-update', inputId: 'durationMs' }],
  ['controls/synth/volume', { nodeType: 'proc-synth-update', inputId: 'volume' }],
  ['controls/synth/modDepth', { nodeType: 'proc-synth-update', inputId: 'modDepth' }],
  ['controls/synth/modLfo', { nodeType: 'proc-synth-update', inputId: 'modFrequency' }],
  ['controls/flashlight/frequencyHz', { nodeType: 'proc-flashlight', inputId: 'frequencyHz' }],
  ['controls/flashlight/dutyCycle', { nodeType: 'proc-flashlight', inputId: 'dutyCycle' }],
  ['controls/screenColor/maxOpacity', { nodeType: 'proc-screen-color', inputId: 'maxOpacity' }],
  ['controls/screenColor/minOpacity', { nodeType: 'proc-screen-color', inputId: 'minOpacity' }],
  ['controls/screenColor/frequencyHz', { nodeType: 'proc-screen-color', inputId: 'frequencyHz' }],
]);

export function createTemplateForMidiTarget(
  target: MidiTarget,
  selectedMode: MidiBindingMode
): MidiBindingTemplateV1 | null {
  const param = parameterRegistry.get<number>(target.path) as Parameter<number> | undefined;
  if (!param) return null;

  const mapping = {
    min: typeof param.min === 'number' ? param.min : 0,
    max: typeof param.max === 'number' ? param.max : 1,
    invert: false,
    round: false,
  };

  const nodeTarget = paramToNodeInput.get(target.path);
  if (nodeTarget) {
    return templateForNodeInput({ nodeType: nodeTarget.nodeType, inputId: nodeTarget.inputId, mapping });
  }

  const tpl = templateForParam(target.path, selectedMode);
  if (!tpl) return null;
  tpl.mapping = mapping;
  return tpl;
}

export function downloadJsonFile(payload: unknown, filename: string): void {
  if (typeof document === 'undefined') return;
  const data = JSON.stringify(payload, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
