/**
 * Purpose: Build deterministic FF-18 WP8 traces for remaining AI Operator semantic command API surfaces.
 */
import { buildAiSemanticContext, } from './semantic-context.js';
import { createAiObservationEvaluator, } from './observation-repair.js';
import { runAiSemanticCommandBusParityFixture, } from './semantic-command-bus-parity.js';
import { effectFor, getAuditLength, getHistoryLength, redacted, revisionOf, riskFor, runtimeObservation, snapshotForParity, stableJson, } from './remaining-command-surfaces-support.js';
const defaultActor = { id: 'ai:wp8', role: 'ai' };
const defaultDirectActor = { id: 'cli:wp8', role: 'service' };
const runExecutableCommand = (item, actor, directActor) => {
    const [trace] = runAiSemanticCommandBusParityFixture({
        actor,
        directActor,
        cases: [item],
    });
    return {
        ...trace,
        status: 'executable',
        expectedEffect: effectFor(item.command),
        risk: riskFor(item.command),
        runtimeObservation: runtimeObservation(),
    };
};
const runRollbackRevision = (item, actor, directActor) => {
    const aiBus = item.createBus();
    const directBus = item.createBus();
    const semanticContext = buildAiSemanticContext({
        snapshot: aiBus.getSnapshot(),
        actor,
        policy: { mode: 'proposal-only', approvalRequired: ['rollback.revision'] },
    });
    const aiSetupResults = item.setupCommands.map((command) => aiBus.dispatch({ actor, command, dryRun: false }));
    item.setupCommands.forEach((command) => directBus.dispatch({ actor: directActor, command, dryRun: false }));
    const aiRollback = aiBus.rollbackToRevision
        ? aiBus.rollbackToRevision(item.rollbackRevision)
        : { ok: false, message: 'Rollback revision surface is not implemented.', snapshot: aiBus.getSnapshot() };
    const directRollback = directBus.rollbackToRevision
        ? directBus.rollbackToRevision(item.rollbackRevision)
        : { ok: false, message: 'Rollback revision surface is not implemented.', snapshot: directBus.getSnapshot() };
    const aiSnapshot = aiBus.getSnapshot();
    const directSnapshot = directBus.getSnapshot();
    const evaluator = createAiObservationEvaluator();
    const observedResult = evaluator.evaluate({
        execution: {
            status: 'applied',
            proposalId: `proposal:wp8:${item.id}`,
            commandSequence: [...item.setupCommands],
            policy: { status: 'allowed', decisions: [{ operation: 'rollback.revision', status: 'allowed' }] },
            dryRun: { ok: true, results: aiSetupResults },
            appliedResults: aiSetupResults,
            previousRevision: item.rollbackRevision,
            appliedRevision: revisionOf(aiSnapshot),
            audit: {
                id: `audit:ai:wp8:${item.id}`,
                type: 'proposal-execution',
                proposalId: `proposal:wp8:${item.id}`,
                actor,
                lifecycle: ['policy', 'dry-run', 'apply', 'audit', 'history', 'rollback-token'],
                promptHash: 'sha256:rollback-revision-fixture',
                snapshotRevision: item.rollbackRevision,
                validation: { ok: true, errorCount: 0 },
                policy: { status: 'allowed', decisions: [{ operation: 'rollback.revision', status: 'allowed' }] },
                approval: { status: 'not-required' },
                execution: { status: 'applied', appliedCommandCount: aiSetupResults.filter((result) => result.ok).length },
                observation: { status: 'not-provided' },
                rollback: {
                    reference: null,
                    commandRollbackTokens: aiSetupResults.flatMap((result) => (result.ok && result.rollbackToken ? [result.rollbackToken] : [])),
                },
                commandAudits: aiSetupResults.flatMap((result) => (result.audit ? [result.audit] : [])),
                previousRevision: item.rollbackRevision,
                appliedRevision: revisionOf(aiSnapshot),
                rollbackReference: null,
                createdAt: new Date(0).toISOString(),
            },
            historyEntry: null,
            rollback: {
                reference: null,
                commandRollbackTokens: aiSetupResults.flatMap((result) => (result.ok && result.rollbackToken ? [result.rollbackToken] : [])),
                previousRevision: item.rollbackRevision,
                appliedRevision: revisionOf(aiSnapshot),
            },
        },
        observation: {
            kind: 'rollback-needed',
            proposalId: `proposal:wp8:${item.id}`,
            reasonCode: 'ROLLBACK.REVISION_RESTORED',
        },
    });
    return {
        caseId: item.id,
        status: 'executable',
        commandType: 'rollback.revision',
        semanticContext,
        rollbackRevision: {
            revision: item.rollbackRevision,
            setupCommandSequence: [...item.setupCommands],
            setupResults: redacted(aiSetupResults),
            ai: redacted(aiRollback),
            direct: redacted(directRollback),
            parity: {
                snapshotMatches: stableJson(snapshotForParity(aiSnapshot)) === stableJson(snapshotForParity(directSnapshot)),
                revisionMatches: revisionOf(aiSnapshot) === revisionOf(directSnapshot),
            },
            audit: {
                historyLengthAfterSetup: getHistoryLength(aiBus),
                auditLogLengthAfterSetup: getAuditLength(aiBus),
                rollbackMetadata: {
                    previousRevision: item.rollbackRevision + item.setupCommands.length,
                    targetRevision: item.rollbackRevision,
                    restoredRevision: revisionOf(aiSnapshot),
                },
            },
            observedResult,
        },
        ai: {
            commandSequence: [...item.setupCommands],
            snapshot: redacted(aiSnapshot),
            redactionSummary: semanticContext.redactions,
        },
        runtimeObservation: runtimeObservation(),
    };
};
const commandForRuntimeOverride = (runtimeOverride) => runtimeOverride.action === 'set'
    ? {
        type: 'runtime.override.set',
        nodeId: runtimeOverride.nodeId,
        portId: runtimeOverride.portId,
        kind: runtimeOverride.kind,
        value: runtimeOverride.value,
        ttlMs: runtimeOverride.ttlMs,
    }
    : {
        type: 'runtime.override.clear',
        nodeId: runtimeOverride.nodeId,
        portId: runtimeOverride.portId,
        kind: runtimeOverride.kind,
    };
const runRuntimeOverride = (item, actor, directActor) => {
    const trace = runExecutableCommand({
        id: item.id,
        command: commandForRuntimeOverride(item.runtimeOverride),
        createBus: item.createBus,
    }, actor, directActor);
    return {
        ...trace,
        runtimeOverride: redacted(item.runtimeOverride),
    };
};
export function runAiRemainingCommandSurfaceFixtures(input) {
    const actor = input.actor ?? defaultActor;
    const directActor = input.directActor ?? defaultDirectActor;
    return input.cases.map((item) => {
        if ('runtimeOverride' in item)
            return runRuntimeOverride(item, actor, directActor);
        if ('rollbackRevision' in item)
            return runRollbackRevision(item, actor, directActor);
        return runExecutableCommand(item, actor, directActor);
    });
}
//# sourceMappingURL=remaining-command-surfaces-fixtures.js.map