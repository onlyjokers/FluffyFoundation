<!--
Purpose: Manager tab for controlling which semantic node capabilities are visible to AI agents.
-->
<script lang="ts">
  import type { AgentCapabilityNodeSource } from '@shugu/node-core';
  import type { SemanticCommandPayload } from '@shugu/protocol';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { semanticSnapshot } from '$lib/stores/manager';
  import { getManagerSDK } from '$lib/stores/manager-sdk-access';
  import {
    buildAgentCapabilityRows,
    createAgentCapabilityCommand,
    type AgentCapabilityRow,
  } from '$lib/nodes/agent-capability-manager';

  type SourceFilter = 'all' | AgentCapabilityNodeSource;
  type StatusFilter = 'all' | 'enabled' | 'disabled';

  let query = '';
  let sourceFilter: SourceFilter = 'all';
  let statusFilter: StatusFilter = 'all';
  let lastError = '';

  $: rows = $semanticSnapshot ? buildAgentCapabilityRows($semanticSnapshot) : [];
  $: filteredRows = rows.filter(matchesFilters);
  $: enabledCount = rows.filter((row) => row.enabled).length;
  $: disabledCount = rows.length - enabledCount;
  $: customCount = rows.filter((row) => row.source === 'custom').length;
  $: pluginCount = rows.filter((row) => row.source === 'plugin').length;

  function matchesFilters(row: AgentCapabilityRow): boolean {
    const term = query.trim().toLowerCase();
    if (sourceFilter !== 'all' && row.source !== sourceFilter) return false;
    if (statusFilter === 'enabled' && !row.enabled) return false;
    if (statusFilter === 'disabled' && row.enabled) return false;
    if (!term) return true;
    return [row.type, row.label, row.category, row.aiNotes, row.disabledReason]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  }

  function semanticPayloadFromCommand(command: ReturnType<typeof createAgentCapabilityCommand>): SemanticCommandPayload {
    const { type, ...rest } = command;
    return { kind: type, ...rest };
  }

  function setCapability(row: AgentCapabilityRow, enabled: boolean): void {
    const sdk = getManagerSDK();
    if (!sdk) {
      lastError = 'Manager SDK is not connected.';
      return;
    }
    lastError = '';
    const disabledReason = enabled ? undefined : row.disabledReason || 'Disabled in Node Manager';
    sdk.sendSemanticCommand({
      requestId: `node-manager:agent.capability.set:${row.type}`,
      command: semanticPayloadFromCommand(
        createAgentCapabilityCommand({
          nodeType: row.type,
          source: row.source,
          enabled,
          aiNotes: row.aiNotes,
          disabledReason,
        })
      ),
    });
  }

  function paramSummary(row: AgentCapabilityRow): string {
    const params = row.definition.params ?? [];
    if (params.length === 0) return 'No params';
    return params
      .slice(0, 4)
      .map((param) => {
        const bounds = [
          param.min === undefined ? null : `min ${param.min}`,
          param.max === undefined ? null : `max ${param.max}`,
        ]
          .filter(Boolean)
          .join(' / ');
        return bounds ? `${param.key} (${bounds})` : param.key;
      })
      .join(', ');
  }

  function portSummary(row: AgentCapabilityRow): string {
    const inputs = row.definition.ports.inputs.length;
    const outputs = row.definition.ports.outputs.length;
    return `${inputs} in / ${outputs} out`;
  }
</script>

<Card title="Node Manager">
  <section class="node-manager" data-node-manager-panel>
    <div class="summary-strip">
      <div>
        <span>{rows.length}</span>
        <small>node types</small>
      </div>
      <div>
        <span>{enabledCount}</span>
        <small>AI enabled</small>
      </div>
      <div>
        <span>{disabledCount}</span>
        <small>disabled</small>
      </div>
      <div>
        <span>{customCount}</span>
        <small>custom</small>
      </div>
      <div>
        <span>{pluginCount}</span>
        <small>plugin</small>
      </div>
    </div>

    <div class="toolbar">
      <input
        bind:value={query}
        aria-label="Search node capabilities"
        placeholder="Search type, label, notes"
      />
      <select bind:value={sourceFilter} aria-label="Source filter">
        <option value="all">All sources</option>
        <option value="builtin">Builtin</option>
        <option value="custom">Custom</option>
        <option value="plugin">Plugin</option>
      </select>
      <select bind:value={statusFilter} aria-label="Status filter">
        <option value="all">All status</option>
        <option value="enabled">AI enabled</option>
        <option value="disabled">Disabled</option>
      </select>
    </div>

    {#if lastError}
      <p class="error-text">{lastError}</p>
    {/if}

    {#if !$semanticSnapshot}
      <p class="empty">Waiting for server semantic snapshot.</p>
    {:else if filteredRows.length === 0}
      <p class="empty">No node types match the current filters.</p>
    {:else}
      <div class="node-table" aria-label="AI node capability manager">
        <div class="node-table-head">
          <span>Node</span>
          <span>Source</span>
          <span>Usage</span>
          <span>AI</span>
        </div>
        {#each filteredRows as row (row.type)}
          <article class:disabled={!row.enabled} class="node-row">
            <div class="node-main">
              <div class="node-title">
                <h4>{row.label}</h4>
                <code>{row.type}</code>
              </div>
              <p>{paramSummary(row)}</p>
              <small>{portSummary(row)} · {row.category}</small>
              {#if row.disabledReason}
                <small class="reason">{row.disabledReason}</small>
              {/if}
            </div>
            <div>
              <span class="badge {row.source}">{row.source}</span>
              {#if row.customDefinition}
                <small>{row.customDefinition.ports.length} public ports</small>
              {/if}
            </div>
            <div>
              <strong>{row.usedCount}</strong>
              <small>instances</small>
            </div>
            <div class="actions">
              <span class:visible={row.manifestVisible} class="manifest-state">
                {row.manifestVisible ? 'in manifest' : 'hidden'}
              </span>
              <Button
                size="sm"
                variant={row.enabled ? 'ghost' : 'secondary'}
                on:click={() => setCapability(row, !row.enabled)}
              >
                {row.enabled ? 'Disable' : 'Enable'}
              </Button>
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </section>
</Card>

<style>
  .node-manager {
    display: grid;
    gap: var(--space-md);
  }

  .summary-strip,
  .toolbar {
    display: grid;
    gap: var(--space-sm);
  }

  .summary-strip {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .summary-strip > div,
  .node-row,
  .toolbar input,
  .toolbar select {
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: rgba(255, 255, 255, 0.03);
  }

  .summary-strip > div {
    display: grid;
    gap: 2px;
    padding: var(--space-sm);
  }

  .summary-strip span {
    color: var(--text-primary);
    font-size: var(--text-lg);
    font-weight: 700;
  }

  .toolbar {
    grid-template-columns: minmax(220px, 1fr) 160px 160px;
  }

  .toolbar input,
  .toolbar select {
    min-width: 0;
    padding: 9px 10px;
    color: var(--text-primary);
    font: inherit;
  }

  .node-table {
    display: grid;
    gap: var(--space-xs);
  }

  .node-table-head,
  .node-row {
    display: grid;
    grid-template-columns: minmax(280px, 1fr) 120px 96px 170px;
    gap: var(--space-md);
    align-items: center;
  }

  .node-table-head {
    padding: 0 var(--space-sm);
    color: var(--text-muted);
    font-size: var(--text-xs);
    text-transform: uppercase;
  }

  .node-row {
    padding: var(--space-sm);
  }

  .node-row.disabled {
    opacity: 0.72;
  }

  .node-main,
  .node-row > div {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .node-title {
    display: flex;
    align-items: baseline;
    gap: var(--space-sm);
    min-width: 0;
  }

  h4,
  p,
  .empty,
  .error-text {
    margin: 0;
  }

  h4 {
    color: var(--text-primary);
    font-size: var(--text-sm);
  }

  code,
  small,
  p {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  code,
  p {
    overflow-wrap: anywhere;
  }

  strong {
    color: var(--text-primary);
    font-size: var(--text-md);
  }

  .badge,
  .manifest-state {
    justify-self: start;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: 2px 7px;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    text-transform: uppercase;
  }

  .badge.custom {
    border-color: rgba(20, 184, 166, 0.45);
    color: #5eead4;
  }

  .badge.plugin {
    border-color: rgba(245, 158, 11, 0.45);
    color: #fbbf24;
  }

  .manifest-state.visible {
    border-color: rgba(34, 197, 94, 0.45);
    color: #86efac;
  }

  .actions {
    justify-items: start;
  }

  .reason,
  .error-text {
    color: var(--color-error);
  }

  .empty {
    color: var(--text-muted);
  }

  @media (max-width: 900px) {
    .summary-strip,
    .toolbar,
    .node-table-head,
    .node-row {
      grid-template-columns: 1fr;
    }
  }
</style>
