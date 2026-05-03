/**
 * Purpose: Evaluate structured FF-18 AI runtime observations and draft deterministic in-memory repair plans.
 */
import { redactAiContextValue } from './semantic-context.js';
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const rollbackRecommendation = (rollback, reasonCode) => ({
    type: 'rollback',
    rollbackReference: rollback.reference,
    previousRevision: rollback.previousRevision,
    appliedRevision: rollback.appliedRevision,
    reasonCode,
});
const validationErrorsFromExecution = (execution) => [
    ...execution.dryRun.results.flatMap((result) => result.validationErrors ?? []),
    ...execution.appliedResults.flatMap((result) => result.validationErrors ?? []),
];
const outputChangeObserved = (report) => report.observed && report.changedTargets.length > 0;
const sanitized = (value) => redactAiContextValue(value).value;
const sanitizedErrors = (errors) => sanitized(errors);
export function createAiObservationEvaluator() {
    return {
        evaluate: ({ execution, observation }) => {
            const evidence = sanitized(observation);
            const rollbackFor = (reasonCode) => execution.rollback.reference ? rollbackRecommendation(execution.rollback, reasonCode) : null;
            if (observation.kind === 'output-change') {
                return {
                    classification: outputChangeObserved(observation) && execution.status === 'applied' ? 'success' : 'failed',
                    proposalId: observation.proposalId,
                    repairable: false,
                    rollbackRecommended: !outputChangeObserved(observation),
                    structuredErrors: [],
                    structuredEvidence: [evidence],
                    recommendation: outputChangeObserved(observation) ? null : rollbackFor('OUTPUT.NO_VISIBLE_CHANGE'),
                };
            }
            if (observation.kind === 'validation-error') {
                const errors = sanitizedErrors(observation.validationErrors);
                return {
                    classification: 'validation-failure',
                    proposalId: observation.proposalId,
                    repairable: errors.length > 0,
                    rollbackRecommended: false,
                    structuredErrors: errors,
                    structuredEvidence: [{ kind: 'validation-error', proposalId: observation.proposalId, validationErrors: errors }],
                    recommendation: null,
                };
            }
            if (observation.kind === 'device-capability-gap') {
                return {
                    classification: 'device-capability-gap',
                    proposalId: observation.proposalId,
                    repairable: false,
                    rollbackRecommended: Boolean(execution.rollback.reference),
                    structuredErrors: [],
                    structuredEvidence: [evidence],
                    recommendation: rollbackFor('DEVICE.CAPABILITY_GAP'),
                };
            }
            if (observation.kind === 'no-output-change') {
                return {
                    classification: 'no-output-change',
                    proposalId: observation.proposalId,
                    repairable: false,
                    rollbackRecommended: Boolean(execution.rollback.reference),
                    structuredErrors: [],
                    structuredEvidence: [evidence],
                    recommendation: rollbackFor(observation.reasonCode ?? 'OUTPUT.NO_VISIBLE_CHANGE'),
                };
            }
            if (observation.kind === 'rollback-needed') {
                const errors = sanitizedErrors(observation.validationErrors ?? validationErrorsFromExecution(execution));
                return {
                    classification: 'rollback-needed',
                    proposalId: observation.proposalId,
                    repairable: false,
                    rollbackRecommended: Boolean(execution.rollback.reference),
                    structuredErrors: errors,
                    structuredEvidence: [evidence],
                    recommendation: rollbackFor(observation.reasonCode),
                };
            }
            return {
                classification: 'policy-denied',
                proposalId: observation.proposalId,
                repairable: false,
                rollbackRecommended: false,
                structuredErrors: [],
                structuredEvidence: [evidence],
                recommendation: null,
            };
        },
    };
}
const unique = (values) => {
    const out = [];
    for (const value of values) {
        if (!value || out.includes(value))
            continue;
        out.push(value);
    }
    return out;
};
const registrySummaries = (context) => context.registry.flatMap((entry) => {
    const summary = entry.aiSummary;
    return isRecord(summary) ? [summary] : [entry];
});
const nodeType = (context, nodeId) => {
    const node = (context.nodes ?? []).find((item) => item.id === nodeId);
    return isRecord(node) && typeof node.type === 'string' ? node.type : null;
};
const paramBounds = (context, nodeId, key) => {
    const type = nodeType(context, nodeId);
    const summaries = registrySummaries(context);
    const summary = summaries.find((item) => !type || item.type === type);
    const params = Array.isArray(summary?.params) ? summary.params : [];
    const param = params.find((item) => isRecord(item) && item.key === key);
    if (!isRecord(param))
        return {};
    return {
        ...(typeof param.min === 'number' ? { min: param.min } : {}),
        ...(typeof param.max === 'number' ? { max: param.max } : {}),
    };
};
const repairHints = (context, errors) => unique([
    ...errors.flatMap((error) => error.repairOptions ?? []),
    ...registrySummaries(context).flatMap((summary) => Array.isArray(summary.repairHints) ? summary.repairHints.filter((hint) => typeof hint === 'string') : []),
]);
const commandForNodeParam = (proposal, nodeId, key) => {
    const command = proposal.commands.find((item) => item.type === 'node.params.update' && item.nodeId === nodeId && key in item.params);
    return command ?? null;
};
const repairParamOverflow = (proposal, context, error) => {
    const match = /^nodes\.([^.]*)\.params\.([^.]*)$/.exec(error.path);
    if (!match)
        return null;
    const [, nodeId, key] = match;
    const source = commandForNodeParam(proposal, nodeId, key);
    if (!source)
        return null;
    const value = source.params[key];
    if (typeof value !== 'number' || !Number.isFinite(value))
        return null;
    const bounds = paramBounds(context, nodeId, key);
    const next = typeof bounds.max === 'number' && value > bounds.max
        ? bounds.max
        : typeof bounds.min === 'number' && value < bounds.min
            ? bounds.min
            : null;
    if (next === null)
        return null;
    return { type: 'node.params.update', nodeId, params: { [key]: next } };
};
const repairIncompatibleConnection = (proposal, error) => {
    const match = /^connections\.([^.]*)$/.exec(error.path);
    if (!match)
        return null;
    const [, connectionId] = match;
    const source = proposal.commands.find((item) => item.type === 'node.connect' && item.connection.id === connectionId);
    return source ? { type: 'node.disconnect', connectionId } : null;
};
const proposalPlan = (original, commands, errors, hints) => ({
    type: 'proposal',
    proposal: {
        id: `${original.id}:repair`,
        title: `Repair ${original.title}`,
        commands,
        status: 'draft',
    },
    sourceErrorCodes: unique(errors.map((error) => error.code)),
    repairHints: hints,
});
export function createAiRepairPlanner() {
    return {
        plan: ({ proposal, evaluation, context }) => {
            if (evaluation.recommendation)
                return evaluation.recommendation;
            const errors = evaluation.structuredErrors;
            if (!evaluation.repairable || errors.length === 0) {
                return {
                    type: 'unavailable',
                    reasonCode: evaluation.classification.toUpperCase().replaceAll('-', '.'),
                    sourceErrorCodes: unique(errors.map((error) => error.code)),
                };
            }
            const commands = [];
            for (const error of errors) {
                const repair = error.code === 'GRAPH.PARAM_OUT_OF_RANGE'
                    ? repairParamOverflow(proposal, context, error)
                    : error.code === 'GRAPH.PORT_INCOMPATIBLE'
                        ? repairIncompatibleConnection(proposal, error)
                        : null;
                if (repair)
                    commands.push(repair);
            }
            if (commands.length === 0) {
                return {
                    type: 'unavailable',
                    reasonCode: 'REPAIR.UNSUPPORTED_STRUCTURED_ERROR',
                    sourceErrorCodes: unique(errors.map((error) => error.code)),
                };
            }
            return proposalPlan(proposal, commands, errors, repairHints(context, errors));
        },
    };
}
//# sourceMappingURL=observation-repair.js.map