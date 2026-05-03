/**
 * Purpose: Prove AI proposal execution preserves the real semantic command bus contract used by non-AI callers.
 */
import { type AiContextRedactionMetadata, type AiSemanticContext } from './semantic-context.js';
import { createDeterministicSemanticPlanner, type AiDryRunCommandResult, type AiSemanticActor, type AiSemanticCommand } from './deterministic-planner.js';
import { type AiObservationEvaluation } from './observation-repair.js';
import { type AiProposalExecutionResult } from './proposal-execution.js';
type ParityBus = {
    getSnapshot: () => Record<string, unknown>;
    dispatch: (input: {
        actor: AiSemanticActor;
        command: AiSemanticCommand;
        dryRun?: boolean;
    }) => AiDryRunCommandResult & {
        snapshot?: Record<string, unknown>;
    };
    rollback: (rollbackToken: string) => {
        ok: boolean;
        message?: string;
        recovery?: unknown;
        snapshot: {
            revision?: number;
        };
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
export declare function runAiSemanticCommandBusParityFixture(input: {
    actor?: AiSemanticActor;
    directActor?: AiSemanticActor;
    cases: AiSemanticCommandBusParityCase[];
}): AiSemanticCommandBusParityTrace[];
export {};
//# sourceMappingURL=semantic-command-bus-parity.d.ts.map