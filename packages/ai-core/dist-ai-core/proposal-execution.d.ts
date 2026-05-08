/**
 * Purpose: Execute approved FF-18/FF-19 AI semantic proposals through an injected command bus with local policy, audit, and rollback metadata.
 */
import type { AiSemanticActor, AiSemanticCommand, AiDryRunCommandResult } from './deterministic-planner.js';
export type AiProposalApproval = {
    approvedBy: string;
    approvedAt: string;
};
export type AiExecutableProposal = {
    id: string;
    title: string;
    commands: AiSemanticCommand[];
    status?: 'draft' | 'proposed' | 'accepted' | 'rejected';
};
export type AiProposalExecutionPolicy = {
    allowedOperations: string[];
    approvalRequiredOperations: string[];
    deniedOperations: string[];
};
export type AiPolicyDecision = {
    operation: string;
    status: 'allowed' | 'approval-required' | 'denied';
    reason?: string;
};
export type AiProposalExecutionPolicyResult = {
    status: 'allowed' | 'approval-required' | 'denied';
    decisions: AiPolicyDecision[];
    approval?: AiProposalApproval;
};
export type AiProposalDryRunStage = {
    ok: boolean;
    results: AiDryRunCommandResult[];
};
export type AiProposalExecutionHistoryEntry = {
    id: string;
    proposalId: string;
    actor: AiSemanticActor;
    status: 'applied';
    commandCount: number;
    previousRevision: number;
    appliedRevision: number;
    rollbackReference: string;
    createdAt: string;
};
export type AiProposalExecutionAuditEntry = {
    id: string;
    type: 'proposal-execution';
    proposalId: string;
    actor: AiSemanticActor;
    lifecycle: Array<'policy' | 'dry-run' | 'apply' | 'audit' | 'history' | 'rollback-token'>;
    promptHash: string;
    snapshotRevision: number;
    validation: {
        ok: boolean;
        errorCount: number;
    };
    policy: AiProposalExecutionPolicyResult;
    approval: {
        status: 'not-required' | 'missing' | 'approved';
        approvedBy?: string;
        approvedAt?: string;
    };
    execution: {
        status: AiProposalExecutionResultStatus;
        appliedCommandCount: number;
    };
    observation: {
        status: 'not-provided' | 'observed';
        summary?: string;
    };
    rollback: {
        reference: string | null;
        commandRollbackTokens: string[];
    };
    commandAudits: unknown[];
    previousRevision: number;
    appliedRevision: number | null;
    rollbackReference: string | null;
    createdAt: string;
} | {
    id: string;
    type: 'rollback';
    rollbackReference: string;
    ok: boolean;
    restoredRevision: number;
    createdAt: string;
};
export type AiProposalRollbackMetadata = {
    reference: string | null;
    commandRollbackTokens: string[];
    previousRevision: number | null;
    appliedRevision: number | null;
};
export type AiProposalExecutionResultStatus = 'applied' | 'approval-required' | 'policy-denied' | 'dry-run-failed' | 'apply-failed';
export type AiProposalExecutionResult = {
    status: AiProposalExecutionResultStatus;
    proposalId: string;
    commandSequence: AiSemanticCommand[];
    policy: AiProposalExecutionPolicyResult;
    dryRun: AiProposalDryRunStage;
    appliedResults: AiDryRunCommandResult[];
    previousRevision: number | null;
    appliedRevision: number | null;
    audit: Extract<AiProposalExecutionAuditEntry, {
        type: 'proposal-execution';
    }>;
    historyEntry: AiProposalExecutionHistoryEntry | null;
    rollback: AiProposalRollbackMetadata;
};
export type AiProposalRollbackResult = {
    ok: boolean;
    reference: string;
    restoredRevision: number;
    message?: string;
    recovery?: unknown;
};
export type AiExecutionCommandBusLike = {
    getSnapshot: () => {
        revision?: number;
    };
    dispatch: (input: {
        actor: AiSemanticActor;
        command: AiSemanticCommand;
        dryRun?: boolean;
    }) => AiDryRunCommandResult;
    rollback: (rollbackToken: string) => {
        ok: boolean;
        message?: string;
        recovery?: unknown;
        snapshot: {
            revision?: number;
        };
    };
};
export type AiProposalExecutionCore = {
    executeProposal: (input: {
        actor: AiSemanticActor;
        proposal: AiExecutableProposal;
        approval?: AiProposalApproval;
        prompt?: string;
        observation?: {
            status?: string;
            summary?: string;
        };
    }) => AiProposalExecutionResult;
    rollback: (rollbackReference: string | null | undefined) => AiProposalRollbackResult;
    getHistory: () => AiProposalExecutionHistoryEntry[];
    getAuditLog: () => AiProposalExecutionAuditEntry[];
};
export declare function createAiProposalExecutionCore(input: {
    bus: AiExecutionCommandBusLike;
    policy: AiProposalExecutionPolicy;
}): AiProposalExecutionCore;
//# sourceMappingURL=proposal-execution.d.ts.map