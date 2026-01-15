<script lang="ts">
  import { sensorData, state } from '$lib/stores/manager';

  type SensorPayload = Record<string, number | null | undefined>;
  type SensorClientData = { sensorType: string; payload?: SensorPayload };

  let clientData: SensorClientData | null = null;
  let payload: SensorPayload = {};

  $: selectedClientId = $state.selectedClientIds[0] ?? null;
  $: clientData = selectedClientId ? $sensorData.get(selectedClientId) : null;
  $: payload = clientData?.payload ?? {};

  function formatValue(val: number | null | undefined): string {
    if (val === null || val === undefined) return '--';
    return Number(val).toFixed(2);
  }
</script>

<div class="sensor-display-container">
  <div class="header">
    <h3 class="title">Sensor Data</h3>
    {#if selectedClientId}
      <span class="client-badge">{selectedClientId.slice(-8)}</span>
    {/if}
  </div>

  {#if !selectedClientId}
    <div class="empty-state">
      <p>Select a client to view live sensor telemetry.</p>
    </div>
  {:else if !clientData}
    <div class="empty-state">
      <div class="loader"></div>
      <p>Waiting for data...</p>
    </div>
  {:else}
    <div class="data-content">
      {#if clientData.sensorType === 'gyro'}
        <div class="data-section">
          <h4 class="data-title">Gyroscope</h4>
          <div class="data-grid">
            <div class="data-item">
              <span class="value">{formatValue(payload.alpha)}</span>
              <span class="label">Alpha</span>
            </div>
            <div class="data-item">
              <span class="value">{formatValue(payload.beta)}</span>
              <span class="label">Beta</span>
            </div>
            <div class="data-item">
              <span class="value">{formatValue(payload.gamma)}</span>
              <span class="label">Gamma</span>
            </div>
          </div>
        </div>
      {:else if clientData.sensorType === 'accel'}
        <div class="data-section">
          <h4 class="data-title">Accelerometer</h4>
          <div class="data-grid">
            <div class="data-item">
              <span class="value">{formatValue(payload.x)}</span>
              <span class="label">X</span>
            </div>
            <div class="data-item">
              <span class="value">{formatValue(payload.y)}</span>
              <span class="label">Y</span>
            </div>
            <div class="data-item">
              <span class="value">{formatValue(payload.z)}</span>
              <span class="label">Z</span>
            </div>
          </div>
        </div>
      {:else if clientData.sensorType === 'orientation'}
        <div class="data-section">
          <h4 class="data-title">Orientation</h4>
          <div class="data-grid">
            <div class="data-item">
              <span class="value">{formatValue(payload.alpha)}</span>
              <span class="label">Alpha</span>
            </div>
            <div class="data-item">
              <span class="value">{formatValue(payload.beta)}</span>
              <span class="label">Beta</span>
            </div>
            <div class="data-item">
              <span class="value">{formatValue(payload.gamma)}</span>
              <span class="label">Gamma</span>
            </div>
          </div>
        </div>
      {:else if clientData.sensorType === 'mic'}
        <div class="data-section">
          <h4 class="data-title">Audio Analysis</h4>
          <div class="data-grid">
            <div class="data-item">
              <span class="value">{formatValue(payload.volume)}</span>
              <span class="label">Vol</span>
            </div>
            <div class="data-item">
              <span class="value">{formatValue(payload.lowEnergy)}</span>
              <span class="label">Low</span>
            </div>
            <div class="data-item">
              <span class="value">{formatValue(payload.highEnergy)}</span>
              <span class="label">High</span>
            </div>
            <div class="data-item">
              <span class="value">{payload.bpm ?? '--'}</span>
              <span class="label">BPM</span>
            </div>
          </div>
        </div>
      {:else}
        <div class="data-section">
          <h4 class="data-title">{clientData.sensorType}</h4>
          <pre class="data-raw">{JSON.stringify(clientData.payload, null, 2)}</pre>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .sensor-display-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: var(--space-sm);
    border-bottom: 1px solid var(--border-color);
  }

  .title {
    font-size: var(--text-base);
    font-weight: 600;
  }

  .client-badge {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    padding: 2px 6px;
    background: var(--color-primary);
    color: white;
    border-radius: var(--radius-sm);
  }

  .empty-state {
    padding: var(--space-xl);
    text-align: center;
    color: var(--text-muted);
    font-size: var(--text-sm);
    background: rgba(255, 255, 255, 0.02);
    border-radius: var(--radius-md);
  }

  .data-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .data-title {
    font-size: var(--text-sm);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .data-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-sm);
  }

  .data-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-md);
    background: rgba(255, 255, 255, 0.03);
    border-radius: var(--radius-md);
  }

  .value {
    font-family: var(--font-mono);
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-accent);
  }

  .label {
    font-size: var(--text-xs);
    color: var(--text-muted);
    margin-top: 4px;
  }

  .data-raw {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    background: rgba(0, 0, 0, 0.3);
    padding: var(--space-sm);
    border-radius: var(--radius-sm);
    overflow-x: auto;
  }
</style>
