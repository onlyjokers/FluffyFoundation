/**
 * Purpose: Package AI-readable semantic context without Canvas/UI layout noise or sensitive local data.
 */
export type AiContextRedaction = {
    kind: 'secret' | 'private-path' | 'ui-noise';
    path: string;
};
export type AiContextRedactionMetadata = {
    count: number;
    redactions: AiContextRedaction[];
};
export type AiValidationReport = {
    code: string;
    path: string;
    severity: 'error' | 'warning';
    message: string;
    machineReason?: string;
    repairOptions: string[];
};
export type AiDryRunSummary = {
    ok: boolean;
    commandType: string;
    validationErrors: AiValidationReport[];
};
export type AiPolicyContext = {
    mode: 'proposal-only' | 'dry-run-only' | 'auto-execute-disabled';
    deniedOperations: string[];
    approvalRequired: string[];
};
export type AiSemanticContextInput = {
    snapshot: Record<string, unknown>;
    actor: {
        id: string;
        role: string;
    };
    policy?: Partial<AiPolicyContext>;
    validationReports?: AiValidationReport[];
    dryRunResults?: AiDryRunSummary[];
};
export type AiSemanticContext = {
    revision: number;
    actor: {
        id: string;
        role: string;
    };
    nodes: Array<Record<string, unknown>>;
    connections: unknown[];
    groups: Array<Record<string, unknown>>;
    partitions: Array<Record<string, unknown>>;
    runtimeStatus: Record<string, unknown>;
    deviceCapabilities: unknown[];
    errors: unknown[];
    permissions: Array<Record<string, unknown>>;
    registry: Array<Record<string, unknown>>;
    proposals: Array<Record<string, unknown>>;
    policy: AiPolicyContext;
    validationReports: AiValidationReport[];
    dryRunResults: AiDryRunSummary[];
    rollbackMetadataRefs: string[];
    redactions: AiContextRedactionMetadata;
};
export declare function redactAiContextValue(value: unknown): {
    value: unknown;
    metadata: AiContextRedactionMetadata;
};
export declare function buildAiSemanticContext(input: AiSemanticContextInput): AiSemanticContext;
//# sourceMappingURL=semantic-context.d.ts.map