/**
 * Purpose: Shared helpers for deterministic FF-18 AI Operator acceptance traces.
 */
import { buildAiSemanticContext } from './semantic-context.js';
import { createDeterministicSemanticPlanner, type AiCommandProposal, type AiSemanticCommand } from './deterministic-planner.js';
import { type AiProposalExecutionPolicy, type AiProposalExecutionResult } from './proposal-execution.js';
import type { AiOperatorAcceptanceTrace, OperatorBus, OperatorSnapshot } from './operator-acceptance-types.js';
export type { AiOperatorAcceptanceTrace, AiOperatorFallbackPlan, } from './operator-acceptance-types.js';
export { actor, createOperatorBus, definition, snapshotFor, } from './operator-acceptance-bus.js';
export declare const proposalFor: (id: string, command: AiSemanticCommand) => AiCommandProposal;
export declare const execute: (input: {
    bus: OperatorBus;
    proposal: AiCommandProposal;
    policy: AiProposalExecutionPolicy;
}) => AiProposalExecutionResult;
export declare const nonExecution: (before: OperatorSnapshot, after: OperatorSnapshot) => AiOperatorAcceptanceTrace["nonExecution"];
export declare const sanitizedTrace: <T>(value: T) => T;
export declare const coreSignals: () => AiOperatorAcceptanceTrace["reusedCoreSignals"];
export declare const semanticContext: typeof buildAiSemanticContext;
export declare const plannerFor: typeof createDeterministicSemanticPlanner;
//# sourceMappingURL=operator-acceptance-support.d.ts.map