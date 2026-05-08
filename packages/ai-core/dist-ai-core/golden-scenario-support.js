/**
 * Purpose: Shared helpers for deterministic FF-18 golden scenario contract traces.
 */
import { buildAiSemanticContext, } from './semantic-context.js';
import { createDeterministicSemanticPlanner, } from './deterministic-planner.js';
import { createAiProposalExecutionCore, } from './proposal-execution.js';
import { createAiObservationEvaluator, createAiRepairPlanner, } from './observation-repair.js';
export const actor = { id: 'ai:ff18-wp4', role: 'ai' };
const createdAt = () => new Date(0).toISOString();
const executionCore = (bus) => createAiProposalExecutionCore({
    bus,
    policy: {
        allowedOperations: ['node.params.update'],
        approvalRequiredOperations: [],
        deniedOperations: [],
    },
});
const dryRunFailedExecution = (proposal, dryRun) => ({
    status: 'dry-run-failed',
    proposalId: proposal.id,
    commandSequence: [...proposal.commands],
    policy: { status: 'allowed', decisions: proposal.commands.map((command) => ({ operation: command.type, status: 'allowed' })) },
    dryRun: { ok: false, results: dryRun.dryRunResults },
    appliedResults: [],
    previousRevision: dryRun.dryRunResults[0]?.previousRevision ?? null,
    appliedRevision: null,
    audit: {
        id: `audit:ai:${proposal.id}:dry-run-failed`,
        type: 'proposal-execution',
        proposalId: proposal.id,
        actor,
        lifecycle: ['policy', 'dry-run', 'apply', 'audit', 'history', 'rollback-token'],
        promptHash: 'sha256:dry-run-failed-fixture',
        snapshotRevision: dryRun.dryRunResults[0]?.previousRevision ?? 0,
        validation: { ok: false, errorCount: dryRun.validationErrors.length },
        policy: { status: 'allowed', decisions: proposal.commands.map((command) => ({ operation: command.type, status: 'allowed' })) },
        approval: { status: 'not-required' },
        execution: { status: 'dry-run-failed', appliedCommandCount: 0 },
        observation: { status: 'not-provided' },
        rollback: { reference: null, commandRollbackTokens: [] },
        commandAudits: [],
        previousRevision: dryRun.dryRunResults[0]?.previousRevision ?? 0,
        appliedRevision: null,
        rollbackReference: null,
        createdAt: createdAt(),
    },
    historyEntry: null,
    rollback: {
        reference: null,
        commandRollbackTokens: [],
        previousRevision: dryRun.dryRunResults[0]?.previousRevision ?? null,
        appliedRevision: null,
    },
});
export const runProposal = (bus, intent) => {
    const context = buildAiSemanticContext({
        snapshot: bus.getSnapshot(),
        actor,
        policy: { mode: 'proposal-only', approvalRequired: ['node.params.update'] },
    });
    const planner = createDeterministicSemanticPlanner({ bus });
    const dryRun = planner.proposeAndDryRun({ actor, intent });
    const proposal = {
        ...dryRun.proposal,
        status: dryRun.proposal.status,
    };
    const execution = dryRun.status === 'dry-run-passed'
        ? executionCore(bus).executeProposal({ actor, proposal })
        : dryRunFailedExecution(dryRun.proposal, dryRun);
    return { context, dryRun, execution };
};
export const traceFor = (input) => {
    const evaluator = createAiObservationEvaluator();
    const observedResult = evaluator.evaluate({ execution: input.execution, observation: input.observation });
    const repair = createAiRepairPlanner().plan({
        actor,
        proposal: input.dryRun.proposal,
        evaluation: observedResult,
        context: { registry: input.context.registry, nodes: input.context.nodes },
    });
    return {
        scenarioId: input.scenarioId,
        title: input.title,
        semanticContext: input.context,
        commandSequence: [...input.dryRun.commandSequence],
        expectedOutputChange: input.dryRun.expectedEffect,
        risk: input.dryRun.risk,
        policy: {
            dryRun: input.dryRun.policy,
            apply: input.execution.policy,
        },
        status: {
            dryRun: input.dryRun.status,
            apply: input.execution.status,
        },
        audit: {
            executionAudit: input.execution.audit,
            rollback: input.execution.rollback,
            historyEntry: input.execution.historyEntry,
        },
        observedResult,
        repair,
        redactionSummary: input.context.redactions,
    };
};
//# sourceMappingURL=golden-scenario-support.js.map