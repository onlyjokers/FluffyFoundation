// Purpose: Verify Manager-side AI node capability rows and semantic toggle commands.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SemanticGraphSnapshot } from '@shugu/node-core';

import {
  buildAgentCapabilityRows,
  createAgentCapabilityCommand,
  filterAgentCapabilityRows,
  summarizeAgentCapabilityRows,
} from './agent-capability-manager';

const snapshot = (): SemanticGraphSnapshot => ({
  revision: 3,
  nodes: [{ id: 'n1', type: 'display-text', params: {}, inputValues: {}, outputValues: {} }],
  definitions: [
    {
      type: 'display-text',
      label: 'Display Text',
      category: 'Display',
      ports: { inputs: [], outputs: [] },
      params: [{ key: 'text', label: 'Text', type: 'string', default: 'Hello' }],
      aiSummary: { description: 'Shows text on a display surface.' },
    },
    {
      type: 'plugin:sparkle',
      label: 'Sparkle',
      category: 'Plugin',
      ports: { inputs: [], outputs: [] },
      params: [],
    },
    {
      type: 'custom:triplet-pulse',
      label: 'Triplet Pulse',
      category: 'Custom',
      ports: { inputs: [], outputs: [{ id: 'value', label: 'Value', type: 'number' }] },
      params: [],
    },
  ],
  customDefinitions: [
    {
      definitionId: 'triplet-pulse',
      name: 'Triplet Pulse',
      template: { nodes: [], connections: [] },
      ports: [
        {
          portKey: 'value',
          side: 'output',
          label: 'Value',
          type: 'number',
          pinned: true,
          y: 12,
          binding: { nodeId: 'inner-number', portId: 'value' },
        },
      ],
    },
  ],
  agentCapabilities: {
    version: 1,
    nodes: [
      {
        nodeType: 'display-text',
        enabled: false,
        source: 'builtin',
        disabledReason: 'Too broad for this show',
        aiNotes: 'Use custom triplet pulse instead.',
      },
    ],
  },
  connections: [],
  groups: [],
  partitions: [],
  runtimeStatus: { running: false, deployedPartitionIds: [] },
  deviceCapabilities: [],
  errors: [],
  permissions: [],
});

test('buildAgentCapabilityRows combines definitions, source, usage, and capability settings', () => {
  const rows = buildAgentCapabilityRows(snapshot());

  assert.deepEqual(
    rows.map((row) => ({
      type: row.type,
      source: row.source,
      enabled: row.enabled,
      usedCount: row.usedCount,
      manifestVisible: row.manifestVisible,
      disabledReason: row.disabledReason,
    })),
    [
      {
        type: 'custom:triplet-pulse',
        source: 'custom',
        enabled: true,
        usedCount: 0,
        manifestVisible: true,
        disabledReason: undefined,
      },
      {
        type: 'display-text',
        source: 'builtin',
        enabled: false,
        usedCount: 1,
        manifestVisible: false,
        disabledReason: 'Too broad for this show',
      },
      {
        type: 'plugin:sparkle',
        source: 'plugin',
        enabled: true,
        usedCount: 0,
        manifestVisible: true,
        disabledReason: undefined,
      },
    ]
  );
  assert.equal(rows[0].customDefinition?.definitionId, 'triplet-pulse');
  assert.equal(rows[1].aiNotes, 'Use custom triplet pulse instead.');
});

test('createAgentCapabilityCommand emits a semantic command with source and reason', () => {
  assert.deepEqual(
    createAgentCapabilityCommand({
      nodeType: 'custom:triplet-pulse',
      source: 'custom',
      enabled: false,
      disabledReason: 'Not ready for AI use',
      aiNotes: 'Internal beta node',
    }),
    {
      type: 'agent.capability.set',
      nodeType: 'custom:triplet-pulse',
      source: 'custom',
      enabled: false,
      disabledReason: 'Not ready for AI use',
      aiNotes: 'Internal beta node',
    }
  );
});

test('summarizeAgentCapabilityRows counts AI availability by source and category', () => {
  const summary = summarizeAgentCapabilityRows(buildAgentCapabilityRows(snapshot()));

  assert.deepEqual(summary, {
    total: 3,
    enabled: 2,
    disabled: 1,
    custom: 1,
    builtin: 1,
    plugin: 1,
    categories: [
      { category: 'Custom', count: 1, enabled: 1 },
      { category: 'Display', count: 1, enabled: 0 },
      { category: 'Plugin', count: 1, enabled: 1 },
    ],
  });
});

test('filterAgentCapabilityRows filters by source, status, category, and query', () => {
  const rows = buildAgentCapabilityRows(snapshot());

  assert.deepEqual(
    filterAgentCapabilityRows(rows, {
      query: '',
      sourceFilter: 'custom',
      statusFilter: 'all',
      categoryFilter: 'all',
    }).map((row) => row.type),
    ['custom:triplet-pulse']
  );

  assert.deepEqual(
    filterAgentCapabilityRows(rows, {
      query: '',
      sourceFilter: 'all',
      statusFilter: 'disabled',
      categoryFilter: 'all',
    }).map((row) => row.type),
    ['display-text']
  );

  assert.deepEqual(
    filterAgentCapabilityRows(rows, {
      query: 'spark',
      sourceFilter: 'all',
      statusFilter: 'enabled',
      categoryFilter: 'Plugin',
    }).map((row) => row.type),
    ['plugin:sparkle']
  );
});
