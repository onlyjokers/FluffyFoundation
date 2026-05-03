// Purpose: verify FF-18 WP4 deterministic golden scenario contract traces.

import assert from 'node:assert/strict';
import test from 'node:test';

import { runFf18GoldenScenarioFixtures } from '../dist-ai-core/index.js';

test('GS-12 gyro rotation drives tense flashlight rhythm through semantic graph commands', () => {
  const traces = runFf18GoldenScenarioFixtures();
  const trace = traces.find((item) => item.scenarioId === 'GS-12');

  assert.equal(trace.semanticContext.deviceCapabilities[0].capabilities.includes('gyro.rotation'), true);
  assert.deepEqual(trace.commandSequence.map((command) => command.type), ['node.params.update']);
  assert.equal(trace.commandSequence[0].nodeId, 'flashlight:rhythm');
  assert.equal(trace.commandSequence[0].params.rhythmHz, 9);
  assert.equal(trace.expectedOutputChange.targetNodeId, 'flashlight:rhythm');
  assert.equal(trace.expectedOutputChange.params.tension, 0.86);
  assert.equal(trace.risk.level, 'high');
  assert.equal(trace.policy.dryRun.status, 'proposal-only');
  assert.equal(trace.policy.apply.status, 'allowed');
  assert.equal(trace.status.dryRun, 'dry-run-passed');
  assert.equal(trace.status.apply, 'applied');
  assert.ok(trace.audit.rollback.reference);
  assert.equal(trace.audit.historyEntry.status, 'applied');
  assert.equal(trace.observedResult.classification, 'success');
  assert.equal(trace.observedResult.structuredEvidence[0].kind, 'output-change');
  assert.equal(trace.redactionSummary.count > 0, true);
  assert.equal(JSON.stringify(trace).includes('/Users/'), false);
});

test('GS-13 display breathing applies bounded params and records structured output-change observation', () => {
  const traces = runFf18GoldenScenarioFixtures();
  const trace = traces.find((item) => item.scenarioId === 'GS-13');

  assert.equal(trace.semanticContext.nodes[0].id, 'display:breath');
  assert.deepEqual(trace.commandSequence.map((command) => command.type), ['node.params.update']);
  assert.equal(trace.commandSequence[0].params.intensity, 0.68);
  assert.equal(trace.commandSequence[0].params.breathRate, 0.42);
  assert.equal(trace.expectedOutputChange.summary, 'Display breathing intensity changes within bounded visual parameters.');
  assert.equal(trace.risk.level, 'medium');
  assert.equal(trace.status.apply, 'applied');
  assert.equal(trace.observedResult.classification, 'success');
  assert.deepEqual(trace.observedResult.structuredEvidence[0].changedTargets, ['display:breath']);
  assert.equal(trace.repair.type, 'unavailable');
  assert.equal(trace.redactionSummary.count > 0, true);
  assert.equal(JSON.stringify(trace).includes('shugu_secret'), false);
});

test('GS-14 repair starts from structured validation error and emits repaired command proposal', () => {
  const traces = runFf18GoldenScenarioFixtures();
  const trace = traces.find((item) => item.scenarioId === 'GS-14');

  assert.equal(trace.status.dryRun, 'dry-run-failed');
  assert.equal(trace.status.apply, 'dry-run-failed');
  assert.equal(trace.observedResult.classification, 'validation-failure');
  assert.equal(trace.observedResult.structuredErrors[0].code, 'GRAPH.PARAM_OUT_OF_RANGE');
  assert.equal(trace.repair.type, 'proposal');
  assert.deepEqual(trace.repair.proposal.commands, [
    { type: 'node.params.update', nodeId: 'display:overflow', params: { intensity: 1 } },
  ]);
  assert.deepEqual(trace.repair.sourceErrorCodes, ['GRAPH.PARAM_OUT_OF_RANGE']);
  assert.equal(trace.audit.rollback.reference, null);
  assert.equal(trace.audit.rollback.commandRollbackTokens.length, 0);
  assert.equal(JSON.stringify(trace).includes('consoleText'), false);
  assert.equal(JSON.stringify(trace).includes('/Users/'), false);
});
