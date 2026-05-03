// Purpose: verify FF-18 WP1 AI semantic context packaging, redaction, and proposal dry-run behavior.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAiSemanticContext,
  createDeterministicSemanticPlanner,
  redactAiContextValue,
} from '../dist-ai-core/index.js';

const definitions = [
  {
    type: 'display-breathing',
    label: 'Display Breathing',
    category: 'Effects',
    aiSummary: {
      type: 'display-breathing',
      label: 'Display Breathing',
      version: '1.0.0',
      category: 'Effects',
      description: 'Controls a display breathing visual.',
      platforms: ['display'],
      sideEffects: 'remote-control',
      permissions: ['control:send'],
      ports: { inputs: [], outputs: [] },
      params: [
        { key: 'intensity', type: 'number', default: 0.4, min: 0, max: 1, step: 0.05, unit: 'ratio' },
        { key: 'breathRate', type: 'number', default: 0.8, min: 0.1, max: 2, step: 0.1, unit: 'hz' },
      ],
      compatibility: [],
      examples: [{ title: 'Breathing', summary: 'Raise intensity and lower breath rate.' }],
      risks: ['May alter show output.'],
      repairHints: ['Keep intensity within 0..1.'],
    },
    ports: { inputs: [], outputs: [] },
    params: [
      { key: 'intensity', type: 'number', default: 0.4, min: 0, max: 1, step: 0.05, unit: 'ratio' },
      { key: 'breathRate', type: 'number', default: 0.8, min: 0.1, max: 2, step: 0.1, unit: 'hz' },
    ],
  },
];

function fixtureSnapshot() {
  return {
    revision: 12,
    nodes: [
      {
        id: 'display:breath',
        type: 'display-breathing',
        params: {
          intensity: 0.35,
          breathRate: 1,
          managerKey: 'shugu_secret_123',
          localPath: '/Users/ziqi/private/show.json',
        },
        inputValues: { viewportZoom: 2, rawPath: '/Users/ziqi/irrelevant' },
        outputValues: { brightness: 0.35 },
        position: { x: 240, y: 180 },
        selected: true,
        color: '#ff00ff',
      },
    ],
    definitions,
    connections: [],
    groups: [
      {
        id: 'group:display',
        parentId: null,
        name: 'Display Group',
        nodeIds: ['display:breath'],
        disabled: false,
        owner: { actorId: 'manager-1', role: 'manager', capabilities: ['group.mutate'] },
        surface: 'public',
        visibility: { defaultAccess: 'visible-readonly' },
        collapsed: true,
      },
    ],
    partitions: [
      {
        id: 'partition:display',
        nodeIds: ['display:breath'],
        targetPlatform: 'display',
        status: 'deployed',
        boundRevision: 12,
      },
    ],
    runtimeStatus: { running: true, deployedPartitionIds: ['partition:display'] },
    deviceCapabilities: [{ deviceId: 'display-1', capabilities: ['display.render'], status: 'online' }],
    errors: [{ code: 'EXECUTION.NO_OUTPUT_CHANGE', message: 'Last change was not visible.' }],
    permissions: [{ actorId: 'ai:wp1', operations: ['proposal.create'] }],
    proposals: [
      {
        id: 'proposal:old',
        title: 'Old proposal',
        commands: [],
        status: 'draft',
        localPath: '/Users/ziqi/secret/proposal.json',
      },
    ],
  };
}

test('AI semantic context excludes layout noise and redacts secrets/private paths', () => {
  const context = buildAiSemanticContext({
    snapshot: fixtureSnapshot(),
    actor: { id: 'ai:wp1', role: 'ai' },
    policy: { mode: 'proposal-only', deniedOperations: ['read.secrets'], approvalRequired: ['node.params.update'] },
    validationReports: [
      {
        code: 'GRAPH.PARAM_OUT_OF_RANGE',
        path: 'nodes.display:breath.params.intensity',
        severity: 'error',
        message: 'Intensity is above maximum.',
        repairOptions: ['Set intensity to 1 or lower.'],
      },
    ],
    dryRunResults: [
      {
        ok: false,
        commandType: 'node.params.update',
        validationErrors: [{ code: 'GRAPH.PARAM_OUT_OF_RANGE', path: 'params.intensity', message: 'Too high.' }],
      },
    ],
  });

  const serialized = JSON.stringify(context);
  assert.equal(serialized.includes('position'), false);
  assert.equal(serialized.includes('viewportZoom'), false);
  assert.equal(serialized.includes('selected'), false);
  assert.equal(serialized.includes('collapsed'), false);
  assert.equal(serialized.includes('color'), false);
  assert.equal(serialized.includes('shugu_secret_123'), false);
  assert.equal(serialized.includes('/Users/ziqi'), false);
  assert.equal(context.redactions.count > 0, true);
  assert.equal(context.nodes[0].params.managerKey, '[REDACTED:secret]');
  assert.equal(context.nodes[0].params.localPath, '[REDACTED:private-path]');
  assert.equal(context.registry[0].aiSummary.description, 'Controls a display breathing visual.');
  assert.equal(context.permissions[0].operations[0], 'proposal.create');
  assert.equal(context.policy.mode, 'proposal-only');
  assert.equal(context.validationReports[0].code, 'GRAPH.PARAM_OUT_OF_RANGE');
  assert.equal(context.dryRunResults[0].validationErrors[0].code, 'GRAPH.PARAM_OUT_OF_RANGE');
});

test('redactAiContextValue strips nested secrets and private paths deterministically', () => {
  const redacted = redactAiContextValue({
    token: 'abc123',
    nested: {
      managerKey: 'key-1',
      path: '/Users/ziqi/Desktop/FluffyFoundation/secrets/key.txt',
      safe: 'display breathing',
    },
  });

  assert.deepEqual(redacted.value, {
    token: '[REDACTED:secret]',
    nested: {
      managerKey: '[REDACTED:secret]',
      path: '[REDACTED:private-path]',
      safe: 'display breathing',
    },
  });
  assert.equal(redacted.metadata.count, 3);
});

test('deterministic planner creates proposal-only dry-run output without applying live mutations', () => {
  const snapshot = fixtureSnapshot();
  const dispatched = [];
  const bus = {
    getSnapshot: () => snapshot,
    dispatch: ({ command, dryRun }) => {
      dispatched.push({ command, dryRun });
      return {
        ok: true,
        command,
        dryRun,
        previousRevision: 12,
        appliedRevision: 12,
        rollbackToken: 'dry-run:rollback:12',
        audit: {
          rollbackToken: 'dry-run:rollback:12',
          policy: { allowed: true },
          lifecycle: ['dry-run', 'policy', 'apply', 'audit', 'history', 'rollback-token'],
        },
        snapshot,
      };
    },
  };
  const planner = createDeterministicSemanticPlanner({ bus });

  const result = planner.proposeAndDryRun({
    actor: { id: 'ai:wp1', role: 'ai' },
    intent: {
      id: 'intent:breath',
      kind: 'display-breathing',
      targetNodeId: 'display:breath',
      constraints: { maxIntensity: 0.72 },
    },
  });

  assert.equal(result.status, 'dry-run-passed');
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].dryRun, true);
  assert.equal(result.proposal.commands[0].type, 'node.params.update');
  assert.equal(result.proposal.commands[0].params.intensity, 0.72);
  assert.equal(result.expectedEffect.summary, 'Display breathing intensity changes within bounded visual parameters.');
  assert.equal(result.risk.level, 'medium');
  assert.equal(result.rollback.reference, 'dry-run:rollback:12');
  assert.equal(result.policy.status, 'proposal-only');
  assert.equal(snapshot.nodes[0].params.intensity, 0.35);
});

test('deterministic planner returns structured validation failure for overflow dry-run', () => {
  const snapshot = fixtureSnapshot();
  const bus = {
    getSnapshot: () => snapshot,
    dispatch: ({ command }) => ({
      ok: false,
      command,
      dryRun: true,
      stage: 'dry-run',
      message: 'Param intensity is above maximum 1.',
      validationErrors: [
        {
          code: 'GRAPH.PARAM_OUT_OF_RANGE',
          path: 'nodes.display:breath.params.intensity',
          severity: 'error',
          message: 'Param intensity is above maximum 1.',
          repairOptions: ['Use a value less than or equal to 1.'],
        },
      ],
      previousRevision: 12,
      appliedRevision: 12,
      snapshot,
    }),
  };
  const planner = createDeterministicSemanticPlanner({ bus });

  const result = planner.proposeAndDryRun({
    actor: { id: 'ai:wp1', role: 'ai' },
    intent: {
      id: 'intent:overflow',
      kind: 'display-breathing',
      targetNodeId: 'display:breath',
      constraints: { maxIntensity: 2 },
    },
  });

  assert.equal(result.status, 'dry-run-failed');
  assert.equal(result.validationErrors[0].code, 'GRAPH.PARAM_OUT_OF_RANGE');
  assert.match(result.repairHints[0], /less than or equal to 1/);
  assert.equal(result.rollback.reference, null);
});
