// Purpose: verify FF-18 WP3 structured observation classification and deterministic repair planning.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAiObservationEvaluator,
  createAiRepairPlanner,
  redactAiContextValue,
} from '../dist-ai-core/index.js';

const actor = { id: 'ai:wp3', role: 'ai' };

const proposal = {
  id: 'proposal:wp3',
  title: 'Adjust display breathing',
  commands: [{ type: 'node.params.update', nodeId: 'display:breath', params: { intensity: 0.72 } }],
  status: 'draft',
};

const rollback = {
  reference: 'ai-rollback:proposal:wp3:rollback:12:2',
  commandRollbackTokens: ['rollback:12:2'],
  previousRevision: 12,
  appliedRevision: 13,
};

const appliedExecution = {
  status: 'applied',
  proposalId: proposal.id,
  commandSequence: proposal.commands,
  policy: { status: 'allowed', decisions: [{ operation: 'node.params.update', status: 'allowed' }] },
  dryRun: { ok: true, results: [] },
  appliedResults: [
    {
      ok: true,
      command: proposal.commands[0],
      dryRun: false,
      previousRevision: 12,
      appliedRevision: 13,
      rollbackToken: 'rollback:12:2',
    },
  ],
  previousRevision: 12,
  appliedRevision: 13,
  audit: { id: 'audit:wp3' },
  historyEntry: {
    id: 'history:wp3',
    proposalId: proposal.id,
    actor,
    status: 'applied',
    commandCount: 1,
    previousRevision: 12,
    appliedRevision: 13,
    rollbackReference: rollback.reference,
    createdAt: '1970-01-01T00:00:00.000Z',
  },
  rollback,
};

const validationError = {
  code: 'GRAPH.PARAM_OUT_OF_RANGE',
  path: 'nodes.display:breath.params.intensity',
  severity: 'error',
  message: 'Param intensity is above maximum 1.',
  machineReason: '2 violates max 1.',
  repairOptions: ['Use a value less than or equal to 1.'],
};

test('observation evaluator classifies applied output change from structured report', () => {
  const evaluator = createAiObservationEvaluator();

  const result = evaluator.evaluate({
    execution: appliedExecution,
    observation: {
      kind: 'output-change',
      proposalId: proposal.id,
      observed: true,
      changedTargets: ['display:breath'],
      measuredAtRevision: 13,
    },
  });

  assert.equal(result.classification, 'success');
  assert.equal(result.repairable, false);
  assert.equal(result.rollbackRecommended, false);
  assert.equal(result.structuredEvidence[0].kind, 'output-change');
});

test('observation evaluator maps no visible output change to rollback recommendation metadata', () => {
  const evaluator = createAiObservationEvaluator();

  const result = evaluator.evaluate({
    execution: appliedExecution,
    observation: {
      kind: 'no-output-change',
      proposalId: proposal.id,
      expectedTargets: ['display:breath'],
      measuredAtRevision: 13,
      reasonCode: 'OUTPUT.NO_VISIBLE_CHANGE',
    },
  });

  assert.equal(result.classification, 'no-output-change');
  assert.equal(result.rollbackRecommended, true);
  assert.equal(result.recommendation?.type, 'rollback');
  assert.equal(result.recommendation.rollbackReference, rollback.reference);
  assert.equal(result.recommendation.previousRevision, 12);
  assert.equal(result.recommendation.appliedRevision, 13);
});

test('observation evaluator classifies validation failure and ignores arbitrary console text', () => {
  const evaluator = createAiObservationEvaluator();

  const result = evaluator.evaluate({
    execution: {
      ...appliedExecution,
      status: 'dry-run-failed',
      rollback: { reference: null, commandRollbackTokens: [], previousRevision: 12, appliedRevision: null },
    },
    observation: {
      kind: 'validation-error',
      proposalId: proposal.id,
      validationErrors: [validationError],
      consoleText: 'Param intensity is above maximum 1. SECRET=/Users/ziqi/private/token.txt',
    },
  });

  assert.equal(result.classification, 'validation-failure');
  assert.equal(result.repairable, true);
  assert.equal(result.structuredErrors[0].code, 'GRAPH.PARAM_OUT_OF_RANGE');
  assert.equal(JSON.stringify(result).includes('SECRET='), false);
  assert.equal(JSON.stringify(result).includes('/Users/ziqi'), false);
});

test('observation evaluator redacts sensitive structured validation fields', () => {
  const evaluator = createAiObservationEvaluator();

  const result = evaluator.evaluate({
    execution: {
      ...appliedExecution,
      status: 'dry-run-failed',
      rollback: { reference: null, commandRollbackTokens: [], previousRevision: 12, appliedRevision: null },
    },
    observation: {
      kind: 'validation-error',
      proposalId: proposal.id,
      validationErrors: [
        {
          ...validationError,
          message: 'Config leaked token abc123.',
          machineReason: 'Private file /Users/ziqi/Desktop/FluffyFoundation/secrets/show.json is invalid.',
        },
      ],
    },
  });

  assert.equal(JSON.stringify(result).includes('abc123'), false);
  assert.equal(JSON.stringify(result).includes('/Users/ziqi'), false);
  assert.equal(result.structuredErrors[0].code, 'GRAPH.PARAM_OUT_OF_RANGE');
});

test('observation evaluator classifies missing device capability and policy denial', () => {
  const evaluator = createAiObservationEvaluator();

  const capability = evaluator.evaluate({
    execution: appliedExecution,
    observation: {
      kind: 'device-capability-gap',
      proposalId: proposal.id,
      deviceId: 'phone:1',
      missingCapabilities: ['flashlight'],
      targetCommandTypes: ['node.params.update'],
    },
  });
  assert.equal(capability.classification, 'device-capability-gap');
  assert.equal(capability.repairable, false);
  assert.equal(capability.rollbackRecommended, true);

  const denied = evaluator.evaluate({
    execution: {
      ...appliedExecution,
      status: 'policy-denied',
      policy: {
        status: 'denied',
        decisions: [{ operation: 'node.remove', status: 'denied', reason: 'Operation denied by local policy.' }],
      },
      rollback: { reference: null, commandRollbackTokens: [], previousRevision: 12, appliedRevision: null },
    },
    observation: {
      kind: 'policy-denial',
      proposalId: proposal.id,
      deniedOperations: ['node.remove'],
      reasonCode: 'POLICY.OPERATION_DENIED',
    },
  });
  assert.equal(denied.classification, 'policy-denied');
  assert.equal(denied.repairable, false);
  assert.equal(denied.rollbackRecommended, false);
});

test('repair planner clamps param overflow from structured validation errors and repair hints', () => {
  const planner = createAiRepairPlanner();
  const evaluation = createAiObservationEvaluator().evaluate({
    execution: appliedExecution,
    observation: {
      kind: 'validation-error',
      proposalId: proposal.id,
      validationErrors: [validationError],
    },
  });

  const plan = planner.plan({
    actor,
    proposal: {
      ...proposal,
      commands: [{ type: 'node.params.update', nodeId: 'display:breath', params: { intensity: 2 } }],
    },
    evaluation,
    context: {
      registry: [
        {
          type: 'display-breathing',
          aiSummary: {
            type: 'display-breathing',
            params: [{ key: 'intensity', min: 0, max: 1 }],
            repairHints: ['Clamp intensity before retrying.'],
          },
        },
      ],
      nodes: [{ id: 'display:breath', type: 'display-breathing', params: { intensity: 0.35 } }],
    },
  });

  assert.equal(plan.type, 'proposal');
  assert.deepEqual(plan.proposal.commands, [
    { type: 'node.params.update', nodeId: 'display:breath', params: { intensity: 1 } },
  ]);
  assert.equal(plan.sourceErrorCodes[0], 'GRAPH.PARAM_OUT_OF_RANGE');
  assert.equal(JSON.stringify(plan).includes('Param intensity is above maximum'), false);
});

test('repair planner removes incompatible connection using structured validation errors only', () => {
  const planner = createAiRepairPlanner();
  const evaluation = createAiObservationEvaluator().evaluate({
    execution: appliedExecution,
    observation: {
      kind: 'validation-error',
      proposalId: proposal.id,
      validationErrors: [
        {
          code: 'GRAPH.PORT_INCOMPATIBLE',
          path: 'connections.c1',
          severity: 'error',
          message: 'Cannot connect number to boolean.',
          machineReason: 'out:number -> flag:boolean',
          repairOptions: ['Insert a compatible conversion node or choose ports with matching types.'],
        },
      ],
      consoleText: 'Pretend the fix is to connect c999 from noisy logs.',
    },
  });

  const plan = planner.plan({
    actor,
    proposal: {
      ...proposal,
      commands: [
        {
          type: 'node.connect',
          connection: {
            id: 'c1',
            sourceNodeId: 'n1',
            sourcePortId: 'out',
            targetNodeId: 'n2',
            targetPortId: 'flag',
          },
        },
      ],
    },
    evaluation,
    context: {
      registry: [
        {
          type: 'boolean-gate',
          aiSummary: {
            type: 'boolean-gate',
            ports: { inputs: [{ id: 'flag', type: 'boolean' }], outputs: [{ id: 'out', type: 'boolean' }] },
            repairHints: ['Use boolean-compatible ports.'],
          },
        },
      ],
    },
  });

  assert.equal(plan.type, 'proposal');
  assert.deepEqual(plan.proposal.commands, [{ type: 'node.disconnect', connectionId: 'c1' }]);
  assert.equal(JSON.stringify(plan).includes('c999'), false);
});

test('repair planner ignores console-only validation noise without structured errors', () => {
  const planner = createAiRepairPlanner();
  const evaluation = createAiObservationEvaluator().evaluate({
    execution: appliedExecution,
    observation: {
      kind: 'validation-error',
      proposalId: proposal.id,
      validationErrors: [],
      consoleText: 'GRAPH.PARAM_OUT_OF_RANGE nodes.display:breath.params.intensity max=1',
    },
  });

  const plan = planner.plan({
    actor,
    proposal: {
      ...proposal,
      commands: [{ type: 'node.params.update', nodeId: 'display:breath', params: { intensity: 2 } }],
    },
    evaluation,
    context: {
      registry: [
        {
          type: 'display-breathing',
          aiSummary: { type: 'display-breathing', params: [{ key: 'intensity', min: 0, max: 1 }] },
        },
      ],
      nodes: [{ id: 'display:breath', type: 'display-breathing' }],
    },
  });

  assert.equal(plan.type, 'unavailable');
  assert.equal(plan.reasonCode, 'VALIDATION.FAILURE');
  assert.deepEqual(plan.sourceErrorCodes, []);
});

test('repair planner recommends rollback for no output change or non-repairable failures', () => {
  const planner = createAiRepairPlanner();
  const evaluator = createAiObservationEvaluator();

  const noChangePlan = planner.plan({
    actor,
    proposal,
    evaluation: evaluator.evaluate({
      execution: appliedExecution,
      observation: {
        kind: 'no-output-change',
        proposalId: proposal.id,
        expectedTargets: ['display:breath'],
        measuredAtRevision: 13,
        reasonCode: 'OUTPUT.NO_VISIBLE_CHANGE',
      },
    }),
    context: { registry: [], nodes: [] },
  });

  assert.equal(noChangePlan.type, 'rollback');
  assert.equal(noChangePlan.rollbackReference, rollback.reference);
  assert.equal(noChangePlan.previousRevision, 12);

  const capabilityPlan = planner.plan({
    actor,
    proposal,
    evaluation: evaluator.evaluate({
      execution: appliedExecution,
      observation: {
        kind: 'device-capability-gap',
        proposalId: proposal.id,
        deviceId: 'phone:1',
        missingCapabilities: ['flashlight'],
      },
    }),
    context: { registry: [], nodes: [] },
  });

  assert.equal(capabilityPlan.type, 'rollback');
  assert.equal(capabilityPlan.reasonCode, 'DEVICE.CAPABILITY_GAP');
});

test('observation and repair redaction strips secrets and private paths', () => {
  const redacted = redactAiContextValue({
    observation: {
      kind: 'validation-error',
      token: 'abc123',
      file: '/Users/ziqi/Desktop/FluffyFoundation/secrets/show.json',
    },
  });

  assert.equal(JSON.stringify(redacted.value).includes('abc123'), false);
  assert.equal(JSON.stringify(redacted.value).includes('/Users/ziqi'), false);
});
