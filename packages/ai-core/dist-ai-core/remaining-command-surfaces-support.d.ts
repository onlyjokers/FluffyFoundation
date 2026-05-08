/**
 * Purpose: Shared helpers for FF-18 WP8 remaining command surface fixtures.
 */
import type { AiProposalDryRunResult, AiSemanticCommand } from './deterministic-planner.js';
import type { AiRuntimeObservationDeferred, RollbackBus } from './remaining-command-surfaces-types.js';
export declare const stableJson: (value: unknown) => string;
export declare const snapshotForParity: (snapshot: Record<string, unknown>) => Record<string, unknown>;
export declare const runtimeObservation: () => AiRuntimeObservationDeferred;
export declare const getAuditLength: (bus: RollbackBus) => number | null;
export declare const getHistoryLength: (bus: RollbackBus) => number | null;
export declare const revisionOf: (snapshot: Record<string, unknown>) => number | null;
export declare const createdAt: () => string;
export declare const effectFor: (command: AiSemanticCommand) => AiProposalDryRunResult["expectedEffect"];
export declare const riskFor: (command: AiSemanticCommand) => AiProposalDryRunResult["risk"];
export declare const redacted: <T>(value: T) => T;
//# sourceMappingURL=remaining-command-surfaces-support.d.ts.map