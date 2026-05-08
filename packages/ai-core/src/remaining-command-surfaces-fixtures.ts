/**
 * Purpose: Build deterministic FF-18 WP8 traces for remaining AI Operator semantic command API surfaces.
 */

import {
  buildAiSemanticContext,
} from './semantic-context.js';
import {
  createAiObservationEvaluator,
} from './observation-repair.js';
import {
  runAiSemanticCommandBusParityFixture,
  type AiSemanticCommandBusParityCase,
} from './semantic-command-bus-parity.js';
import type {
  AiSemanticCommand,
  AiSemanticActor,
} from './deterministic-planner.js';
import {
  effectFor,
  getAuditLength,
  getHistoryLength,
  redacted,
  revisionOf,
  riskFor,
  runtimeObservation,
  snapshotForParity,
  stableJson,
} from './remaining-command-surfaces-support.js';
import type {
  AiRemainingCommandSurfaceCase,
  AiRemainingCommandSurfaceTrace,
  AiRollbackRevisionTrace,
} from './remaining-command-surfaces-types.js';

export type {
  AiRemainingCommandSurfaceCase,
  AiRemainingCommandSurfaceTrace,
  AiRollbackRevisionTrace,
} from './remaining-command-surfaces-types.js';

const defaultActor: AiSemanticActor = { id: 'ai:wp8', role: 'ai' };
const defaultDirectActor: AiSemanticActor = { id: 'cli:wp8', role: 'service' };

const runExecutableCommand = (
  item: AiSemanticCommandBusParityCase,
  actor: AiSemanticActor,
  directActor: AiSemanticActor
): AiRemainingCommandSurfaceTrace => {
  const [trace] = runAiSemanticCommandBusParityFixture({
    actor,
    directActor,
    cases: [item],
  });
  return {
    ...trace,
    status: 'executable',
    expectedEffect: effectFor(item.command),
    risk: riskFor(item.command),
    runtimeObservation: runtimeObservation(),
  };
};

const runRollbackRevision = (
  item: Extract<AiRemainingCommandSurfaceCase, { rollbackRevision: number }>,
  actor: AiSemanticActor,
  directActor: AiSemanticActor
): AiRollbackRevisionTrace => {
  const aiBus = item.createBus();
  const directBus = item.createBus();
  const semanticContext = buildAiSemanticContext({
    snapshot: aiBus.getSnapshot(),
    actor,
    policy: { mode: 'proposal-only', approvalRequired: ['rollback.revision'] },
  });
  const aiSetupResults = item.setupCommands.map((command) => aiBus.dispatch({ actor, command, dryRun: false }));
  item.setupCommands.forEach((command) => directBus.dispatch({ actor: directActor, command, dryRun: false }));
  const aiRollback = aiBus.rollbackToRevision
    ? aiBus.rollbackToRevision(item.rollbackRevision)
    : { ok: false, message: 'Rollback revision surface is not implemented.', snapshot: aiBus.getSnapshot() };
  const directRollback = directBus.rollbackToRevision
    ? directBus.rollbackToRevision(item.rollbackRevision)
    : { ok: false, message: 'Rollback revision surface is not implemented.', snapshot: directBus.getSnapshot() };
  const aiSnapshot = aiBus.getSnapshot();
  const directSnapshot = directBus.getSnapshot();
  const evaluator = createAiObservationEvaluator();
  const observedResult = evaluator.evaluate({
    execution: {
      status: 'applied',
      proposalId: `proposal:wp8:${item.id}`,
      commandSequence: [...item.setupCommands],
      policy: { status: 'allowed', decisions: [{ operation: 'rollback.revision', status: 'allowed' }] },
      dryRun: { ok: true, results: aiSetupResults },
      appliedResults: aiSetupResults,
      previousRevision: item.rollbackRevision,
      appliedRevision: revisionOf(aiSnapshot),
      audit: {
        id: `audit:ai:wp8:${item.id}`,
        type: 'proposal-execution',
        proposalId: `proposal:wp8:${item.id}`,
        actor,
        lifecycle: ['policy', 'dry-run', 'apply', 'audit', 'history', 'rollback-token'],
        policy: { status: 'allowed', decisions: [{ operation: 'rollback.revision', status: 'allowed' }] },
        commandAudits: aiSetupResults.flatMap((result) => (result.audit ? [result.audit] : [])),
        previousRevision: item.rollbackRevision,
        appliedRevision: revisionOf(aiSnapshot),
        rollbackReference: null,
        createdAt: new Date(0).toISOString(),
      },
      historyEntry: null,
      rollback: {
        reference: null,
        commandRollbackTokens: aiSetupResults.flatMap((result) => (result.ok && result.rollbackToken ? [result.rollbackToken] : [])),
        previousRevision: item.rollbackRevision,
        appliedRevision: revisionOf(aiSnapshot),
      },
    },
    observation: {
      kind: 'rollback-needed',
      proposalId: `proposal:wp8:${item.id}`,
      reasonCode: 'ROLLBACK.REVISION_RESTORED',
    },
  });

  return {
    caseId: item.id,
    status: 'executable',
    commandType: 'rollback.revision',
    semanticContext,
    rollbackRevision: {
      revision: item.rollbackRevision,
      setupCommandSequence: [...item.setupCommands],
      setupResults: redacted(aiSetupResults),
      ai: redacted(aiRollback),
      direct: redacted(directRollback),
      parity: {
        snapshotMatches: stableJson(snapshotForParity(aiSnapshot)) === stableJson(snapshotForParity(directSnapshot)),
        revisionMatches: revisionOf(aiSnapshot) === revisionOf(directSnapshot),
      },
      audit: {
        historyLengthAfterSetup: getHistoryLength(aiBus),
        auditLogLengthAfterSetup: getAuditLength(aiBus),
        rollbackMetadata: {
          previousRevision: item.rollbackRevision + item.setupCommands.length,
          targetRevision: item.rollbackRevision,
          restoredRevision: revisionOf(aiSnapshot),
        },
      },
      observedResult,
    },
    ai: {
      commandSequence: [...item.setupCommands],
      snapshot: redacted(aiSnapshot),
      redactionSummary: semanticContext.redactions,
    },
    runtimeObservation: runtimeObservation(),
  };
};

const commandForRuntimeOverride = (
  runtimeOverride: Extract<AiRemainingCommandSurfaceCase, { runtimeOverride: unknown }>['runtimeOverride']
): AiSemanticCommand =>
  runtimeOverride.action === 'set'
    ? {
        type: 'runtime.override.set',
        nodeId: runtimeOverride.nodeId,
        portId: runtimeOverride.portId,
        kind: runtimeOverride.kind,
        value: runtimeOverride.value,
        ttlMs: runtimeOverride.ttlMs,
      }
    : {
        type: 'runtime.override.clear',
        nodeId: runtimeOverride.nodeId,
        portId: runtimeOverride.portId,
        kind: runtimeOverride.kind,
      };

const runRuntimeOverride = (
  item: Extract<AiRemainingCommandSurfaceCase, { runtimeOverride: unknown }>,
  actor: AiSemanticActor,
  directActor: AiSemanticActor
): AiRemainingCommandSurfaceTrace => {
  const trace = runExecutableCommand(
    {
      id: item.id,
      command: commandForRuntimeOverride(item.runtimeOverride),
      createBus: item.createBus,
    },
    actor,
    directActor
  );
  return {
    ...trace,
    runtimeOverride: redacted(item.runtimeOverride),
  };
};

export function runAiRemainingCommandSurfaceFixtures(input: {
  actor?: AiSemanticActor;
  directActor?: AiSemanticActor;
  cases: AiRemainingCommandSurfaceCase[];
}): AiRemainingCommandSurfaceTrace[] {
  const actor = input.actor ?? defaultActor;
  const directActor = input.directActor ?? defaultDirectActor;
  return input.cases.map((item): AiRemainingCommandSurfaceTrace => {
    if ('runtimeOverride' in item) return runRuntimeOverride(item, actor, directActor);
    if ('rollbackRevision' in item) return runRollbackRevision(item, actor, directActor);
    return runExecutableCommand(item, actor, directActor);
  });
}
