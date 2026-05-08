/**
 * Purpose: Shared helpers for deterministic FF-18 AI Operator acceptance traces.
 */

import {
  buildAiSemanticContext,
  redactAiContextValue,
} from './semantic-context.js';
import {
  createDeterministicSemanticPlanner,
  type AiCommandProposal,
  type AiSemanticCommand,
} from './deterministic-planner.js';
import {
  createAiProposalExecutionCore,
  type AiProposalExecutionPolicy,
  type AiProposalExecutionResult,
} from './proposal-execution.js';
import { runFf18GoldenScenarioFixtures } from './golden-scenario-fixtures.js';
import { runAiSemanticCommandBusParityFixture } from './semantic-command-bus-parity.js';
import type {
  AiOperatorAcceptanceTrace,
  OperatorBus,
  OperatorSnapshot,
} from './operator-acceptance-types.js';
export type {
  AiOperatorAcceptanceTrace,
  AiOperatorFallbackPlan,
} from './operator-acceptance-types.js';
export {
  actor,
  createOperatorBus,
  definition,
  snapshotFor,
} from './operator-acceptance-bus.js';
import {
  actor,
  createOperatorBus,
  definition,
  snapshotFor,
} from './operator-acceptance-bus.js';

export const proposalFor = (id: string, command: AiSemanticCommand): AiCommandProposal => ({
  id: `proposal:${id}`,
  title: id,
  commands: [command],
  status: 'draft',
});

export const execute = (input: {
  bus: OperatorBus;
  proposal: AiCommandProposal;
  policy: AiProposalExecutionPolicy;
}): AiProposalExecutionResult =>
  createAiProposalExecutionCore({ bus: input.bus, policy: input.policy }).executeProposal({
    actor,
    proposal: input.proposal,
  });

export const nonExecution = (
  before: OperatorSnapshot,
  after: OperatorSnapshot
): AiOperatorAcceptanceTrace['nonExecution'] => ({
  beforeRevision: before.revision,
  afterRevision: after.revision,
  beforeNodeCount: before.nodes.length,
  afterNodeCount: after.nodes.length,
  appliedMutation: before.revision !== after.revision || before.nodes.length !== after.nodes.length,
});

export const sanitizedTrace = <T>(value: T): T => redactAiContextValue(value).value as T;

export const coreSignals = (): AiOperatorAcceptanceTrace['reusedCoreSignals'] => ({
  goldenScenarioCount: runFf18GoldenScenarioFixtures().length,
  parityCommandTypes: runAiSemanticCommandBusParityFixture({
    cases: [
      {
        id: 'wp6-signal',
        command: { type: 'node.params.update', nodeId: 'signal:1', params: { value: 2 } },
        createBus: () =>
          createOperatorBus(
            snapshotFor({
              revision: 1,
              nodes: [{ id: 'signal:1', type: 'signal', params: { value: 1 }, inputValues: {}, outputValues: {} }],
              definitions: [definition({ type: 'signal', description: 'signal', params: [{ key: 'value', min: 0, max: 4 }] })],
              capabilities: ['semantic.command'],
            })
          ),
      },
    ],
  }).map((trace) => trace.commandType),
});

export const semanticContext = buildAiSemanticContext;
export const plannerFor = createDeterministicSemanticPlanner;
