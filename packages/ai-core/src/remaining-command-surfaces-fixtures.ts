/**
 * Purpose: Build deterministic FF-18 WP8 traces for remaining AI Operator semantic command API surfaces.
 */

import {
  buildAiSemanticContext,
  redactAiContextValue,
  type AiContextRedactionMetadata,
  type AiSemanticContext,
} from './semantic-context.js';
import {
  createAiObservationEvaluator,
  type AiObservationEvaluation,
} from './observation-repair.js';
import type { AiProposalExecutionResult } from './proposal-execution.js';
import {
  runAiSemanticCommandBusParityFixture,
  type AiSemanticCommandBusParityCase,
  type AiSemanticCommandBusParityTrace,
} from './semantic-command-bus-parity.js';
import type {
  AiDryRunCommandResult,
  AiProposalDryRunResult,
  AiSemanticActor,
  AiSemanticCommand,
} from './deterministic-planner.js';

type RollbackBus = AiSemanticCommandBusParityCase['createBus'] extends () => infer T
  ? T & {
      rollbackToRevision?: (revision: number) => {
        ok: boolean;
        message?: string;
        recovery?: unknown;
        snapshot: Record<string, unknown>;
      };
    }
  : never;

export type AiRuntimeOverrideTrace = {
  caseId: string;
  status: 'deferred';
  commandType: 'runtime.override.set' | 'runtime.override.clear';
  semanticContext: AiSemanticContext;
  runtimeOverride: {
    action: 'set' | 'clear';
    nodeId: string;
    portId: string;
    value?: unknown;
    ttlMs?: number;
  };
  ai: {
    commandSequence: [];
    status: { dryRun: 'unsupported-intent'; apply: AiProposalExecutionResult['status'] };
    policy: {
      dryRun: AiProposalDryRunResult['policy'];
      apply: AiProposalExecutionResult['policy'];
    };
    audit: {
      executionAudit: AiProposalExecutionResult['audit'];
      rollback: AiProposalExecutionResult['rollback'];
      historyEntry: AiProposalExecutionResult['historyEntry'];
    };
    snapshot: Record<string, unknown>;
    redactionSummary: AiContextRedactionMetadata;
  };
  deferred: {
    deferred: true;
    reasonCode: 'RUNTIME_OVERRIDE_SURFACE_NOT_IMPLEMENTED';
    message: string;
  };
  runtimeObservation: {
    kind: 'runtime-observation-deferred';
    deferred: true;
    reasonCode: 'BROWSER_RUNTIME_PROOF_DEFERRED';
  };
};

export type AiRollbackRevisionTrace = {
  caseId: string;
  status: 'executable';
  commandType: 'rollback.revision';
  semanticContext: AiSemanticContext;
  rollbackRevision: {
    revision: number;
    setupCommandSequence: AiSemanticCommand[];
    setupResults: AiDryRunCommandResult[];
    ai: { ok: boolean; message?: string; recovery?: unknown; snapshot: Record<string, unknown> };
    direct: { ok: boolean; message?: string; recovery?: unknown; snapshot: Record<string, unknown> };
    parity: { snapshotMatches: boolean; revisionMatches: boolean };
    audit: {
      historyLengthAfterSetup: number | null;
      auditLogLengthAfterSetup: number | null;
      rollbackMetadata: { previousRevision: number; targetRevision: number; restoredRevision: number | null };
    };
    observedResult: AiObservationEvaluation;
  };
  ai: {
    commandSequence: AiSemanticCommand[];
    snapshot: Record<string, unknown>;
    redactionSummary: AiContextRedactionMetadata;
  };
  runtimeObservation: {
    kind: 'runtime-observation-deferred';
    deferred: true;
    reasonCode: 'BROWSER_RUNTIME_PROOF_DEFERRED';
  };
};

export type AiRemainingCommandSurfaceCase =
  | AiSemanticCommandBusParityCase
  | {
      id: string;
      createBus: () => RollbackBus;
      setupCommands: AiSemanticCommand[];
      rollbackRevision: number;
    }
  | {
      id: string;
      createBus: () => RollbackBus;
      runtimeOverride: AiRuntimeOverrideTrace['runtimeOverride'];
    };

export type AiRemainingCommandSurfaceTrace =
  | (AiSemanticCommandBusParityTrace & {
      status: 'executable';
      expectedEffect: AiProposalDryRunResult['expectedEffect'];
      risk: AiProposalDryRunResult['risk'];
      runtimeObservation: AiRollbackRevisionTrace['runtimeObservation'];
    })
  | AiRollbackRevisionTrace
  | AiRuntimeOverrideTrace;

const defaultActor: AiSemanticActor = { id: 'ai:wp8', role: 'ai' };
const defaultDirectActor: AiSemanticActor = { id: 'cli:wp8', role: 'service' };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const sortedRecord = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortedRecord);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortedRecord(value[key])])
  );
};

const stableJson = (value: unknown): string => JSON.stringify(sortedRecord(value));

const snapshotForParity = (snapshot: Record<string, unknown>): Record<string, unknown> => ({
  revision: snapshot.revision,
  nodes: snapshot.nodes,
  connections: snapshot.connections,
  groups: snapshot.groups,
  partitions: snapshot.partitions,
  proposals: snapshot.proposals,
});

const runtimeObservation = (): AiRollbackRevisionTrace['runtimeObservation'] => ({
  kind: 'runtime-observation-deferred',
  deferred: true,
  reasonCode: 'BROWSER_RUNTIME_PROOF_DEFERRED',
});

const getAuditLength = (bus: RollbackBus): number | null => {
  const method = (bus as RollbackBus & { getAuditLog?: () => unknown[] }).getAuditLog;
  return method ? method().length : null;
};

const getHistoryLength = (bus: RollbackBus): number | null => {
  const method = (bus as RollbackBus & { getHistory?: () => unknown[] }).getHistory;
  return method ? method().length : null;
};

const revisionOf = (snapshot: Record<string, unknown>): number | null =>
  Number.isFinite(snapshot.revision) ? Number(snapshot.revision) : null;

const createdAt = (): string => new Date(0).toISOString();

const effectFor = (command: AiSemanticCommand): AiProposalDryRunResult['expectedEffect'] => {
  if (command.type === 'node.restore') {
    return {
      summary: 'Archived node recovery is routed through node.restore on the semantic command bus.',
      targetNodeId: command.nodeId,
      params: { archived: false },
    };
  }
  if (command.type === 'proposal.approve') {
    return {
      summary: 'Proposal approval is routed through proposal.approve on the semantic command bus.',
      targetNodeId: command.proposalId,
      params: { status: 'accepted' },
    };
  }
  return {
    summary: `Semantic command bus operation: ${command.type}.`,
    targetNodeId: 'nodeId' in command ? String(command.nodeId) : null,
    params: {},
  };
};

const riskFor = (command: AiSemanticCommand): AiProposalDryRunResult['risk'] =>
  command.type === 'proposal.approve'
    ? { level: 'medium', reasons: ['Approving proposals changes human approval state and must preserve audit history.'] }
    : { level: 'low', reasons: ['Restoring an archived node changes semantic graph availability through reversible metadata.'] };

const redacted = <T>(value: T): T => redactAiContextValue(value).value as T;

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

const runDeferredRuntimeOverride = (
  item: Extract<AiRemainingCommandSurfaceCase, { runtimeOverride: AiRuntimeOverrideTrace['runtimeOverride'] }>,
  actor: AiSemanticActor
): AiRuntimeOverrideTrace => {
  const bus = item.createBus();
  const semanticContext = buildAiSemanticContext({
    snapshot: bus.getSnapshot(),
    actor,
    policy: { mode: 'proposal-only', approvalRequired: [`runtime.override.${item.runtimeOverride.action}`] },
  });
  const operation = `runtime.override.${item.runtimeOverride.action}`;
  const previousRevision = revisionOf(bus.getSnapshot()) ?? 0;
  const policy: AiProposalExecutionResult['policy'] = {
    status: 'approval-required',
    decisions: [
      {
        operation,
        status: 'approval-required',
        reason: 'Runtime override set/clear is deferred until a semantic runtime override command exists.',
      },
    ],
  };
  const executionAudit: AiProposalExecutionResult['audit'] = {
    id: `audit:ai:wp8:${item.id}:deferred`,
    type: 'proposal-execution',
    proposalId: `proposal:wp8:${item.id}:deferred`,
    actor,
    lifecycle: ['policy', 'dry-run', 'apply', 'audit', 'history', 'rollback-token'],
    policy,
    commandAudits: [],
    previousRevision,
    appliedRevision: null,
    rollbackReference: null,
    createdAt: createdAt(),
  };

  return {
    caseId: item.id,
    status: 'deferred',
    commandType: item.runtimeOverride.action === 'set' ? 'runtime.override.set' : 'runtime.override.clear',
    semanticContext,
    runtimeOverride: redacted(item.runtimeOverride),
    ai: {
      commandSequence: [],
      status: { dryRun: 'unsupported-intent', apply: 'approval-required' },
      policy: {
        dryRun: { status: 'proposal-only', dryRun: true, allowed: false, reason: 'Runtime override semantic command is deferred.' },
        apply: policy,
      },
      audit: {
        executionAudit,
        rollback: {
          reference: null,
          commandRollbackTokens: [],
          previousRevision,
          appliedRevision: null,
        },
        historyEntry: null,
      },
      snapshot: redacted(bus.getSnapshot()),
      redactionSummary: semanticContext.redactions,
    },
    deferred: {
      deferred: true,
      reasonCode: 'RUNTIME_OVERRIDE_SURFACE_NOT_IMPLEMENTED',
      message: 'Runtime override set/clear remains a live runtime surface and is not represented as a semantic graph mutation in WP8.',
    },
    runtimeObservation: runtimeObservation(),
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
    if ('runtimeOverride' in item) return runDeferredRuntimeOverride(item, actor);
    if ('rollbackRevision' in item) return runRollbackRevision(item, actor, directActor);
    return runExecutableCommand(item, actor, directActor);
  });
}
