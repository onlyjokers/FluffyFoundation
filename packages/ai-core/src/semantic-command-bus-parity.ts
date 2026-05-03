/**
 * Purpose: Prove AI proposal execution preserves the real semantic command bus contract used by non-AI callers.
 */

import {
  buildAiSemanticContext,
  redactAiContextValue,
  type AiContextRedactionMetadata,
  type AiSemanticContext,
} from './semantic-context.js';
import {
  createDeterministicSemanticPlanner,
  type AiDryRunCommandResult,
  type AiSemanticActor,
  type AiSemanticCommand,
} from './deterministic-planner.js';
import {
  createAiObservationEvaluator,
  type AiObservationEvaluation,
} from './observation-repair.js';
import {
  createAiProposalExecutionCore,
  type AiProposalExecutionPolicy,
  type AiProposalExecutionResult,
} from './proposal-execution.js';

type ParityBus = {
  getSnapshot: () => Record<string, unknown>;
  dispatch: (input: {
    actor: AiSemanticActor;
    command: AiSemanticCommand;
    dryRun?: boolean;
  }) => AiDryRunCommandResult & { snapshot?: Record<string, unknown> };
  rollback: (rollbackToken: string) => {
    ok: boolean;
    message?: string;
    recovery?: unknown;
    snapshot: { revision?: number };
  };
};

export type AiSemanticCommandBusParityCase = {
  id: string;
  command: AiSemanticCommand;
  createBus: () => ParityBus;
};

export type AiSemanticCommandBusParityTrace = {
  caseId: string;
  commandType: string;
  semanticContext: AiSemanticContext;
  ai: {
    commandSequence: AiSemanticCommand[];
    status: {
      dryRun: 'dry-run-passed' | 'dry-run-failed' | 'unsupported-intent';
      apply: AiProposalExecutionResult['status'];
    };
    policy: {
      dryRun: ReturnType<ReturnType<typeof createDeterministicSemanticPlanner>['proposeAndDryRun']>['policy'];
      apply: AiProposalExecutionResult['policy'];
    };
    audit: {
      executionAudit: AiProposalExecutionResult['audit'];
      rollback: AiProposalExecutionResult['rollback'];
      historyEntry: AiProposalExecutionResult['historyEntry'];
    };
    snapshot: Record<string, unknown>;
    observedResult: AiObservationEvaluation;
    redactionSummary: AiContextRedactionMetadata;
  };
  direct: {
    result: AiDryRunCommandResult;
    snapshot: Record<string, unknown>;
    auditLogLength: number | null;
    historyLength: number | null;
  };
  parity: {
    appliedRevisionMatches: boolean;
    snapshotMatches: boolean;
    commandTypeMatches: boolean;
  };
};

const defaultActor: AiSemanticActor = { id: 'ai:wp5', role: 'ai' };
const defaultDirectActor: AiSemanticActor = { id: 'cli:wp5', role: 'service' };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const getAuditLength = (bus: ParityBus): number | null => {
  const method = (bus as ParityBus & { getAuditLog?: () => unknown[] }).getAuditLog;
  return method ? method().length : null;
};

const getHistoryLength = (bus: ParityBus): number | null => {
  const method = (bus as ParityBus & { getHistory?: () => unknown[] }).getHistory;
  return method ? method().length : null;
};

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

const paritySnapshot = (snapshot: Record<string, unknown>): Record<string, unknown> => ({
  revision: snapshot.revision,
  nodes: snapshot.nodes,
  connections: snapshot.connections,
  groups: snapshot.groups,
  partitions: snapshot.partitions,
  proposals: snapshot.proposals,
});

const changedTargetsFor = (command: AiSemanticCommand): string[] => {
  if ('nodeId' in command) return [String(command.nodeId)];
  if (command.type === 'node.add') return [String(command.node.id)];
  if (command.type === 'node.connect') return [String(command.connection.id)];
  if (command.type === 'node.disconnect') return [String(command.connectionId)];
  if (command.type === 'group.create') return [String(command.group.id)];
  if ('groupId' in command) return [String(command.groupId)];
  if ('partitionId' in command) return [String(command.partitionId)];
  if (command.type === 'proposal.approve') return [String(command.proposalId)];
  return [];
};

export function runAiSemanticCommandBusParityFixture(input: {
  actor?: AiSemanticActor;
  directActor?: AiSemanticActor;
  cases: AiSemanticCommandBusParityCase[];
  policyForCase?: (item: AiSemanticCommandBusParityCase) => AiProposalExecutionPolicy;
}): AiSemanticCommandBusParityTrace[] {
  const actor = input.actor ?? defaultActor;
  const directActor = input.directActor ?? defaultDirectActor;
  const evaluator = createAiObservationEvaluator();

  return input.cases.map((item): AiSemanticCommandBusParityTrace => {
    const aiBus = item.createBus();
    const directBus = item.createBus();
    const semanticContext = buildAiSemanticContext({
      snapshot: aiBus.getSnapshot(),
      actor,
      policy: { mode: 'proposal-only', approvalRequired: [item.command.type] },
    });
    const planner = createDeterministicSemanticPlanner({ bus: aiBus });
    const dryRun = planner.proposeAndDryRun({
      actor,
      intent: { id: `wp5:${item.id}`, kind: 'raw-command', command: item.command },
    });
    const execution = createAiProposalExecutionCore({
      bus: aiBus,
      policy: input.policyForCase?.(item) ?? {
        allowedOperations: [item.command.type],
        approvalRequiredOperations: [],
        deniedOperations: [],
      },
    }).executeProposal({ actor, proposal: dryRun.proposal });
    const aiSnapshot = aiBus.getSnapshot();
    const observedResult = evaluator.evaluate({
      execution,
      observation: {
        kind: 'output-change',
        proposalId: execution.proposalId,
        observed: execution.status === 'applied',
        changedTargets: changedTargetsFor(item.command),
        measuredAtRevision: execution.appliedRevision ?? undefined,
      },
    });

    const directResult = directBus.dispatch({ actor: directActor, command: item.command, dryRun: false });
    const directSnapshot = directBus.getSnapshot();
    const sanitizedDirectResult = redactAiContextValue(directResult).value as AiDryRunCommandResult;
    const sanitizedDirectSnapshot = redactAiContextValue(directSnapshot).value as Record<string, unknown>;
    const sanitizedAiSnapshot = redactAiContextValue(aiSnapshot).value as Record<string, unknown>;

    return {
      caseId: item.id,
      commandType: item.command.type,
      semanticContext,
      ai: {
        commandSequence: [...dryRun.commandSequence],
        status: { dryRun: dryRun.status, apply: execution.status },
        policy: { dryRun: dryRun.policy, apply: execution.policy },
        audit: {
          executionAudit: execution.audit,
          rollback: execution.rollback,
          historyEntry: execution.historyEntry,
        },
        snapshot: sanitizedAiSnapshot,
        observedResult,
        redactionSummary: semanticContext.redactions,
      },
      direct: {
        result: sanitizedDirectResult,
        snapshot: sanitizedDirectSnapshot,
        auditLogLength: getAuditLength(directBus),
        historyLength: getHistoryLength(directBus),
      },
      parity: {
        appliedRevisionMatches: execution.appliedRevision === directResult.appliedRevision,
        snapshotMatches: stableJson(paritySnapshot(aiSnapshot)) === stableJson(paritySnapshot(directSnapshot)),
        commandTypeMatches: execution.commandSequence[0]?.type === directResult.command.type,
      },
    };
  });
}
