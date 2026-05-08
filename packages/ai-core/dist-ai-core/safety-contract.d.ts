/**
 * Purpose: Provide deterministic FF-19 AI safety classification, budget, and prompt-injection gates.
 */
import type { AiExecutableProposal, AiProposalExecutionPolicy } from './proposal-execution.js';
import type { AiSemanticActor } from './deterministic-planner.js';
export type AiProviderContract = {
    provider: string;
    model: string;
    maxPromptTokens: number;
    maxCompletionTokens: number;
    maxToolCalls: number;
    maxCommands: number;
};
export type AiProviderUsage = {
    promptTokens: number;
    completionTokens: number;
    toolCalls: number;
};
export type AiSafetyDecision = {
    operation: string;
    status: 'auto' | 'approval-required' | 'denied';
    reason?: string;
};
export type AiBudgetViolation = {
    field: 'promptTokens' | 'completionTokens' | 'toolCalls' | 'commands';
    limit: number;
    actual: number;
};
export type AiPromptInjectionSignal = {
    path: string;
    effect: 'ignored';
    pattern: string;
};
export type AiProposalSafetyClassification = {
    status: 'auto' | 'approval-required' | 'denied';
    actor: AiSemanticActor;
    provider: AiProviderContract;
    usage: AiProviderUsage;
    budget: {
        allowed: boolean;
        violations: AiBudgetViolation[];
    };
    decisions: AiSafetyDecision[];
    injectionSignals: AiPromptInjectionSignal[];
};
type ClassifyAiProposalSafetyInput = {
    actor: AiSemanticActor;
    proposal: AiExecutableProposal & {
        metadata?: unknown;
    };
    policy: AiProposalExecutionPolicy;
    budget: AiProviderContract;
    usage: AiProviderUsage;
};
export declare function classifyAiProposalSafety(input: ClassifyAiProposalSafetyInput): AiProposalSafetyClassification;
export {};
//# sourceMappingURL=safety-contract.d.ts.map