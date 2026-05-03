/**
 * Purpose: Prove AI proposal execution preserves the real semantic command bus contract used by non-AI callers.
 */
import { buildAiSemanticContext, redactAiContextValue, } from './semantic-context.js';
import { createDeterministicSemanticPlanner, } from './deterministic-planner.js';
import { createAiObservationEvaluator, } from './observation-repair.js';
import { createAiProposalExecutionCore, } from './proposal-execution.js';
const defaultActor = { id: 'ai:wp5', role: 'ai' };
const defaultDirectActor = { id: 'cli:wp5', role: 'service' };
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const getAuditLength = (bus) => {
    const method = bus.getAuditLog;
    return method ? method().length : null;
};
const getHistoryLength = (bus) => {
    const method = bus.getHistory;
    return method ? method().length : null;
};
const sortedRecord = (value) => {
    if (Array.isArray(value))
        return value.map(sortedRecord);
    if (!isRecord(value))
        return value;
    return Object.fromEntries(Object.keys(value)
        .sort()
        .map((key) => [key, sortedRecord(value[key])]));
};
const stableJson = (value) => JSON.stringify(sortedRecord(value));
const paritySnapshot = (snapshot) => ({
    revision: snapshot.revision,
    nodes: snapshot.nodes,
    connections: snapshot.connections,
    groups: snapshot.groups,
    partitions: snapshot.partitions,
    proposals: snapshot.proposals,
});
const changedTargetsFor = (command) => {
    if ('nodeId' in command)
        return [String(command.nodeId)];
    if (command.type === 'node.add')
        return [String(command.node.id)];
    if (command.type === 'node.connect')
        return [String(command.connection.id)];
    if (command.type === 'node.disconnect')
        return [String(command.connectionId)];
    if (command.type === 'group.create')
        return [String(command.group.id)];
    if ('groupId' in command)
        return [String(command.groupId)];
    if ('partitionId' in command)
        return [String(command.partitionId)];
    return [];
};
export function runAiSemanticCommandBusParityFixture(input) {
    const actor = input.actor ?? defaultActor;
    const directActor = input.directActor ?? defaultDirectActor;
    const evaluator = createAiObservationEvaluator();
    return input.cases.map((item) => {
        const aiBus = item.createBus();
        const directBus = item.createBus();
        const semanticContext = buildAiSemanticContext({
            snapshot: aiBus.getSnapshot(),
            actor,
            policy: { mode: 'proposal-only', approvalRequired: [item.command.type] },
        });
        const planner = createDeterministicSemanticPlanner({ bus: aiBus });
        const dryRun = planner.proposeAndDryRun({
            actor,
            intent: { id: `wp5:${item.id}`, kind: 'raw-command', command: item.command },
        });
        const execution = createAiProposalExecutionCore({
            bus: aiBus,
            policy: input.policyForCase?.(item) ?? {
                allowedOperations: [item.command.type],
                approvalRequiredOperations: [],
                deniedOperations: [],
            },
        }).executeProposal({ actor, proposal: dryRun.proposal });
        const aiSnapshot = aiBus.getSnapshot();
        const observedResult = evaluator.evaluate({
            execution,
            observation: {
                kind: 'output-change',
                proposalId: execution.proposalId,
                observed: execution.status === 'applied',
                changedTargets: changedTargetsFor(item.command),
                measuredAtRevision: execution.appliedRevision ?? undefined,
            },
        });
        const directResult = directBus.dispatch({ actor: directActor, command: item.command, dryRun: false });
        const directSnapshot = directBus.getSnapshot();
        const sanitizedDirectResult = redactAiContextValue(directResult).value;
        const sanitizedDirectSnapshot = redactAiContextValue(directSnapshot).value;
        const sanitizedAiSnapshot = redactAiContextValue(aiSnapshot).value;
        return {
            caseId: item.id,
            commandType: item.command.type,
            semanticContext,
            ai: {
                commandSequence: [...dryRun.commandSequence],
                status: { dryRun: dryRun.status, apply: execution.status },
                policy: { dryRun: dryRun.policy, apply: execution.policy },
                audit: {
                    executionAudit: execution.audit,
                    rollback: execution.rollback,
                    historyEntry: execution.historyEntry,
                },
                snapshot: sanitizedAiSnapshot,
                observedResult,
                redactionSummary: semanticContext.redactions,
            },
            direct: {
                result: sanitizedDirectResult,
                snapshot: sanitizedDirectSnapshot,
                auditLogLength: getAuditLength(directBus),
                historyLength: getHistoryLength(directBus),
            },
            parity: {
                appliedRevisionMatches: execution.appliedRevision === directResult.appliedRevision,
                snapshotMatches: stableJson(paritySnapshot(aiSnapshot)) === stableJson(paritySnapshot(directSnapshot)),
                commandTypeMatches: execution.commandSequence[0]?.type === directResult.command.type,
            },
        };
    });
}
//# sourceMappingURL=semantic-command-bus-parity.js.map