<!-- Purpose: Full-page manager for controlling which semantic node capabilities are visible to AI agents. -->
<script lang="ts">
  import type { AgentCapabilityNodeSource } from '@shugu/node-core';
  import type { SemanticCommandPayload } from '@shugu/protocol';
  import Button from '$lib/components/ui/Button.svelte';
  import { semanticSnapshot } from '$lib/stores/manager';
  import { getManagerSDK } from '$lib/stores/manager-sdk-access';
  import {
    buildAgentCapabilityRows,
    createAgentCapabilityCommand,
    summarizeAgentCapabilityRows,
    type AgentCapabilityRow,
  } from '$lib/nodes/agent-capability-manager';

  type SourceFilter = 'all' | AgentCapabilityNodeSource;
  type StatusFilter = 'all' | 'enabled' | 'disabled';

  let query = '';
  let sourceFilter: SourceFilter = 'all';
  let statusFilter: StatusFilter = 'all';
  let categoryFilter = 'all';
  let selectedType = '';
  let lastError = '';

  $: rows = $semanticSnapshot ? buildAgentCapabilityRows($semanticSnapshot) : [];
  $: summary = summarizeAgentCapabilityRows(rows);
  $: categoryOptions = summary.categories.map((entry) => entry.category);
  $: if (categoryFilter !== 'all' && !categoryOptions.includes(categoryFilter)) categoryFilter = 'all';
  $: filteredRows = rows.filter(matchesFilters);
  $: selectedRow =
    filteredRows.find((row) => row.type === selectedType) ?? filteredRows[0] ?? null;

  function matchesFilters(row: AgentCapabilityRow): boolean {
    const term = query.trim().toLowerCase();
    if (sourceFilter !== 'all' && row.source !== sourceFilter) return false;
    if (statusFilter === 'enabled' && !row.enabled) return false;
    if (statusFilter === 'disabled' && row.enabled) return false;
    if (categoryFilter !== 'all' && row.category !== categoryFilter) return false;
    if (!term) return true;
    return [
      row.type,
      row.label,
      row.category,
      row.aiNotes,
      row.disabledReason,
      row.definition.aiSummary?.description,
    ]
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

  function sourceLabel(source: AgentCapabilityNodeSource): string {
    if (source === 'builtin') return 'Builtin';
    if (source === 'custom') return 'Custom';
    return 'Plugin';
  }

  function paramSummary(row: AgentCapabilityRow): string {
    const params = row.definition.params ?? [];
    if (params.length === 0) return 'No params';
    return params
      .slice(0, 5)
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
    return `${inputs} input${inputs === 1 ? '' : 's'} / ${outputs} output${outputs === 1 ? '' : 's'}`;
  }

  function selectRow(row: AgentCapabilityRow): void {
    selectedType = row.type;
  }
</script>

<section class="node-manager-shell" data-node-manager-panel>
  <div class="node-manager-toolbar-frame">
    <div class="node-manager-toolbar pill-toolbar" role="region" aria-label="Node Manager toolbar">
      <div class="toolbar-left">
        <div class="count-chip">
          {#if filteredRows.length === rows.length}
            {rows.length} nodes
          {:else}
            {filteredRows.length} / {rows.length} nodes
          {/if}
        </div>
      </div>

      <div class="toolbar-center">
        <input
          class="toolbar-ctl toolbar-search"
          type="search"
          bind:value={query}
          placeholder="Search type / label / category / AI notes..."
          aria-label="Search node capabilities"
        />
        <select class="toolbar-ctl toolbar-select" bind:value={sourceFilter} aria-label="Source filter">
          <option value="all">All sources</option>
          <option value="builtin">Builtin</option>
          <option value="custom">Custom</option>
          <option value="plugin">Plugin</option>
        </select>
        <select class="toolbar-ctl toolbar-select" bind:value={statusFilter} aria-label="Status filter">
          <option value="all">All status</option>
          <option value="enabled">AI enabled</option>
          <option value="disabled">Disabled</option>
        </select>
        <select class="toolbar-ctl toolbar-select" bind:value={categoryFilter} aria-label="Category filter">
          <option value="all">All categories</option>
          {#each categoryOptions as category (category)}
            <option value={category}>{category}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>

  <div class="node-manager-scroll">
    {#if lastError}
      <div class="banner error">{lastError}</div>
    {/if}

    <div class="summary-grid" aria-label="Node capability summary">
      <div class="summary-tile">
        <span>{summary.enabled}</span>
        <small>AI enabled</small>
      </div>
      <div class="summary-tile">
        <span>{summary.disabled}</span>
        <small>disabled</small>
      </div>
      <div class="summary-tile">
        <span>{summary.custom}</span>
        <small>custom</small>
      </div>
      <div class="summary-tile">
        <span>{summary.plugin}</span>
        <small>plugin</small>
      </div>
    </div>

    <div class="manager-grid">
      <section class="node-list-pane" aria-label="AI node capability list">
        {#if !$semanticSnapshot}
          <div class="empty-state">Waiting for server semantic snapshot.</div>
        {:else if filteredRows.length === 0}
          <div class="empty-state">No node types match the current filters.</div>
        {:else}
          <div class="list-head">
            <div>Node</div>
            <div>Source</div>
            <div>Used</div>
            <div>AI</div>
          </div>
          <div class="node-list">
            {#each filteredRows as row (row.type)}
              <button
                class="node-row"
                class:selected={selectedRow?.type === row.type}
                class:disabled={!row.enabled}
                type="button"
                on:click={() => selectRow(row)}
              >
                <div class="node-main">
                  <div class="node-title">
                    <strong>{row.label}</strong>
                    <code>{row.type}</code>
                  </div>
                  <span>{row.category} · {portSummary(row)}</span>
                </div>
                <div><span class="pill {row.source}">{sourceLabel(row.source)}</span></div>
                <div class="mono">{row.usedCount}</div>
                <div>
                  <span class:visible={row.manifestVisible} class="state-pill">
                    {row.manifestVisible ? 'Enabled' : 'Hidden'}
                  </span>
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </section>

      <aside class="details-pane" aria-label="Node capability details">
        {#if selectedRow}
          <div class="details-header">
            <div>
              <div class="details-eyebrow">{sourceLabel(selectedRow.source)} / {selectedRow.category}</div>
              <h3>{selectedRow.label}</h3>
              <code>{selectedRow.type}</code>
            </div>
            <Button
              size="sm"
              variant={selectedRow.enabled ? 'ghost' : 'primary'}
              on:click={() => setCapability(selectedRow, !selectedRow.enabled)}
            >
              {selectedRow.enabled ? 'Disable for AI' : 'Enable for AI'}
            </Button>
          </div>

          <div class="detail-section">
            <div class="section-title">Manifest</div>
            <div class="kv-grid">
              <div>
                <span>AI State</span>
                <strong>{selectedRow.enabled ? 'Enabled' : 'Disabled'}</strong>
              </div>
              <div>
                <span>Instances</span>
                <strong>{selectedRow.usedCount}</strong>
              </div>
              <div>
                <span>Ports</span>
                <strong>{portSummary(selectedRow)}</strong>
              </div>
            </div>
          </div>

          <div class="detail-section">
            <div class="section-title">Parameters</div>
            <p>{paramSummary(selectedRow)}</p>
          </div>

          {#if selectedRow.definition.aiSummary?.description}
            <div class="detail-section">
              <div class="section-title">AI Notes</div>
              <p>{selectedRow.definition.aiSummary.description}</p>
            </div>
          {/if}

          {#if selectedRow.aiNotes || selectedRow.disabledReason}
            <div class="detail-section">
              <div class="section-title">Operator Policy</div>
              {#if selectedRow.aiNotes}
                <p>{selectedRow.aiNotes}</p>
              {/if}
              {#if selectedRow.disabledReason}
                <p class="reason">{selectedRow.disabledReason}</p>
              {/if}
            </div>
          {/if}

          {#if selectedRow.customDefinition}
            <div class="detail-section">
              <div class="section-title">Custom Node</div>
              <div class="kv-grid">
                <div>
                  <span>Internal Nodes</span>
                  <strong>{selectedRow.customDefinition.template.nodes.length}</strong>
                </div>
                <div>
                  <span>Internal Edges</span>
                  <strong>{selectedRow.customDefinition.template.connections.length}</strong>
                </div>
                <div>
                  <span>Public Ports</span>
                  <strong>{selectedRow.customDefinition.ports.length}</strong>
                </div>
              </div>
            </div>
          {/if}
        {:else}
          <div class="empty-state">Select a node type to inspect its AI capability.</div>
        {/if}
      </aside>
    </div>
  </div>
</section>

<style>
  .node-manager-shell {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    width: 100%;
    height: 100%;
    position: relative;
    background:
      radial-gradient(circle at 18% 0%, rgba(20, 184, 166, 0.14), transparent 44%),
      radial-gradient(circle at 82% 6%, rgba(99, 102, 241, 0.14), transparent 48%),
      linear-gradient(180deg, #080a12 0%, #050711 100%);
    overflow: hidden;
  }

  .node-manager-toolbar-frame {
    position: absolute;
    top: var(--ui-pill-toolbar-top);
    left: 0;
    right: 0;
    margin-left: var(--space-2xl, 32px);
    margin-right: var(--space-2xl, 32px);
    z-index: 25;
    display: flex;
    pointer-events: none;
  }

  .node-manager-toolbar {
    width: 100%;
    pointer-events: auto;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  .node-manager-toolbar::-webkit-scrollbar {
    height: 0;
  }

  .toolbar-left,
  .toolbar-center {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 10px;
  }

  .toolbar-center {
    flex: 1 1 auto;
  }

  .toolbar-ctl {
    height: 30px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 6, 23, 0.36);
    color: rgba(255, 255, 255, 0.9);
    font: inherit;
    font-size: 12px;
  }

  .toolbar-ctl:focus {
    outline: none;
    border-color: rgba(20, 184, 166, 0.55);
    box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.14);
  }

  .toolbar-search {
    flex: 1 1 320px;
    min-width: 220px;
  }

  .toolbar-select {
    width: 148px;
  }

  .count-chip {
    padding: 6px 10px;
    border-radius: var(--radius-full);
    border: 1px solid var(--border-color);
    background: rgba(15, 23, 42, 0.6);
    font-size: var(--text-xs);
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .node-manager-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    padding: calc(var(--ui-pill-toolbar-top) + var(--ui-pill-toolbar-height) + var(--space-xl))
      var(--space-2xl, 32px) var(--space-2xl, 32px);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(120px, 1fr));
    gap: 12px;
  }

  .summary-tile,
  .node-list-pane,
  .details-pane {
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(10, 14, 24, 0.7);
    backdrop-filter: blur(10px);
  }

  .summary-tile {
    min-height: 72px;
    border-radius: 16px;
    padding: 12px;
    display: grid;
    align-content: center;
    gap: 4px;
  }

  .summary-tile span {
    color: var(--text-primary);
    font-size: 24px;
    font-weight: 800;
    line-height: 1;
  }

  .summary-tile small {
    color: var(--text-secondary);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .manager-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(340px, 420px);
    gap: 16px;
    align-items: start;
  }

  .node-list-pane,
  .details-pane {
    border-radius: 18px;
    overflow: hidden;
  }

  .details-pane {
    position: sticky;
    top: 0;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .list-head,
  .node-row {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) 120px 80px 110px;
    gap: 12px;
    align-items: center;
    padding: 10px 12px;
  }

  .list-head {
    color: var(--text-secondary);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .node-list {
    display: flex;
    flex-direction: column;
  }

  .node-row {
    width: 100%;
    border: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: transparent;
    color: var(--text-primary);
    text-align: left;
    cursor: pointer;
    transition:
      background var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .node-row:hover,
  .node-row.selected {
    background: rgba(20, 184, 166, 0.08);
  }

  .node-row.selected {
    box-shadow: inset 3px 0 0 rgba(20, 184, 166, 0.82);
  }

  .node-row.disabled {
    opacity: 0.7;
  }

  .node-main,
  .node-title {
    min-width: 0;
  }

  .node-main {
    display: grid;
    gap: 4px;
  }

  .node-title {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .node-title strong,
  .details-header h3,
  .detail-section p {
    margin: 0;
  }

  .node-title strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  code,
  .mono {
    font-family: var(--font-mono);
  }

  code,
  .node-main span,
  .detail-section p,
  .details-eyebrow {
    color: var(--text-secondary);
    font-size: 12px;
  }

  code {
    overflow-wrap: anywhere;
  }

  .pill,
  .state-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 22px;
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 6, 23, 0.35);
    color: rgba(255, 255, 255, 0.84);
    font-size: 10px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .pill.custom {
    border-color: rgba(20, 184, 166, 0.45);
    color: #5eead4;
  }

  .pill.plugin {
    border-color: rgba(245, 158, 11, 0.45);
    color: #fbbf24;
  }

  .state-pill.visible {
    border-color: rgba(34, 197, 94, 0.45);
    color: #86efac;
  }

  .details-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: start;
  }

  .details-header h3 {
    color: var(--text-primary);
    font-size: 20px;
    line-height: 1.15;
  }

  .details-eyebrow,
  .section-title {
    text-transform: uppercase;
    letter-spacing: 0.7px;
    font-weight: 700;
  }

  .detail-section {
    display: grid;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .section-title {
    color: var(--text-muted);
    font-size: 11px;
  }

  .kv-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .kv-grid div {
    min-width: 0;
    padding: 9px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.035);
    display: grid;
    gap: 4px;
  }

  .kv-grid span {
    color: var(--text-secondary);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .kv-grid strong {
    min-width: 0;
    color: var(--text-primary);
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .reason,
  .banner.error {
    color: var(--color-error);
  }

  .banner {
    padding: 10px 12px;
    border-radius: var(--radius-lg);
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(2, 6, 23, 0.28);
    font-size: 12px;
  }

  .banner.error {
    border-color: rgba(239, 68, 68, 0.35);
    background: rgba(239, 68, 68, 0.12);
  }

  .empty-state {
    padding: 24px;
    color: var(--text-secondary);
    font-size: 13px;
  }

  @media (max-width: 1100px) {
    .manager-grid {
      grid-template-columns: 1fr;
    }

    .details-pane {
      position: static;
    }
  }

  @media (max-width: 760px) {
    .summary-grid,
    .list-head,
    .node-row,
    .details-header,
    .kv-grid {
      grid-template-columns: 1fr;
    }

    .node-manager-toolbar-frame,
    .node-manager-scroll {
      margin-left: 0;
      margin-right: 0;
      padding-left: 14px;
      padding-right: 14px;
    }
  }
</style>
