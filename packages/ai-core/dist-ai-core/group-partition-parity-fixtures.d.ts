/**
 * Purpose: Build deterministic FF-18 WP7 parity traces for Group internals and execution partitions.
 */
import type { AiProposalDryRunResult, AiSemanticActor } from './deterministic-planner.js';
import { type AiSemanticCommandBusParityCase, type AiSemanticCommandBusParityTrace } from './semantic-command-bus-parity.js';
export type AiGroupPartitionParityCase = AiSemanticCommandBusParityCase & {
    approvalRequired?: boolean;
};
export type AiGroupPartitionParityTrace = AiSemanticCommandBusParityTrace & {
    approvalRequired: boolean;
    expectedEffect: AiProposalDryRunResult['expectedEffect'];
    risk: AiProposalDryRunResult['risk'];
    runtimeObservation: {
        kind: 'runtime-observation-deferred';
        deferred: true;
        reasonCode: 'BROWSER_RUNTIME_PROOF_DEFERRED';
    };
};
export declare function runAiGroupPartitionParityFixtures(input: {
    actor?: AiSemanticActor;
    directActor?: AiSemanticActor;
    cases: AiGroupPartitionParityCase[];
}): AiGroupPartitionParityTrace[];
//# sourceMappingURL=group-partition-parity-fixtures.d.ts.map