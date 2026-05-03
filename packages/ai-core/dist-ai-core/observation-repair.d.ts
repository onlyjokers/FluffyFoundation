/**
 * Purpose: Evaluate structured FF-18 AI runtime observations and draft deterministic in-memory repair plans.
 */
import type { AiProposalExecutionResult } from './proposal-execution.js';
import type { AiValidationReport } from './semantic-context.js';
import type { AiCommandProposal, AiSemanticActor } from './deterministic-planner.js';
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
export type AiObservationReport = AiOutputChangeObservationReport | AiValidationErrorObservationReport | AiDeviceCapabilityGapObservationReport | AiNoOutputChangeObservationReport | AiRollbackNeededObservationReport | AiPolicyDenialObservationReport;
export type AiRollbackRecommendation = {
    type: 'rollback';
    rollbackReference: string | null;
    previousRevision: number | null;
    appliedRevision: number | null;
    reasonCode: string;
};
export type AiObservationEvaluation = {
    classification: 'success' | 'failed' | 'validation-failure' | 'device-capability-gap' | 'no-output-change' | 'rollback-needed' | 'policy-denied';
    proposalId: string;
    repairable: boolean;
    rollbackRecommended: boolean;
    structuredErrors: AiValidationReport[];
    structuredEvidence: AiObservationReport[];
    recommendation: AiRollbackRecommendation | null;
};
export type AiObservationEvaluator = {
    evaluate: (input: {
        execution: AiProposalExecutionResult;
        observation: AiObservationReport;
    }) => AiObservationEvaluation;
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
export declare function createAiObservationEvaluator(): AiObservationEvaluator;
export declare function createAiRepairPlanner(): AiRepairPlanner;
//# sourceMappingURL=observation-repair.d.ts.map