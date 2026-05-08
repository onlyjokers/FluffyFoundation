/**
 * Purpose: Execute approved FF-18/FF-19 AI semantic proposals through an injected command bus with local policy, audit, and rollback metadata.
 */
import { hashAiPrompt } from './prompt-hash.js';
const lifecycle = [
    'policy',
    'dry-run',
    'apply',
    'audit',
    'history',
    'rollback-token',
];
const createdAt = () => new Date(0).toISOString();
const operationFor = (command) => command.type;
const revisionOf = (snapshot) => Number.isFinite(snapshot.revision) ? Number(snapshot.revision) : 0;
const evaluatePolicy = (proposal, policy, approval) => {
    const denied = new Set(policy.deniedOperations);
    const approvalRequired = new Set(policy.approvalRequiredOperations);
    const allowed = new Set(policy.allowedOperations);
    const decisions = proposal.commands.map((command) => {
        const operation = operationFor(command);
        if (denied.has(operation)) {
            return { operation, status: 'denied', reason: `Operation ${operation} is denied by local AI policy.` };
        }
        if (approvalRequired.has(operation) && !approval) {
            return {
                operation,
                status: 'approval-required',
                reason: `Operation ${operation} requires proposal approval.`,
            };
        }
        if (allowed.has(operation) || approvalRequired.has(operation))
            return { operation, status: 'allowed' };
        return {
            operation,
            status: 'approval-required',
            reason: `Operation ${operation} is outside the local auto-execute allowlist.`,
        };
    });
    if (decisions.some((decision) => decision.status === 'denied'))
        return { status: 'denied', decisions, approval };
    if (decisions.some((decision) => decision.status === 'approval-required')) {
        return { status: 'approval-required', decisions, approval };
    }
    return { status: 'allowed', decisions, approval };
};
const approvalAuditFor = (policy, approval) => {
    const requiresApproval = policy.decisions.some((decision) => decision.status === 'approval-required');
    if (approval) {
        return { status: 'approved', approvedBy: approval.approvedBy, approvedAt: approval.approvedAt };
    }
    if (requiresApproval)
        return { status: 'missing' };
    return { status: 'not-required' };
};
const observationAuditFor = (observation) => observation
    ? { status: 'observed', ...(observation.summary ? { summary: observation.summary } : {}) }
    : { status: 'not-provided' };
const dryRunCommands = (bus, actor, commands) => {
    const results = [];
    for (const command of commands) {
        const result = bus.dispatch({ actor, command, dryRun: true });
        results.push(result);
        if (!result.ok)
            break;
    }
    return { ok: results.every((result) => result.ok), results };
};
const applyCommands = (bus, actor, commands) => {
    const results = [];
    for (const command of commands) {
        const result = bus.dispatch({ actor, command, dryRun: false });
        results.push(result);
        if (!result.ok)
            break;
    }
    return results;
};
const rollbackReferenceFor = (proposalId, firstToken) => `ai-rollback:${proposalId}:${firstToken}`;
export function createAiProposalExecutionCore(input) {
    const history = [];
    const auditLog = [];
    const rollbackTokens = new Map();
    const executeProposal = ({ actor, proposal, approval, prompt, observation, }) => {
        const previousRevision = revisionOf(input.bus.getSnapshot());
        const policy = evaluatePolicy(proposal, input.policy, approval);
        const blockedStatus = policy.status === 'denied' ? 'policy-denied' : 'approval-required';
        const shouldStopBeforeDryRun = policy.status === 'denied';
        const shouldStopBeforeApply = policy.status !== 'allowed';
        const dryRun = shouldStopBeforeDryRun ? { ok: false, results: [] } : dryRunCommands(input.bus, actor, proposal.commands);
        const appliedResults = !shouldStopBeforeApply && dryRun.ok ? applyCommands(input.bus, actor, proposal.commands) : [];
        const failedApply = appliedResults.some((result) => !result.ok);
        const appliedRevision = appliedResults.length > 0 && !failedApply ? revisionOf(input.bus.getSnapshot()) : null;
        const firstRollbackToken = appliedResults.find((result) => result.ok)?.rollbackToken;
        const rollbackReference = firstRollbackToken ? rollbackReferenceFor(proposal.id, firstRollbackToken) : null;
        if (firstRollbackToken && rollbackReference)
            rollbackTokens.set(rollbackReference, firstRollbackToken);
        const commandAudits = appliedResults.flatMap((result) => (result.audit ? [result.audit] : []));
        const status = shouldStopBeforeDryRun
            ? blockedStatus
            : shouldStopBeforeApply
                ? blockedStatus
                : !dryRun.ok
                    ? 'dry-run-failed'
                    : failedApply
                        ? 'apply-failed'
                        : 'applied';
        const validationErrors = dryRun.results.flatMap((result) => result.validationErrors ?? []);
        const commandRollbackTokens = appliedResults.flatMap((result) => result.ok && result.rollbackToken ? [result.rollbackToken] : []);
        const audit = {
            id: `audit:ai:${proposal.id}:${auditLog.length + 1}`,
            type: 'proposal-execution',
            proposalId: proposal.id,
            actor: { ...actor },
            lifecycle: [...lifecycle],
            promptHash: hashAiPrompt(prompt),
            snapshotRevision: previousRevision,
            validation: { ok: dryRun.ok, errorCount: validationErrors.length },
            policy,
            approval: approvalAuditFor(policy, approval),
            execution: { status, appliedCommandCount: appliedResults.filter((result) => result.ok).length },
            observation: observationAuditFor(observation),
            rollback: { reference: rollbackReference, commandRollbackTokens },
            commandAudits,
            previousRevision,
            appliedRevision,
            rollbackReference,
            createdAt: createdAt(),
        };
        auditLog.push(audit);
        let historyEntry = null;
        if (!shouldStopBeforeApply && dryRun.ok && !failedApply && appliedRevision !== null && rollbackReference) {
            historyEntry = {
                id: `history:ai:${proposal.id}:${history.length + 1}`,
                proposalId: proposal.id,
                actor: { ...actor },
                status: 'applied',
                commandCount: proposal.commands.length,
                previousRevision,
                appliedRevision,
                rollbackReference,
                createdAt: createdAt(),
            };
            history.push(historyEntry);
        }
        return {
            status,
            proposalId: proposal.id,
            commandSequence: [...proposal.commands],
            policy,
            dryRun,
            appliedResults,
            previousRevision,
            appliedRevision,
            audit,
            historyEntry,
            rollback: {
                reference: rollbackReference,
                commandRollbackTokens,
                previousRevision,
                appliedRevision,
            },
        };
    };
    const rollback = (rollbackReference) => {
        const reference = String(rollbackReference ?? '');
        const rollbackToken = rollbackTokens.get(reference);
        if (!rollbackToken)
            return { ok: false, reference, restoredRevision: revisionOf(input.bus.getSnapshot()), message: 'Rollback reference not found.' };
        const result = input.bus.rollback(rollbackToken);
        const restoredRevision = revisionOf(result.snapshot);
        auditLog.push({
            id: `audit:ai:rollback:${auditLog.length + 1}`,
            type: 'rollback',
            rollbackReference: reference,
            ok: result.ok,
            restoredRevision,
            ...(result.message ? { message: result.message } : {}),
            createdAt: createdAt(),
        });
        return {
            ok: result.ok,
            reference,
            restoredRevision,
            ...(result.message ? { message: result.message } : {}),
            ...(result.recovery ? { recovery: result.recovery } : {}),
        };
    };
    return {
        executeProposal,
        rollback,
        getHistory: () => [...history],
        getAuditLog: () => [...auditLog],
    };
}
//# sourceMappingURL=proposal-execution.js.map