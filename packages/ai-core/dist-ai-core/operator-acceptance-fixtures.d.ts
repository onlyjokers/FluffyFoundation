/**
 * Purpose: Build deterministic FF-18 AI Operator acceptance traces for safety-facing runtime behavior.
 */
import { type AiContextRedactionMetadata, type AiSemanticContext } from './semantic-context.js';
import { type AiCommandProposal } from './deterministic-planner.js';
import { type AiObservationEvaluation } from './observation-repair.js';
import { type AiProposalExecutionResult } from './proposal-execution.js';
export type AiOperatorFallbackPlan = {
    type: 'proposal';
    reasonCode: string;
    proposal: Omit<AiCommandProposal, 'status'> & {
        status: 'draft' | 'proposed';
    };
    source: 'capability-gap' | 'policy-denial';
} | {
    type: 'unavailable';
    reasonCode: string;
    source: 'prompt-injection';
};
export type AiOperatorAcceptanceTrace = {
    scenarioId: 'capability-gap' | 'policy-denial' | 'prompt-injection-registry';
    semanticContext: AiSemanticContext;
    proposal: AiCommandProposal;
    execution: AiProposalExecutionResult;
    evaluation: AiObservationEvaluation;
    fallback: AiOperatorFallbackPlan;
    nonExecution: {
        beforeRevision: number;
        afterRevision: number;
        beforeNodeCount: number;
        afterNodeCount: number;
        appliedMutation: boolean;
    };
    injection: {
        handledAsData: boolean;
        deniedOperation: string | null;
    };
    redactionSummary: AiContextRedactionMetadata;
    reusedCoreSignals: {
        goldenScenarioCount: number;
        parityCommandTypes: string[];
    };
};
export declare function runAiOperatorAcceptanceFixtures(): AiOperatorAcceptanceTrace[];
//# sourceMappingURL=operator-acceptance-fixtures.d.ts.map