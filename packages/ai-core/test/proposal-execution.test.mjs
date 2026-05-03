// Purpose: verify FF-18 WP2 in-memory AI proposal approval, execution, audit, and rollback behavior.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSemanticCommandBus } from '../../node-core/dist-node-core/semantic-command-bus.js';
import { createAiProposalExecutionCore } from '../dist-ai-core/index.js';

const definitions = [
  {
    type: 'display-breathing',
    label: 'Display Breathing',
    category: 'Effects',
    inputs: [],
    outputs: [],
    configSchema: [
      { key: 'intensity', label: 'Intensity', type: 'number', defaultValue: 0.35, min: 0, max: 1 },
      { key: 'breathRate', label: 'Breath Rate', type: 'number', defaultValue: 1, min: 0.1, max: 2 },
    ],
  },
  {
    type: 'note',
    label: 'Note',
    category: 'Utility',
    inputs: [],
    outputs: [],
    configSchema: [],
  },
];

const baseGraph = () => ({
  nodes: [
    {
      id: 'display:breath',
      type: 'display-breathing',
      position: { x: 10, y: 20 },
      config: { intensity: 0.35, breathRate: 1 },
      inputValues: {},
      outputValues: {},
    },
  ],
  connections: [],
});

const proposal = (overrides = {}) => ({
  id: 'proposal:breath',
  title: 'Adjust display breathing',
  status: 'draft',
  commands: [
    {
      type: 'node.params.update',
      nodeId: 'display:breath',
      params: { intensity: 0.72 },
    },
  ],
  ...overrides,
});

function createBus(options = {}) {
  return createSemanticCommandBus({
    graph: baseGraph(),
    definitions,
    revision: 12,
    policy: {
      canExecute: ({ actor, command }) => {
        if (actor.role !== 'ai') return { allowed: false, reason: 'Only AI actor is used in this fixture.' };
        if (command.type === 'node.remove') return { allowed: false, reason: 'Destructive removes are disabled.' };
        return { allowed: true };
      },
    },
    ...options,
  });
}

test('approval-required proposal commands dry-run but do not apply until approved', () => {
  const bus = createBus();
  const executor = createAiProposalExecutionCore({
    bus,
    policy: {
      allowedOperations: [],
      approvalRequiredOperations: ['node.params.update'],
      deniedOperations: [],
    },
  });

  const result = executor.executeProposal({
    actor: { id: 'ai:wp2', role: 'ai' },
    proposal: proposal(),
  });

  assert.equal(result.status, 'approval-required');
  assert.equal(result.policy.status, 'approval-required');
  assert.equal(result.dryRun.ok, true);
  assert.equal(result.dryRun.results.length, 1);
  assert.equal(result.appliedResults.length, 0);
  assert.equal(bus.getSnapshot().nodes[0].params.intensity, 0.35);
  assert.equal(bus.getHistory().length, 0);
  assert.equal(result.historyEntry, null);
  assert.equal(result.rollback.reference, null);
});

test('allowed AI-owned draft proposal applies through the semantic command bus and records execution metadata', () => {
  const bus = createBus();
  const executor = createAiProposalExecutionCore({
    bus,
    policy: {
      allowedOperations: ['node.params.update'],
      approvalRequiredOperations: [],
      deniedOperations: [],
    },
  });

  const result = executor.executeProposal({
    actor: { id: 'ai:wp2', role: 'ai' },
    proposal: proposal(),
  });

  assert.equal(result.status, 'applied');
  assert.equal(result.policy.status, 'allowed');
  assert.deepEqual(result.commandSequence.map((command) => command.type), ['node.params.update']);
  assert.equal(result.dryRun.ok, true);
  assert.equal(result.dryRun.results[0].dryRun, true);
  assert.equal(result.appliedResults.length, 1);
  assert.equal(result.appliedResults[0].dryRun, false);
  assert.equal(result.previousRevision, 12);
  assert.equal(result.appliedRevision, 13);
  assert.equal(bus.getSnapshot().nodes[0].params.intensity, 0.72);
  assert.equal(bus.getHistory().length, 1);
  assert.ok(result.historyEntry);
  assert.equal(result.historyEntry.proposalId, 'proposal:breath');
  assert.equal(result.historyEntry.status, 'applied');
  assert.equal(result.historyEntry.commandCount, 1);
  assert.equal(result.audit.lifecycle.includes('dry-run'), true);
  assert.equal(result.audit.commandAudits.length, 1);
  assert.ok(result.rollback.reference);
  assert.deepEqual(result.rollback.commandRollbackTokens, [result.appliedResults[0].rollbackToken]);
});

test('policy-denied proposal commands do not apply and return structured policy results', () => {
  const bus = createBus();
  const executor = createAiProposalExecutionCore({
    bus,
    policy: {
      allowedOperations: ['node.params.update'],
      approvalRequiredOperations: [],
      deniedOperations: ['node.remove'],
    },
  });

  const result = executor.executeProposal({
    actor: { id: 'ai:wp2', role: 'ai' },
    proposal: proposal({
      id: 'proposal:remove',
      commands: [{ type: 'node.remove', nodeId: 'display:breath' }],
    }),
  });

  assert.equal(result.status, 'policy-denied');
  assert.equal(result.policy.status, 'denied');
  assert.equal(result.policy.decisions[0].operation, 'node.remove');
  assert.match(result.policy.decisions[0].reason, /denied/i);
  assert.equal(result.dryRun.results.length, 0);
  assert.equal(result.appliedResults.length, 0);
  assert.equal(bus.getSnapshot().nodes.length, 1);
  assert.equal(bus.getHistory().length, 0);
});

test('approved proposal applies transactionally and rollback restores previous semantic state', () => {
  const bus = createBus();
  const executor = createAiProposalExecutionCore({
    bus,
    policy: {
      allowedOperations: [],
      approvalRequiredOperations: ['node.params.update'],
      deniedOperations: [],
    },
  });

  const applied = executor.executeProposal({
    actor: { id: 'ai:wp2', role: 'ai' },
    proposal: proposal({ status: 'accepted' }),
    approval: { approvedBy: 'manager:1', approvedAt: '1970-01-01T00:00:00.000Z' },
  });

  assert.equal(applied.status, 'applied');
  assert.equal(applied.policy.status, 'allowed');
  assert.equal(applied.policy.approval?.approvedBy, 'manager:1');
  assert.equal(bus.getSnapshot().nodes[0].params.intensity, 0.72);

  const rolledBack = executor.rollback(applied.rollback.reference);

  assert.equal(rolledBack.ok, true);
  assert.equal(rolledBack.reference, applied.rollback.reference);
  assert.equal(rolledBack.restoredRevision, 14);
  assert.equal(bus.getSnapshot().nodes[0].params.intensity, 0.35);
  assert.equal(executor.getHistory()[0].rollbackReference, applied.rollback.reference);
  assert.equal(executor.getAuditLog().some((entry) => entry.type === 'rollback'), true);
});
