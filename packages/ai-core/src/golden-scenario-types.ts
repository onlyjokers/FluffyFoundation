/**
 * Purpose: Shared FF-18 golden scenario fixture and trace types.
 */

import type { AiContextRedactionMetadata, AiSemanticContext } from './semantic-context.js';
import type {
  AiDryRunCommandResult,
  AiProposalDryRunResult,
  AiSemanticActor,
  AiSemanticCommand,
} from './deterministic-planner.js';
import type { AiProposalExecutionResult } from './proposal-execution.js';
import type { AiObservationEvaluation, AiRepairPlan } from './observation-repair.js';

export type FixtureNode = {
  id: string;
  type: string;
  params: Record<string, unknown>;
  inputValues: Record<string, unknown>;
  outputValues: Record<string, unknown>;
};

export type FixtureDefinition = {
  type: string;
  label: string;
  category: string;
  aiSummary: Record<string, unknown>;
};

export type FixtureSnapshot = {
  revision: number;
  nodes: FixtureNode[];
  connections: unknown[];
  groups: Array<Record<string, unknown>>;
  partitions: Array<Record<string, unknown>>;
  runtimeStatus: Record<string, unknown>;
  deviceCapabilities: Array<Record<string, unknown>>;
  errors: Array<Record<string, unknown>>;
  permissions: Array<Record<string, unknown>>;
  definitions: FixtureDefinition[];
  proposals: Array<Record<string, unknown>>;
};

export type FixtureCommandAudit = {
  rollbackToken?: string;
  policy?: { allowed: boolean; reason?: string };
  lifecycle?: string[];
};

export type FixtureRollbackResult = {
  ok: boolean;
  message?: string;
  recovery?: unknown;
  snapshot: FixtureSnapshot;
};

export type FixtureBus = {
  getSnapshot: () => FixtureSnapshot;
  dispatch: (input: {
    actor: AiSemanticActor;
    command: AiSemanticCommand;
    dryRun?: boolean;
  }) => AiDryRunCommandResult;
  rollback: (rollbackToken: string) => FixtureRollbackResult;
};

export type Ff18GoldenScenarioTrace = {
  scenarioId: 'GS-12' | 'GS-13' | 'GS-14';
  title: string;
  semanticContext: AiSemanticContext;
  commandSequence: AiSemanticCommand[];
  expectedOutputChange: AiProposalDryRunResult['expectedEffect'];
  risk: AiProposalDryRunResult['risk'];
  policy: {
    dryRun: AiProposalDryRunResult['policy'];
    apply: AiProposalExecutionResult['policy'];
  };
  status: {
    dryRun: AiProposalDryRunResult['status'];
    apply: AiProposalExecutionResult['status'];
  };
  audit: {
    executionAudit: AiProposalExecutionResult['audit'];
    rollback: AiProposalExecutionResult['rollback'];
    historyEntry: AiProposalExecutionResult['historyEntry'];
  };
  observedResult: AiObservationEvaluation;
  repair: AiRepairPlan;
  redactionSummary: AiContextRedactionMetadata;
};
