/**
 * Purpose: Evaluate structured FF-18 AI runtime observations and draft deterministic in-memory repair plans.
 */

import type { AiProposalExecutionResult, AiProposalRollbackMetadata } from './proposal-execution.js';
import type { AiValidationReport } from './semantic-context.js';
import { redactAiContextValue } from './semantic-context.js';
import type { AiCommandProposal, AiSemanticActor, AiSemanticCommand } from './deterministic-planner.js';

export type AiOutputChangeObservationReport = {
  kind: 'output-change';
  proposalId: string;
  observed: boolean;
  changedTargets: string[];
  measuredAtRevision?: number;
};

export type AiValidationErrorObservationReport = {
  kind: 'validation-error';
  proposalId: string;
  validationErrors: AiValidationReport[];
  consoleText?: string;
};

export type AiDeviceCapabilityGapObservationReport = {
  kind: 'device-capability-gap';
  proposalId: string;
  deviceId?: string;
  missingCapabilities: string[];
  targetCommandTypes?: string[];
};

export type AiNoOutputChangeObservationReport = {
  kind: 'no-output-change';
  proposalId: string;
  expectedTargets: string[];
  measuredAtRevision?: number;
  reasonCode?: string;
};

export type AiRollbackNeededObservationReport = {
  kind: 'rollback-needed';
  proposalId: string;
  reasonCode: string;
  validationErrors?: AiValidationReport[];
};

export type AiPolicyDenialObservationReport = {
  kind: 'policy-denial';
  proposalId: string;
  deniedOperations: string[];
  reasonCode?: string;
};

export type AiObservationReport =
  | AiOutputChangeObservationReport
  | AiValidationErrorObservationReport
  | AiDeviceCapabilityGapObservationReport
  | AiNoOutputChangeObservationReport
  | AiRollbackNeededObservationReport
  | AiPolicyDenialObservationReport;

export type AiRollbackRecommendation = {
  type: 'rollback';
  rollbackReference: string | null;
  previousRevision: number | null;
  appliedRevision: number | null;
  reasonCode: string;
};

export type AiObservationEvaluation = {
  classification:
    | 'success'
    | 'failed'
    | 'validation-failure'
    | 'device-capability-gap'
    | 'no-output-change'
    | 'rollback-needed'
    | 'policy-denied';
  proposalId: string;
  repairable: boolean;
  rollbackRecommended: boolean;
  structuredErrors: AiValidationReport[];
  structuredEvidence: AiObservationReport[];
  recommendation: AiRollbackRecommendation | null;
};

export type AiObservationEvaluator = {
  evaluate: (input: { execution: AiProposalExecutionResult; observation: AiObservationReport }) => AiObservationEvaluation;
};

export type AiRepairContext = {
  registry: Array<Record<string, unknown>>;
  nodes?: Array<Record<string, unknown>>;
};

export type AiRepairProposalPlan = {
  type: 'proposal';
  proposal: AiCommandProposal;
  sourceErrorCodes: string[];
  repairHints: string[];
};

export type AiRepairRollbackPlan = AiRollbackRecommendation;

export type AiRepairUnavailablePlan = {
  type: 'unavailable';
  reasonCode: string;
  sourceErrorCodes: string[];
};

export type AiRepairPlan = AiRepairProposalPlan | AiRepairRollbackPlan | AiRepairUnavailablePlan;

export type AiRepairPlanner = {
  plan: (input: {
    actor: AiSemanticActor;
    proposal: AiCommandProposal;
    evaluation: AiObservationEvaluation;
    context: AiRepairContext;
  }) => AiRepairPlan;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const rollbackRecommendation = (
  rollback: AiProposalRollbackMetadata,
  reasonCode: string
): AiRollbackRecommendation => ({
  type: 'rollback',
  rollbackReference: rollback.reference,
  previousRevision: rollback.previousRevision,
  appliedRevision: rollback.appliedRevision,
  reasonCode,
});

const validationErrorsFromExecution = (execution: AiProposalExecutionResult): AiValidationReport[] => [
  ...execution.dryRun.results.flatMap((result) => result.validationErrors ?? []),
  ...execution.appliedResults.flatMap((result) => result.validationErrors ?? []),
];

const outputChangeObserved = (report: AiOutputChangeObservationReport): boolean =>
  report.observed && report.changedTargets.length > 0;

const sanitized = <T>(value: T): T => redactAiContextValue(value).value as T;

const sanitizedErrors = (errors: AiValidationReport[]): AiValidationReport[] => sanitized(errors);

export function createAiObservationEvaluator(): AiObservationEvaluator {
  return {
    evaluate: ({ execution, observation }) => {
      const evidence = sanitized(observation);
      const rollbackFor = (reasonCode: string): AiRollbackRecommendation | null =>
        execution.rollback.reference ? rollbackRecommendation(execution.rollback, reasonCode) : null;

      if (observation.kind === 'output-change') {
        return {
          classification: outputChangeObserved(observation) && execution.status === 'applied' ? 'success' : 'failed',
          proposalId: observation.proposalId,
          repairable: false,
          rollbackRecommended: !outputChangeObserved(observation),
          structuredErrors: [],
          structuredEvidence: [evidence],
          recommendation: outputChangeObserved(observation) ? null : rollbackFor('OUTPUT.NO_VISIBLE_CHANGE'),
        };
      }

      if (observation.kind === 'validation-error') {
        const errors = sanitizedErrors(observation.validationErrors);
        return {
          classification: 'validation-failure',
          proposalId: observation.proposalId,
          repairable: errors.length > 0,
          rollbackRecommended: false,
          structuredErrors: errors,
          structuredEvidence: [{ kind: 'validation-error', proposalId: observation.proposalId, validationErrors: errors }],
          recommendation: null,
        };
      }

      if (observation.kind === 'device-capability-gap') {
        return {
          classification: 'device-capability-gap',
          proposalId: observation.proposalId,
          repairable: false,
          rollbackRecommended: Boolean(execution.rollback.reference),
          structuredErrors: [],
          structuredEvidence: [evidence],
          recommendation: rollbackFor('DEVICE.CAPABILITY_GAP'),
        };
      }

      if (observation.kind === 'no-output-change') {
        return {
          classification: 'no-output-change',
          proposalId: observation.proposalId,
          repairable: false,
          rollbackRecommended: Boolean(execution.rollback.reference),
          structuredErrors: [],
          structuredEvidence: [evidence],
          recommendation: rollbackFor(observation.reasonCode ?? 'OUTPUT.NO_VISIBLE_CHANGE'),
        };
      }

      if (observation.kind === 'rollback-needed') {
        const errors = sanitizedErrors(observation.validationErrors ?? validationErrorsFromExecution(execution));
        return {
          classification: 'rollback-needed',
          proposalId: observation.proposalId,
          repairable: false,
          rollbackRecommended: Boolean(execution.rollback.reference),
          structuredErrors: errors,
          structuredEvidence: [evidence],
          recommendation: rollbackFor(observation.reasonCode),
        };
      }

      return {
        classification: 'policy-denied',
        proposalId: observation.proposalId,
        repairable: false,
        rollbackRecommended: false,
        structuredErrors: [],
        structuredEvidence: [evidence],
        recommendation: null,
      };
    },
  };
}

const unique = (values: string[]): string[] => {
  const out: string[] = [];
  for (const value of values) {
    if (!value || out.includes(value)) continue;
    out.push(value);
  }
  return out;
};

const registrySummaries = (context: AiRepairContext): Array<Record<string, unknown>> =>
  context.registry.flatMap((entry) => {
    const summary = entry.aiSummary;
    return isRecord(summary) ? [summary] : [entry];
  });

const nodeType = (context: AiRepairContext, nodeId: string): string | null => {
  const node = (context.nodes ?? []).find((item) => item.id === nodeId);
  return isRecord(node) && typeof node.type === 'string' ? node.type : null;
};

const paramBounds = (
  context: AiRepairContext,
  nodeId: string,
  key: string
): { min?: number; max?: number } => {
  const type = nodeType(context, nodeId);
  const summaries = registrySummaries(context);
  const summary = summaries.find((item) => !type || item.type === type);
  const params = Array.isArray(summary?.params) ? summary.params : [];
  const param = params.find((item) => isRecord(item) && item.key === key);
  if (!isRecord(param)) return {};
  return {
    ...(typeof param.min === 'number' ? { min: param.min } : {}),
    ...(typeof param.max === 'number' ? { max: param.max } : {}),
  };
};

const repairHints = (context: AiRepairContext, errors: AiValidationReport[]): string[] =>
  unique([
    ...errors.flatMap((error) => error.repairOptions ?? []),
    ...registrySummaries(context).flatMap((summary) =>
      Array.isArray(summary.repairHints) ? summary.repairHints.filter((hint): hint is string => typeof hint === 'string') : []
    ),
  ]);

const commandForNodeParam = (
  proposal: AiCommandProposal,
  nodeId: string,
  key: string
): Extract<AiSemanticCommand, { type: 'node.params.update' }> | null => {
  const command = proposal.commands.find(
    (item): item is Extract<AiSemanticCommand, { type: 'node.params.update' }> =>
      item.type === 'node.params.update' && item.nodeId === nodeId && key in item.params
  );
  return command ?? null;
};

const repairParamOverflow = (
  proposal: AiCommandProposal,
  context: AiRepairContext,
  error: AiValidationReport
): AiSemanticCommand | null => {
  const match = /^nodes\.([^.]*)\.params\.([^.]*)$/.exec(error.path);
  if (!match) return null;
  const [, nodeId, key] = match;
  const source = commandForNodeParam(proposal, nodeId, key);
  if (!source) return null;
  const value = source.params[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const bounds = paramBounds(context, nodeId, key);
  const next =
    typeof bounds.max === 'number' && value > bounds.max
      ? bounds.max
      : typeof bounds.min === 'number' && value < bounds.min
        ? bounds.min
        : null;
  if (next === null) return null;
  return { type: 'node.params.update', nodeId, params: { [key]: next } };
};

const repairIncompatibleConnection = (
  proposal: AiCommandProposal,
  error: AiValidationReport
): AiSemanticCommand | null => {
  const match = /^connections\.([^.]*)$/.exec(error.path);
  if (!match) return null;
  const [, connectionId] = match;
  const source = proposal.commands.find(
    (item): item is Extract<AiSemanticCommand, { type: 'node.connect' }> =>
      item.type === 'node.connect' && item.connection.id === connectionId
  );
  return source ? { type: 'node.disconnect', connectionId } as AiSemanticCommand : null;
};

const proposalPlan = (
  original: AiCommandProposal,
  commands: AiSemanticCommand[],
  errors: AiValidationReport[],
  hints: string[]
): AiRepairProposalPlan => ({
  type: 'proposal',
  proposal: {
    id: `${original.id}:repair`,
    title: `Repair ${original.title}`,
    commands,
    status: 'draft',
  },
  sourceErrorCodes: unique(errors.map((error) => error.code)),
  repairHints: hints,
});

export function createAiRepairPlanner(): AiRepairPlanner {
  return {
    plan: ({ proposal, evaluation, context }) => {
      if (evaluation.recommendation) return evaluation.recommendation;
      const errors = evaluation.structuredErrors;
      if (!evaluation.repairable || errors.length === 0) {
        return {
          type: 'unavailable',
          reasonCode: evaluation.classification.toUpperCase().replaceAll('-', '.'),
          sourceErrorCodes: unique(errors.map((error) => error.code)),
        };
      }

      const commands: AiSemanticCommand[] = [];
      for (const error of errors) {
        const repair =
          error.code === 'GRAPH.PARAM_OUT_OF_RANGE'
            ? repairParamOverflow(proposal, context, error)
            : error.code === 'GRAPH.PORT_INCOMPATIBLE'
              ? repairIncompatibleConnection(proposal, error)
              : null;
        if (repair) commands.push(repair);
      }

      if (commands.length === 0) {
        return {
          type: 'unavailable',
          reasonCode: 'REPAIR.UNSUPPORTED_STRUCTURED_ERROR',
          sourceErrorCodes: unique(errors.map((error) => error.code)),
        };
      }

      return proposalPlan(proposal, commands, errors, repairHints(context, errors));
    },
  };
}
