/**
 * Purpose: Type contracts for deterministic FF-18 AI Operator acceptance traces.
 */

import type {
  AiCommandProposal,
  AiDryRunCommandResult,
  AiSemanticActor,
  AiSemanticCommand,
} from './deterministic-planner.js';
import type { AiObservationEvaluation } from './observation-repair.js';
import type { AiProposalExecutionResult } from './proposal-execution.js';
import type {
  AiContextRedactionMetadata,
  AiSemanticContext,
} from './semantic-context.js';

export type OperatorNode = {
  id: string;
  type: string;
  params: Record<string, unknown>;
  inputValues: Record<string, unknown>;
  outputValues: Record<string, unknown>;
};

export type OperatorSnapshot = {
  revision: number;
  nodes: OperatorNode[];
  connections: unknown[];
  groups: Array<Record<string, unknown>>;
  partitions: Array<Record<string, unknown>>;
  runtimeStatus: Record<string, unknown>;
  deviceCapabilities: Array<Record<string, unknown>>;
  errors: Array<Record<string, unknown>>;
  permissions: Array<Record<string, unknown>>;
  definitions: Array<Record<string, unknown>>;
  proposals: Array<Record<string, unknown>>;
};

export type OperatorBus = {
  getSnapshot: () => OperatorSnapshot;
  dispatch: (input: {
    actor: AiSemanticActor;
    command: AiSemanticCommand;
    dryRun?: boolean;
  }) => AiDryRunCommandResult;
  rollback: (rollbackToken: string) => { ok: boolean; snapshot: { revision?: number }; message?: string };
};

export type AiOperatorFallbackPlan =
  | {
      type: 'proposal';
      reasonCode: string;
      proposal: Omit<AiCommandProposal, 'status'> & { status: 'draft' | 'proposed' };
      source: 'capability-gap' | 'policy-denial';
    }
  | {
      type: 'unavailable';
      reasonCode: string;
      source: 'prompt-injection';
    };

export type AiOperatorAcceptanceTrace = {
  scenarioId: 'capability-gap' | 'policy-denial' | 'prompt-injection-registry';
  semanticContext: AiSemanticContext;
  proposal: AiCommandProposal;
  execution: AiProposalExecutionResult;
  evaluation: AiObservationEvaluation;
  fallback: AiOperatorFallbackPlan;
  nonExecution: {
    beforeRevision: number;
    afterRevision: number;
    beforeNodeCount: number;
    afterNodeCount: number;
    appliedMutation: boolean;
  };
  injection: {
    handledAsData: boolean;
    deniedOperation: string | null;
  };
  redactionSummary: AiContextRedactionMetadata;
  reusedCoreSignals: {
    goldenScenarioCount: number;
    parityCommandTypes: string[];
  };
};
