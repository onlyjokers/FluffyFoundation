<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import ParameterPanel from '$lib/components/parameters/ParameterPanel.svelte';

  import {
    clients,
    selectedClients,
    selectAllClientsEnabled,
    setSelectAllClients,
  } from '$lib/stores/manager';
  import { parameterRegistry } from '$lib/parameters/registry';
  import { flashlight, screenColor, stopMedia, hideImage } from '$lib/stores/manager';

  $: connectedAudienceCount = ($clients ?? []).filter((c) => c.group !== 'display').length;

  const getNumber = (path: string, fallback: number) => {
    const p = parameterRegistry.get<number>(path);
    const v = p?.effectiveValue;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const getString = (path: string, fallback: string) => {
    const p = parameterRegistry.get<string>(path);
    const v = p?.effectiveValue;
    return typeof v === 'string' ? v : String(v ?? fallback);
  };

  function sendFlashlightBlink(): void {
    const frequency = getNumber('controls/flashlight/frequencyHz', 1);
    const dutyCycle = getNumber('controls/flashlight/dutyCycle', 0.5);
    flashlight('blink', { frequency, dutyCycle });
  }

  function sendFlashlightOn(): void {
    flashlight('on');
  }

  function sendFlashlightOff(): void {
    flashlight('off');
  }

  function sendScreenPulse(): void {
    const primary = getString('controls/screenColor/primary', '#ffffff');
    const secondary = getString('controls/screenColor/secondary', '#000000');
    const minOpacity = getNumber('controls/screenColor/minOpacity', 0);
    const maxOpacity = getNumber('controls/screenColor/maxOpacity', 1);
    const frequencyHz = getNumber('controls/screenColor/frequencyHz', 1.5);
    const waveform = getString('controls/screenColor/waveform', 'sine') as
      | 'sine'
      | 'square'
      | 'triangle'
      | 'sawtooth';

    screenColor({
      color: primary,
      mode: 'modulate',
      secondaryColor: secondary,
      minOpacity,
      maxOpacity,
      frequencyHz,
      waveform,
    });
  }

  function clearVisuals(): void {
    stopMedia();
    hideImage();
    screenColor({ color: '#000000', opacity: 0, mode: 'solid' });
    sendFlashlightOff();
  }
</script>

<Card title="Performance Console">
  <div class="subhead">
    <div class="meta">
      <div class="meta-row">
        <span class="label">Audience online</span>
        <span class="value">{connectedAudienceCount}</span>
      </div>
      <div class="meta-row">
        <span class="label">Selected</span>
        <span class="value">{$selectedClients.length}</span>
      </div>
    </div>

    <div class="tools">
      <label class="select-all">
        <input
          type="checkbox"
          bind:checked={$selectAllClientsEnabled}
          on:change={() => setSelectAllClients($selectAllClientsEnabled)}
        />
        <span>Select All</span>
      </label>

      <Button variant="secondary" size="sm" on:click={clearVisuals}>Panic Clear</Button>
    </div>
  </div>

  <div class="grid">
    <div class="panel">
      <ParameterPanel prefix="controls/flashlight" title="Flashlight" columns={1} />
      <div class="actions">
        <Button variant="secondary" size="sm" on:click={sendFlashlightOn}>On</Button>
        <Button variant="secondary" size="sm" on:click={sendFlashlightBlink}>Blink</Button>
        <Button variant="secondary" size="sm" on:click={sendFlashlightOff}>Off</Button>
      </div>
    </div>

    <div class="panel">
      <ParameterPanel prefix="controls/screenColor" title="Screen Color" columns={1} />
      <div class="actions">
        <Button variant="secondary" size="sm" on:click={sendScreenPulse}>Apply</Button>
      </div>
    </div>
  </div>
</Card>

<style>
  .subhead {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-lg);
    margin-bottom: var(--space-md);
  }

  .meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .meta-row {
    display: flex;
    gap: 10px;
    align-items: baseline;
  }

  .label {
    color: var(--text-muted);
    font-size: var(--text-xs);
    letter-spacing: 0.2px;
    text-transform: uppercase;
  }

  .value {
    color: var(--text-primary);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .tools {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex: 0 0 auto;
  }

  .select-all {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    user-select: none;
    -webkit-user-select: none;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-lg);
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    min-width: 0;
  }

  .actions {
    display: flex;
    gap: var(--space-sm);
  }

  @media (max-width: 980px) {
    .subhead {
      flex-direction: column;
      align-items: stretch;
    }

    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
