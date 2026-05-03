/**
 * Purpose: Deterministically draft FF-18 WP1 AI proposals and dry-run them through an injected semantic command bus.
 */
import type { AiValidationReport } from './semantic-context.js';
export type AiSemanticActor = {
    id: string;
    role: string;
};
export type AiSemanticCommand = {
    type: 'node.add';
    node: {
        id: string;
        type: string;
        position?: {
            x: number;
            y: number;
        };
        config?: Record<string, unknown>;
        inputValues?: Record<string, unknown>;
        outputValues?: Record<string, unknown>;
    };
} | {
    type: 'node.remove';
    nodeId: string;
} | {
    type: 'node.archive';
    nodeId: string;
} | {
    type: 'node.params.update';
    nodeId: string;
    params: Record<string, unknown>;
} | {
    type: 'node.disconnect';
    connectionId: string;
} | {
    type: 'node.connect';
    connection: {
        id: string;
        sourceNodeId: string;
        sourcePortId: string;
        targetNodeId: string;
        targetPortId: string;
    };
} | {
    type: 'group.create';
    group: {
        id: string;
        parentId: string | null;
        name: string;
        nodeIds: string[];
        disabled: boolean;
        [key: string]: unknown;
    };
} | {
    type: 'group.update';
    groupId: string;
    patch: Record<string, unknown>;
} | {
    type: 'group.archive';
    groupId: string;
} | {
    type: 'group.restore';
    groupId: string;
} | {
    type: 'partition.deploy';
    partitionId: string;
    nodeIds: string[];
    targetPlatform?: string;
    requiredCapabilities?: string[];
    expectedRevision?: number;
} | {
    type: 'partition.stop';
    partitionId: string;
    expectedRevision?: number;
};
export type AiCommandProposal = {
    id: string;
    title: string;
    commands: AiSemanticCommand[];
    status: 'draft';
};
export type AiPlannerIntent = {
    id: string;
    kind: 'display-breathing' | 'gyro-flashlight-rhythm' | 'raw-command';
    targetNodeId?: string;
    constraints?: Record<string, unknown>;
    command?: AiSemanticCommand;
};
export type AiDryRunCommandResult = {
    ok: boolean;
    command: AiSemanticCommand;
    dryRun: boolean;
    previousRevision: number;
    appliedRevision: number;
    rollbackToken?: string;
    audit?: {
        rollbackToken?: string;
        policy?: {
            allowed: boolean;
            reason?: string;
        };
        lifecycle?: string[];
    };
    message?: string;
    validationErrors?: AiValidationReport[];
};
export type AiSemanticCommandBusLike = {
    getSnapshot: () => Record<string, unknown>;
    dispatch: (input: {
        actor: AiSemanticActor;
        command: AiSemanticCommand;
        dryRun: boolean;
    }) => AiDryRunCommandResult;
};
export type AiProposalDryRunResult = {
    status: 'dry-run-passed' | 'dry-run-failed' | 'unsupported-intent';
    proposal: AiCommandProposal;
    commandSequence: AiSemanticCommand[];
    expectedEffect: {
        summary: string;
        targetNodeId: string | null;
        params: Record<string, unknown>;
    };
    risk: {
        level: 'low' | 'medium' | 'high';
        reasons: string[];
    };
    rollback: {
        reference: string | null;
        previousRevision: number | null;
        appliedRevision: number | null;
    };
    policy: {
        status: 'proposal-only';
        dryRun: boolean;
        allowed: boolean;
        reason?: string;
    };
    validationErrors: AiValidationReport[];
    repairHints: string[];
    dryRunResults: AiDryRunCommandResult[];
};
export type DeterministicSemanticPlanner = {
    proposeAndDryRun: (input: {
        actor: AiSemanticActor;
        intent: AiPlannerIntent;
    }) => AiProposalDryRunResult;
};
export declare function createDeterministicSemanticPlanner(input: {
    bus: AiSemanticCommandBusLike;
}): DeterministicSemanticPlanner;
//# sourceMappingURL=deterministic-planner.d.ts.map