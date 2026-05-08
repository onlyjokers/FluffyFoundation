/**
 * Purpose: Shared helpers for deterministic FF-18 AI Operator acceptance traces.
 */
import { buildAiSemanticContext, redactAiContextValue, } from './semantic-context.js';
import { createDeterministicSemanticPlanner, } from './deterministic-planner.js';
import { createAiProposalExecutionCore, } from './proposal-execution.js';
import { runFf18GoldenScenarioFixtures } from './golden-scenario-fixtures.js';
import { runAiSemanticCommandBusParityFixture } from './semantic-command-bus-parity.js';
export { actor, createOperatorBus, definition, snapshotFor, } from './operator-acceptance-bus.js';
import { actor, createOperatorBus, definition, snapshotFor, } from './operator-acceptance-bus.js';
export const proposalFor = (id, command) => ({
    id: `proposal:${id}`,
    title: id,
    commands: [command],
    status: 'draft',
});
export const execute = (input) => createAiProposalExecutionCore({ bus: input.bus, policy: input.policy }).executeProposal({
    actor,
    proposal: input.proposal,
});
export const nonExecution = (before, after) => ({
    beforeRevision: before.revision,
    afterRevision: after.revision,
    beforeNodeCount: before.nodes.length,
    afterNodeCount: after.nodes.length,
    appliedMutation: before.revision !== after.revision || before.nodes.length !== after.nodes.length,
});
export const sanitizedTrace = (value) => redactAiContextValue(value).value;
export const coreSignals = () => ({
    goldenScenarioCount: runFf18GoldenScenarioFixtures().length,
    parityCommandTypes: runAiSemanticCommandBusParityFixture({
        cases: [
            {
                id: 'wp6-signal',
                command: { type: 'node.params.update', nodeId: 'signal:1', params: { value: 2 } },
                createBus: () => createOperatorBus(snapshotFor({
                    revision: 1,
                    nodes: [{ id: 'signal:1', type: 'signal', params: { value: 1 }, inputValues: {}, outputValues: {} }],
                    definitions: [definition({ type: 'signal', description: 'signal', params: [{ key: 'value', min: 0, max: 4 }] })],
                    capabilities: ['semantic.command'],
                })),
            },
        ],
    }).map((trace) => trace.commandType),
});
export const semanticContext = buildAiSemanticContext;
export const plannerFor = createDeterministicSemanticPlanner;
//# sourceMappingURL=operator-acceptance-support.js.map