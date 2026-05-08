/**
 * Purpose: Shared FF-18 WP8 trace types for remaining AI semantic command surfaces.
 */

import type {
  AiSemanticCommandBusParityCase,
  AiSemanticCommandBusParityTrace,
} from './semantic-command-bus-parity.js';
import type {
  AiDryRunCommandResult,
  AiProposalDryRunResult,
  AiSemanticCommand,
} from './deterministic-planner.js';
import type { AiContextRedactionMetadata, AiSemanticContext } from './semantic-context.js';
import type { AiObservationEvaluation } from './observation-repair.js';

export type RollbackBus = AiSemanticCommandBusParityCase['createBus'] extends () => infer T
  ? T & {
      rollbackToRevision?: (revision: number) => {
        ok: boolean;
        message?: string;
        recovery?: unknown;
        snapshot: Record<string, unknown>;
      };
    }
  : never;

export type AiRuntimeObservationDeferred = {
  kind: 'runtime-observation-deferred';
  deferred: true;
  reasonCode: 'BROWSER_RUNTIME_PROOF_DEFERRED';
};

export type AiRuntimeOverrideInput = {
  action: 'set' | 'clear';
  nodeId: string;
  portId: string;
  kind?: 'input' | 'output' | 'param';
  value?: unknown;
  ttlMs?: number;
};

export type AiRollbackRevisionTrace = {
  caseId: string;
  status: 'executable';
  commandType: 'rollback.revision';
  semanticContext: AiSemanticContext;
  rollbackRevision: {
    revision: number;
    setupCommandSequence: AiSemanticCommand[];
    setupResults: AiDryRunCommandResult[];
    ai: { ok: boolean; message?: string; recovery?: unknown; snapshot: Record<string, unknown> };
    direct: { ok: boolean; message?: string; recovery?: unknown; snapshot: Record<string, unknown> };
    parity: { snapshotMatches: boolean; revisionMatches: boolean };
    audit: {
      historyLengthAfterSetup: number | null;
      auditLogLengthAfterSetup: number | null;
      rollbackMetadata: { previousRevision: number; targetRevision: number; restoredRevision: number | null };
    };
    observedResult: AiObservationEvaluation;
  };
  ai: {
    commandSequence: AiSemanticCommand[];
    snapshot: Record<string, unknown>;
    redactionSummary: AiContextRedactionMetadata;
  };
  runtimeObservation: AiRuntimeObservationDeferred;
};

export type AiRemainingCommandSurfaceCase =
  | AiSemanticCommandBusParityCase
  | {
      id: string;
      createBus: () => RollbackBus;
      setupCommands: AiSemanticCommand[];
      rollbackRevision: number;
    }
  | {
      id: string;
      createBus: () => RollbackBus;
      runtimeOverride: AiRuntimeOverrideInput;
    };

export type AiRemainingCommandSurfaceTrace =
  | (AiSemanticCommandBusParityTrace & {
      status: 'executable';
      expectedEffect: AiProposalDryRunResult['expectedEffect'];
      risk: AiProposalDryRunResult['risk'];
      runtimeObservation: AiRuntimeObservationDeferred;
    })
  | AiRollbackRevisionTrace
  | (AiSemanticCommandBusParityTrace & {
      status: 'executable';
      runtimeOverride: AiRuntimeOverrideInput;
      expectedEffect: AiProposalDryRunResult['expectedEffect'];
      risk: AiProposalDryRunResult['risk'];
      runtimeObservation: AiRuntimeObservationDeferred;
    });
