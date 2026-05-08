/**
 * Purpose: Shared helpers for deterministic FF-18 golden scenario contract traces.
 */
import { type AiSemanticContext } from './semantic-context.js';
import { createDeterministicSemanticPlanner, type AiProposalDryRunResult, type AiSemanticActor } from './deterministic-planner.js';
import { type AiProposalExecutionResult } from './proposal-execution.js';
import { type AiObservationReport } from './observation-repair.js';
import type { FixtureBus, Ff18GoldenScenarioTrace } from './golden-scenario-types.js';
export type { Ff18GoldenScenarioTrace } from './golden-scenario-types.js';
export declare const actor: AiSemanticActor;
export declare const runProposal: (bus: FixtureBus, intent: Parameters<ReturnType<typeof createDeterministicSemanticPlanner>["proposeAndDryRun"]>[0]["intent"]) => {
    context: AiSemanticContext;
    dryRun: AiProposalDryRunResult;
    execution: AiProposalExecutionResult;
};
export declare const traceFor: (input: {
    scenarioId: Ff18GoldenScenarioTrace["scenarioId"];
    title: string;
    context: AiSemanticContext;
    dryRun: AiProposalDryRunResult;
    execution: AiProposalExecutionResult;
    observation: AiObservationReport;
}) => Ff18GoldenScenarioTrace;
//# sourceMappingURL=golden-scenario-support.d.ts.map