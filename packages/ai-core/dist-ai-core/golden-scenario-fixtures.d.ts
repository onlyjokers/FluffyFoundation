/**
 * Purpose: Build deterministic FF-18 golden scenario contract traces from existing AI semantic/runtime cores.
 */
import { type AiSemanticContext, type AiContextRedactionMetadata } from './semantic-context.js';
import { type AiProposalDryRunResult, type AiSemanticCommand } from './deterministic-planner.js';
import { type AiProposalExecutionResult } from './proposal-execution.js';
import { type AiObservationEvaluation, type AiRepairPlan } from './observation-repair.js';
export type Ff18GoldenScenarioTrace = {
    scenarioId: 'GS-12' | 'GS-13' | 'GS-14';
    title: string;
    semanticContext: AiSemanticContext;
    commandSequence: AiSemanticCommand[];
    expectedOutputChange: AiProposalDryRunResult['expectedEffect'];
    risk: AiProposalDryRunResult['risk'];
    policy: {
        dryRun: AiProposalDryRunResult['policy'];
        apply: AiProposalExecutionResult['policy'];
    };
    status: {
        dryRun: AiProposalDryRunResult['status'];
        apply: AiProposalExecutionResult['status'];
    };
    audit: {
        executionAudit: AiProposalExecutionResult['audit'];
        rollback: AiProposalExecutionResult['rollback'];
        historyEntry: AiProposalExecutionResult['historyEntry'];
    };
    observedResult: AiObservationEvaluation;
    repair: AiRepairPlan;
    redactionSummary: AiContextRedactionMetadata;
};
export declare function runFf18GoldenScenarioFixtures(): Ff18GoldenScenarioTrace[];
//# sourceMappingURL=golden-scenario-fixtures.d.ts.map