/**
 * Purpose: Deterministically draft FF-18 WP1 AI proposals and dry-run them through an injected semantic command bus.
 */
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const numberConstraint = (constraints, key, fallback) => {
    const value = constraints?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};
const nodeParams = (snapshot, nodeId) => {
    const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
    const node = nodes.find((item) => isRecord(item) && item.id === nodeId);
    return isRecord(node) && isRecord(node.params) ? node.params : {};
};
const draftCommand = (intent, snapshot) => {
    if (intent.kind === 'raw-command')
        return intent.command ?? null;
    if (!intent.targetNodeId)
        return null;
    if (intent.kind === 'display-breathing') {
        const current = nodeParams(snapshot, intent.targetNodeId);
        return {
            type: 'node.params.update',
            nodeId: intent.targetNodeId,
            params: {
                intensity: numberConstraint(intent.constraints, 'maxIntensity', 0.7),
                breathRate: numberConstraint(intent.constraints, 'breathRate', Number(current.breathRate ?? 0.75)),
            },
        };
    }
    if (intent.kind === 'gyro-flashlight-rhythm') {
        return {
            type: 'node.params.update',
            nodeId: intent.targetNodeId,
            params: {
                rhythmHz: numberConstraint(intent.constraints, 'rhythmHz', 8),
                tension: numberConstraint(intent.constraints, 'tension', 0.75),
            },
        };
    }
    return null;
};
const expectedEffect = (intent, command) => {
    if (!command || command.type !== 'node.params.update') {
        return { summary: 'No supported semantic output change could be drafted.', targetNodeId: null, params: {} };
    }
    if (intent.kind === 'gyro-flashlight-rhythm') {
        return {
            summary: 'Gyro input maps to a bounded tense flashlight rhythm parameter change.',
            targetNodeId: command.nodeId,
            params: command.params,
        };
    }
    return {
        summary: 'Display breathing intensity changes within bounded visual parameters.',
        targetNodeId: command.nodeId,
        params: command.params,
    };
};
const riskForIntent = (intent) => {
    if (intent.kind === 'gyro-flashlight-rhythm') {
        return {
            level: 'high',
            reasons: ['Flashlight behavior may require device capability approval and can affect audience-facing clients.'],
        };
    }
    return {
        level: 'medium',
        reasons: ['Display visual params change show output but stay proposal-only in WP1.'],
    };
};
const proposalFor = (intent, command) => ({
    id: `proposal:${intent.id}`,
    title: intent.kind === 'gyro-flashlight-rhythm'
        ? 'Map gyro input to bounded flashlight rhythm'
        : 'Adjust display breathing parameters',
    commands: command ? [command] : [],
    status: 'draft',
});
const collectValidationErrors = (results) => results.flatMap((result) => result.validationErrors ?? []);
const collectRepairHints = (errors) => {
    const hints = [];
    for (const error of errors) {
        for (const option of error.repairOptions ?? []) {
            if (!hints.includes(option))
                hints.push(option);
        }
    }
    return hints;
};
export function createDeterministicSemanticPlanner(input) {
    return {
        proposeAndDryRun: ({ actor, intent }) => {
            const snapshot = input.bus.getSnapshot();
            const command = draftCommand(intent, snapshot);
            const proposal = proposalFor(intent, command);
            if (!command) {
                return {
                    status: 'unsupported-intent',
                    proposal,
                    commandSequence: [],
                    expectedEffect: expectedEffect(intent, command),
                    risk: { level: 'low', reasons: ['No live command was drafted.'] },
                    rollback: { reference: null, previousRevision: null, appliedRevision: null },
                    policy: { status: 'proposal-only', dryRun: true, allowed: false, reason: 'Unsupported intent.' },
                    validationErrors: [],
                    repairHints: ['Use a constrained WP1 intent kind.'],
                    dryRunResults: [],
                };
            }
            const dryRunResults = proposal.commands.map((item) => input.bus.dispatch({ actor, command: item, dryRun: true }));
            const validationErrors = collectValidationErrors(dryRunResults);
            const failed = dryRunResults.find((result) => !result.ok);
            const first = dryRunResults[0];
            const rollbackRef = failed ? null : first?.rollbackToken ?? first?.audit?.rollbackToken ?? null;
            const policy = failed?.audit?.policy ?? first?.audit?.policy;
            return {
                status: failed ? 'dry-run-failed' : 'dry-run-passed',
                proposal,
                commandSequence: [...proposal.commands],
                expectedEffect: expectedEffect(intent, command),
                risk: riskForIntent(intent),
                rollback: {
                    reference: rollbackRef,
                    previousRevision: first?.previousRevision ?? null,
                    appliedRevision: first?.appliedRevision ?? null,
                },
                policy: {
                    status: 'proposal-only',
                    dryRun: true,
                    allowed: failed ? false : policy?.allowed ?? true,
                    ...(policy?.reason || failed?.message ? { reason: policy?.reason ?? failed?.message } : {}),
                },
                validationErrors,
                repairHints: collectRepairHints(validationErrors),
                dryRunResults,
            };
        },
    };
}
//# sourceMappingURL=deterministic-planner.js.map