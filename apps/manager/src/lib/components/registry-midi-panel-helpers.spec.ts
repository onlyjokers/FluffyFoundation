/**
 * Purpose: Regression coverage for pure Registry MIDI panel helper behavior.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerDefaultControlParameters } from '$lib/parameters/presets';
import {
  clampMidiNumber,
  describeMidiSource,
  formatMidiEvent,
  listMidiTargetGroups,
} from './registry-midi-panel-pure-helpers';

registerDefaultControlParameters();

test('MIDI panel helpers preserve source labels and numeric clamping', () => {
  assert.equal(formatMidiEvent({ inputId: 'i1', type: 'cc', channel: 0, number: 74, value: 32, normalized: 0.25 }), 'CC 74 ch1');
  assert.equal(formatMidiEvent({ inputId: 'i1', type: 'pitchbend', channel: 2, value: 8192, normalized: 0.5 }), 'Pitch Bend ch3');

  assert.equal(
    describeMidiSource({ inputId: 'dev-1', type: 'note', channel: 1, number: 60 }, [{ id: 'dev-1', name: 'Launchkey' }]),
    'Launchkey • note 60 • ch2'
  );
  assert.equal(describeMidiSource(null, []), 'Unbound');

  assert.equal(clampMidiNumber(8, 0, 4), 4);
  assert.equal(clampMidiNumber(-1, 0, 4), 0);
  assert.equal(clampMidiNumber(2, Number.NaN, Number.POSITIVE_INFINITY), 2);
});

test('MIDI target helpers preserve registry grouping behavior', () => {
  const groups = listMidiTargetGroups();
  const synth = groups.find((group) => group.key === 'Synth');
  assert.ok(synth);
  assert.ok(synth.params.some((param) => param.id === 'controls/synth/frequency'));
  assert.ok(groups.find((group) => group.key === 'Flashlight')?.params.some((param) => param.id === 'controls/flashlight/durationMs'));
});
