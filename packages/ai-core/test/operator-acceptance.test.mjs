// Purpose: verify FF-18 WP6 deterministic AI Operator safety acceptance traces.

import assert from 'node:assert/strict';
import test from 'node:test';

import { runAiOperatorAcceptanceFixtures } from '../dist-ai-core/index.js';

test('AI Operator acceptance traces cover capability gap, policy denial, injection handling, and denied non-execution', () => {
  const traces = runAiOperatorAcceptanceFixtures();

  assert.deepEqual(traces.map((trace) => trace.scenarioId), [
    'capability-gap',
    'policy-denial',
    'prompt-injection-registry',
  ]);

  const capabilityGap = traces.find((trace) => trace.scenarioId === 'capability-gap');
  assert.equal(capabilityGap.execution.status, 'applied');
  assert.equal(capabilityGap.evaluation.classification, 'device-capability-gap');
  assert.equal(capabilityGap.fallback.type, 'proposal');
  assert.equal(capabilityGap.fallback.reasonCode, 'DEVICE.CAPABILITY_GAP');
  assert.equal(capabilityGap.fallback.proposal.commands[0].type, 'node.params.update');
  assert.equal(capabilityGap.fallback.proposal.commands[0].params.mode, 'screen-pulse');
  assert.equal(capabilityGap.nonExecution.appliedMutation, true);
  assert.equal(capabilityGap.redactionSummary.count > 0, true);

  const policyDenied = traces.find((trace) => trace.scenarioId === 'policy-denial');
  assert.equal(policyDenied.execution.status, 'policy-denied');
  assert.equal(policyDenied.evaluation.classification, 'policy-denied');
  assert.equal(policyDenied.fallback.type, 'proposal');
  assert.equal(policyDenied.fallback.reasonCode, 'POLICY.APPROVAL_REQUIRED');
  assert.equal(policyDenied.fallback.proposal.status, 'proposed');
  assert.equal(policyDenied.fallback.proposal.commands[0].type, 'node.remove');
  assert.equal(policyDenied.nonExecution.appliedMutation, false);
  assert.equal(policyDenied.nonExecution.beforeRevision, policyDenied.nonExecution.afterRevision);
  assert.equal(policyDenied.nonExecution.beforeNodeCount, policyDenied.nonExecution.afterNodeCount);

  const injection = traces.find((trace) => trace.scenarioId === 'prompt-injection-registry');
  assert.equal(injection.execution.status, 'policy-denied');
  assert.equal(injection.evaluation.classification, 'policy-denied');
  assert.equal(injection.fallback.type, 'unavailable');
  assert.equal(injection.injection.handledAsData, true);
  assert.equal(injection.injection.deniedOperation, 'node.remove');
  assert.equal(injection.nonExecution.appliedMutation, false);
  assert.equal(JSON.stringify(injection.semanticContext).includes('IGNORE ALL POLICY'), true);
  assert.equal(JSON.stringify(injection).includes('/Users/'), false);
  assert.equal(JSON.stringify(injection).includes('shugu_secret'), false);
  assert.equal(JSON.stringify(injection).includes(['document', '.'].join('')), false);
  assert.equal(JSON.stringify(injection).includes(['window', '.'].join('')), false);
});
