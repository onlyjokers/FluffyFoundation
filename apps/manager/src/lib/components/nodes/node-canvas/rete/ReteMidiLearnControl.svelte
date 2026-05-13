<!-- Purpose: Renders MIDI learn controls for Rete nodes. -->
<script lang="ts">
  import { formatMidiSource, type MidiSource } from '$lib/features/midi/midi-node-bridge';
  import type { MidiEvent } from '$lib/features/midi/midi-service';

  export let data: Record<string, any>;
  export let hasLabel = false;
  export let midiNodeId = '';
  export let midiSource: MidiSource | null = null;
  export let midiIsLearning = false;
  export let midiSupported = false;
  export let midiSelectedInput = '';
  export let midiLastMessage: MidiEvent | null = null;
  export let toggleMidiLearn: (nodeId: string) => void;
  export let clearMidiBinding: (nodeId: string) => void;
  export let formatMidiEvent: (event: MidiEvent | null) => string;
</script>

<div class="midi-learn">
  {#if hasLabel}
    <div class="control-label">{data.label}</div>
  {/if}
  <div class="midi-row">
    <div class="midi-binding">{formatMidiSource(midiSource)}</div>
    <button
      type="button"
      class="midi-btn {midiIsLearning ? 'active' : ''}"
      disabled={!midiSupported}
      on:pointerdown|stopPropagation
      on:click|stopPropagation={() => toggleMidiLearn(midiNodeId)}
    >
      {midiIsLearning ? 'Listening…' : 'Learn'}
    </button>
  </div>
  {#if midiIsLearning}
    <div class="midi-hint">Move a MIDI control… (input: {midiSelectedInput || 'auto'})</div>
    <div class="midi-last">{formatMidiEvent(midiLastMessage)}</div>
  {/if}
  {#if midiSource}
    <button
      type="button"
      class="midi-clear"
      on:pointerdown|stopPropagation
      on:click|stopPropagation={() => clearMidiBinding(midiNodeId)}
    >
      Clear binding
    </button>
  {/if}
</div>

<style>
  .control-label {
    font-size: 11px;
    letter-spacing: 0.2px;
    color: rgba(255, 255, 255, 0.72);
  }

  .midi-learn {
    padding: 6px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .midi-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .midi-binding {
    flex: 1;
    min-width: 0;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.76);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(2, 6, 23, 0.32);
    border-radius: 10px;
    padding: 6px 10px;
  }

  .midi-btn {
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(2, 6, 23, 0.38);
    color: rgba(255, 255, 255, 0.9);
    border-radius: 10px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
    flex: 0 0 auto;
  }

  .midi-btn:hover {
    border-color: rgba(99, 102, 241, 0.45);
    background: rgba(2, 6, 23, 0.5);
  }

  .midi-btn.active {
    border-color: rgba(99, 102, 241, 0.75);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
  }

  .midi-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .midi-hint {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.62);
  }

  .midi-last {
    font-family: var(--font-mono);
    font-size: 11px;
    color: rgba(20, 184, 166, 0.92);
  }

  .midi-clear {
    align-self: flex-start;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(2, 6, 23, 0.35);
    color: rgba(255, 255, 255, 0.84);
    border-radius: 10px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
  }

  .midi-clear:hover {
    border-color: rgba(239, 68, 68, 0.45);
    background: rgba(2, 6, 23, 0.5);
  }
</style>
