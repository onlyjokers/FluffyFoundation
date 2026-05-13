<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { midiService } from '$lib/features/midi/midi-service';
  import { midiNodeBridge } from '$lib/features/midi/midi-node-bridge';
  import { nodeEngine } from '$lib/nodes';
  import { parameterRegistry } from '$lib/parameters/registry';
  import {
    detectMidiBindings,
    exportMidiTemplateFile,
    instantiateMidiBindings,
    parseMidiTemplateFile,
    removeMidiBinding,
    type DetectedMidiBinding,
    type MidiBindingMode,
    type MidiBindingTemplateV1,
  } from '$lib/features/midi/midi-templates';
  import {
    clampMidiNumber,
    createTemplateForMidiTarget,
    describeMidiSource,
    downloadJsonFile,
    formatMidiEvent,
    listMidiTargetGroups,
    type MidiTarget,
    type ParamGroup,
  } from './registry-midi-panel-helpers';

  let inputs = midiService.inputs;
  let selectedInputId = midiService.selectedInputId;
  let lastMessage = midiService.lastMessage;

  const graphStateStore = nodeEngine.graphState;
  const tickTimeStore = nodeEngine.tickTime;

  let bindings: DetectedMidiBinding[] = [];
  let graphUnsub: (() => void) | null = null;
  let unsubscribeRegistry: (() => void) | null = null;

  let availableGroups: ParamGroup[] = [];
  let selectedGroupKey = '';
  let selectedTargetId = '';
  let selectedTarget: MidiTarget | null = null;
  let selectedMode: MidiBindingMode = 'REMOTE';
  let refreshQueued = false;
  let importInputEl: HTMLInputElement | null = null;

  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      refreshTargets();
    });
  }

  function refreshTargets() {
    availableGroups = listMidiTargetGroups();
    if (!availableGroups.some((g) => g.key === selectedGroupKey)) {
      selectedGroupKey = availableGroups[0]?.key ?? '';
    }
    const selectedGroup = availableGroups.find((g) => g.key === selectedGroupKey);
    const groupParams = selectedGroup?.params ?? [];
    if (!groupParams.some((p) => p.id === selectedTargetId)) {
      selectedTargetId = groupParams[0]?.id ?? '';
    }
  }

  $: if (selectedGroupKey) {
    const group = availableGroups.find((g) => g.key === selectedGroupKey);
    if (group && !group.params.some((p) => p.id === selectedTargetId)) {
      selectedTargetId = group.params[0]?.id ?? '';
    }
  }

  $: {
    const group = availableGroups.find((g) => g.key === selectedGroupKey);
    selectedTarget = group?.params.find((p) => p.id === selectedTargetId)?.target ?? null;
  }

  function handleInputChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    midiService.selectInput(select.value);
  }

  function numberFromEvent(event: Event): number {
    const input = event.target as HTMLInputElement | null;
    return parseFloat(input?.value ?? '');
  }

  function beginLearnForTemplate(tpl: MidiBindingTemplateV1) {
    const created = instantiateMidiBindings({ version: 1, bindings: [tpl] })[0];
    if (!created) return;
    void midiService.init();
    midiNodeBridge.startLearn(created.midiNodeId);
  }

  function startLearnSelected() {
    if (!selectedTarget) return;
    const tpl = createTemplateForMidiTarget(selectedTarget, selectedMode);
    if (!tpl) return;
    beginLearnForTemplate(tpl);
  }

  function toggleMode(binding: DetectedMidiBinding) {
    const target = binding.template.target;
    if (target.kind !== 'param') return;
    const next: MidiBindingMode = target.mode === 'REMOTE' ? 'MODULATION' : 'REMOTE';
    nodeEngine.updateNodeConfig(binding.targetNodeId, { mode: next });
  }

  function updateMapping(binding: DetectedMidiBinding, updates: Partial<MidiBindingTemplateV1['mapping']>) {
    const current = binding.template.mapping;
    const rawMin = updates.min;
    const rawMax = updates.max;
    const min = typeof rawMin === 'number' && Number.isFinite(rawMin) ? rawMin : current.min;
    const max = typeof rawMax === 'number' && Number.isFinite(rawMax) ? rawMax : current.max;
    const clampedMin = clampMidiNumber(min, undefined, max);
    const clampedMax = clampMidiNumber(max, clampedMin, undefined);
    const patch: Record<string, unknown> = {
      ...updates,
      min: clampedMin,
      max: clampedMax,
    };
    // Keep `midi-map`'s newer `integer` flag in sync with `round` (integer output).
    if (Object.prototype.hasOwnProperty.call(updates, 'round')) patch.integer = Boolean(updates.round);
    nodeEngine.updateNodeConfig(binding.mapNodeId, patch);
  }

  function toggleInvert(binding: DetectedMidiBinding) {
    updateMapping(binding, { invert: !binding.template.mapping.invert });
  }
  function toggleRound(binding: DetectedMidiBinding) {
    updateMapping(binding, { round: !binding.template.mapping.round });
  }
  function startLearn(binding: DetectedMidiBinding) {
    void midiService.init();
    midiNodeBridge.startLearn(binding.midiNodeId);
  }
  function clearBinding(binding: DetectedMidiBinding) {
    nodeEngine.updateNodeConfig(binding.midiNodeId, { source: null });
  }
  function removeBinding(binding: DetectedMidiBinding) {
    removeMidiBinding(binding);
  }

  function formatValue(value?: number | null): string {
    if (value === null || value === undefined) return '—';
    if (!Number.isFinite(Number(value))) return '—';
    return Number(value).toFixed(2);
  }

  function lastMappedValueText(mapNodeId: string, _tick: number): string {
    const node = nodeEngine.getNode(mapNodeId);
    const v = node?.outputValues?.out as number | undefined;
    return formatValue(v ?? null);
  }

  function exportTemplates() {
    const file = exportMidiTemplateFile(nodeEngine.exportGraph());
    downloadJsonFile(file, 'shugu-midi-templates.json');
  }

  function openImport() {
    importInputEl?.click?.();
  }

  async function handleImportChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      alert('Invalid JSON file.');
      return;
    }
    const templates = parseMidiTemplateFile(parsed);
    if (!templates) {
      alert('Unsupported template format (expected version: 1).');
      return;
    }
    const created = instantiateMidiBindings(templates);
    alert(`Imported ${created.length} template(s).`);
  }

  onMount(async () => {
    await midiService.init();
    midiNodeBridge.init();
    refreshTargets();
    unsubscribeRegistry = parameterRegistry.subscribe(() => scheduleRefresh());

    // Sync list from the Node Graph (bidirectional: editing the graph updates this view too).
    graphUnsub = graphStateStore.subscribe((state) => {
      bindings = detectMidiBindings(state);
    });
  });

  onDestroy(() => {
    unsubscribeRegistry?.();
    graphUnsub?.();
  });
</script>

<div class="registry-midi-panel">
  <div class="panel-header">
    <h2>Registry MIDI Templates</h2>
    <div class="header-actions">
      <input
        bind:this={importInputEl}
        type="file"
        accept="application/json"
        on:change={handleImportChange}
        style="display: none;"
      />
      <Button variant="ghost" size="sm" on:click={openImport}>⬇ Import</Button>
      <Button variant="ghost" size="sm" on:click={exportTemplates}>⬆ Export</Button>
      <div class="input-selector">
        <label for="midi-input">Input:</label>
        <select id="midi-input" value={$selectedInputId} on:change={handleInputChange}>
          {#if $inputs.length === 0}
            <option value="">No MIDI inputs</option>
          {:else}
            {#each $inputs as input}
              <option value={input.id}>{input.name}</option>
            {/each}
          {/if}
        </select>
        <Button variant="ghost" size="sm" on:click={refreshTargets}>🔄</Button>
      </div>
    </div>
  </div>

  <div class="monitor-section">
    <h3>MIDI Monitor</h3>
    <div class="monitor-display">
      {#if $lastMessage}
        <div class="monitor-row">
          <span class="label">Input:</span>
          <span class="value"
            >{$inputs.find((i) => i.id === $lastMessage.inputId)?.name ?? $lastMessage.inputId}</span
          >
        </div>
        <div class="monitor-row">
          <span class="label">Signal:</span>
          <span class="value">{formatMidiEvent($lastMessage)}</span>
        </div>
        <div class="monitor-row">
          <span class="label">Value:</span>
          <span class="value"
            >{$lastMessage.rawValue} ({($lastMessage.normalized * 100).toFixed(0)}%)</span
          >
        </div>
      {:else}
        <div class="monitor-empty">Move a MIDI control…</div>
      {/if}
    </div>
  </div>

  <div class="quick-add">
    <h3>Quick Add</h3>
    <div class="quick-add-row">
      <select bind:value={selectedGroupKey} aria-label="Target group">
        {#if availableGroups.length === 0}
          <option value="">No targets</option>
        {:else}
          {#each availableGroups as group (group.key)}
            <option value={group.key}>{group.label}</option>
          {/each}
        {/if}
      </select>

      <select bind:value={selectedTargetId} aria-label="Target">
        {#if availableGroups.length === 0}
          <option value="">No targets</option>
        {:else}
          {#each availableGroups.find((g) => g.key === selectedGroupKey)?.params ?? [] as item}
            <option value={item.id}>{item.label}</option>
          {/each}
        {/if}
      </select>

      <select bind:value={selectedMode} aria-label="Mode" disabled={selectedTarget?.type !== 'PARAM'}>
        <option value="REMOTE">REMOTE</option>
        <option value="MODULATION">MODULATION</option>
      </select>

      <Button variant="primary" size="sm" on:click={startLearnSelected} disabled={!selectedTarget}>
        Learn MIDI
      </Button>
    </div>

    {#if selectedTarget?.type === 'PARAM'}
      <div class="target-path-hint">{selectedTarget.path}</div>
    {/if}
  </div>

  <div class="bindings-section">
    <h3>Active Bindings ({bindings.length})</h3>
    {#if bindings.length === 0}
      <div class="empty-state">No bindings yet. Use "Learn MIDI" above, or create them in Node Graph.</div>
    {:else}
      <div class="bindings-list">
        {#each bindings as binding (binding.id)}
          <div class="binding-card">
            <div class="binding-header">
              <div class="binding-source">{describeMidiSource(binding.template.source, $inputs)}</div>
              <div class="binding-arrow">→</div>
              <div class="binding-target">{binding.template.label}</div>
            </div>

            <div class="binding-controls">
              {#if binding.template.target.kind === 'param'}
                <div class="control-group">
                  <span class="control-label">Mode:</span>
                  <button
                    class="mode-toggle mode-{binding.template.target.mode.toLowerCase()}"
                    type="button"
                    on:click={() => toggleMode(binding)}
                  >
                    {binding.template.target.mode}
                  </button>
                </div>
              {/if}

              <div class="control-group">
                <span class="control-label">Range:</span>
                <input
                  type="number"
                  class="range-input"
                  value={binding.template.mapping.min}
                  on:change={(e) => updateMapping(binding, { min: numberFromEvent(e) })}
                />
                <span>–</span>
                <input
                  type="number"
                  class="range-input"
                  value={binding.template.mapping.max}
                  on:change={(e) => updateMapping(binding, { max: numberFromEvent(e) })}
                />
              </div>

              <div class="control-group">
                <label class="control-label" for={`invert-${binding.id}`}>Invert</label>
                <input
                  id={`invert-${binding.id}`}
                  type="checkbox"
                  checked={binding.template.mapping.invert}
                  on:change={() => toggleInvert(binding)}
                />
              </div>

              <div class="control-group">
                <label class="control-label" for={`round-${binding.id}`}>Round</label>
                <input
                  id={`round-${binding.id}`}
                  type="checkbox"
                  checked={binding.template.mapping.round}
                  on:change={() => toggleRound(binding)}
                />
              </div>

              <div class="control-group">
                <span class="last-value">Mapped: {lastMappedValueText(binding.mapNodeId, $tickTimeStore)}</span>
              </div>

              <Button variant="ghost" size="sm" on:click={() => startLearn(binding)}>Learn</Button>
              <Button variant="ghost" size="sm" on:click={() => clearBinding(binding)}>Clear</Button>
              <Button variant="danger" size="sm" on:click={() => removeBinding(binding)}>×</Button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .registry-midi-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg, 24px);
    padding: var(--space-lg, 24px);
    background: var(--bg-primary, #1a1a1a);
    border-radius: var(--radius-lg, 12px);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: var(--space-md, 16px);
  }

  .panel-header h2 {
    margin: 0;
    font-size: var(--text-xl, 1.25rem);
    color: var(--text-primary, #fff);
  }

  .header-actions {
    display: flex;
    gap: var(--space-sm, 8px);
    align-items: center;
    flex-wrap: wrap;
  }

  .input-selector {
    display: flex;
    align-items: center;
    gap: var(--space-sm, 8px);
  }

  .input-selector label {
    color: var(--text-secondary, #aaa);
    font-size: var(--text-sm, 0.875rem);
  }

  .input-selector select {
    padding: var(--space-xs, 4px) var(--space-sm, 8px);
    background: var(--bg-secondary, #252525);
    border: 1px solid var(--border-color, #444);
    border-radius: var(--radius-sm, 4px);
    color: var(--text-primary, #fff);
  }

  .monitor-section,
  .quick-add,
  .bindings-section {
    background: var(--bg-secondary, #252525);
    padding: var(--space-md, 16px);
    border-radius: var(--radius-md, 8px);
  }

  .monitor-section h3,
  .quick-add h3,
  .bindings-section h3 {
    margin: 0 0 var(--space-sm, 8px) 0;
    font-size: var(--text-md, 1rem);
    color: var(--text-secondary, #aaa);
  }

  .monitor-display {
    font-family: var(--font-mono, monospace);
    font-size: var(--text-sm, 0.875rem);
  }

  .monitor-row {
    display: flex;
    gap: var(--space-sm, 8px);
  }

  .monitor-row .label {
    color: var(--text-secondary, #aaa);
    width: 70px;
  }

  .monitor-row .value {
    color: var(--color-primary, #6366f1);
  }

  .monitor-empty {
    color: var(--text-muted, #666);
    font-style: italic;
  }

  .quick-add-row {
    display: flex;
    gap: var(--space-sm, 8px);
    align-items: center;
    flex-wrap: wrap;
  }

  .quick-add-row select {
    padding: var(--space-sm, 8px);
    background: var(--bg-tertiary, #2a2a2a);
    border: 1px solid var(--border-color, #444);
    border-radius: var(--radius-sm, 4px);
    color: var(--text-primary, #fff);
  }

  .target-path-hint {
    margin-top: var(--space-xs, 6px);
    color: var(--text-muted, #666);
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs, 0.8rem);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty-state {
    color: var(--text-muted, #666);
    font-style: italic;
    padding: var(--space-md, 16px) 0;
  }

  .bindings-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm, 8px);
  }

  .binding-card {
    background: var(--bg-tertiary, #2a2a2a);
    padding: var(--space-sm, 8px) var(--space-md, 16px);
    border-radius: var(--radius-sm, 4px);
    border-left: 3px solid var(--color-primary, #6366f1);
  }

  .binding-header {
    display: flex;
    align-items: center;
    gap: var(--space-sm, 8px);
    margin-bottom: var(--space-sm, 8px);
    font-weight: 500;
    flex-wrap: wrap;
  }

  .binding-source {
    color: var(--color-warning, #f59e0b);
    font-family: var(--font-mono, monospace);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .binding-arrow {
    color: var(--text-muted, #666);
  }

  .binding-target {
    color: var(--color-primary, #6366f1);
    font-family: var(--font-mono, monospace);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .binding-controls {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-md, 16px);
    align-items: center;
  }

  .control-group {
    display: flex;
    align-items: center;
    gap: var(--space-xs, 4px);
    font-size: var(--text-sm, 0.875rem);
  }

  .control-label {
    color: var(--text-secondary, #aaa);
  }

  .mode-toggle {
    padding: 2px 8px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    font-size: var(--text-xs, 0.75rem);
  }

  .mode-toggle.mode-remote {
    background: var(--color-success, #22c55e);
    color: #000;
  }

  .mode-toggle.mode-modulation {
    background: var(--color-warning, #f59e0b);
    color: #000;
  }

  .range-input {
    width: 70px;
    padding: 2px 6px;
    background: var(--bg-primary, #1a1a1a);
    border: 1px solid var(--border-color, #444);
    border-radius: 3px;
    color: var(--text-primary, #fff);
    font-family: var(--font-mono, monospace);
  }

  .last-value {
    color: var(--text-muted, #666);
    font-family: var(--font-mono, monospace);
  }
</style>
