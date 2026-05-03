/**
 * Purpose: Build deterministic FF-18 golden scenario contract traces from existing AI semantic/runtime cores.
 */
import { buildAiSemanticContext, } from './semantic-context.js';
import { createDeterministicSemanticPlanner, } from './deterministic-planner.js';
import { createAiProposalExecutionCore, } from './proposal-execution.js';
import { createAiObservationEvaluator, createAiRepairPlanner, } from './observation-repair.js';
const actor = { id: 'ai:ff18-wp4', role: 'ai' };
const createdAt = () => new Date(0).toISOString();
const displayDefinition = (type = 'display-breathing') => ({
    type,
    label: 'Display Breathing',
    category: 'Effects',
    aiSummary: {
        type,
        label: 'Display Breathing',
        category: 'Effects',
        description: 'Controls a bounded display breathing visual.',
        platforms: ['display'],
        sideEffects: 'remote-control',
        permissions: ['control:send'],
        ports: { inputs: [], outputs: [] },
        params: [
            { key: 'intensity', type: 'number', default: 0.35, min: 0, max: 1, step: 0.05, unit: 'ratio' },
            { key: 'breathRate', type: 'number', default: 0.8, min: 0.1, max: 2, step: 0.1, unit: 'hz' },
        ],
        risks: ['Audience-facing visual output may change.'],
        repairHints: ['Clamp display intensity to 0..1 before retrying.'],
    },
});
const flashlightDefinition = () => ({
    type: 'flashlight-rhythm',
    label: 'Flashlight Rhythm',
    category: 'Effects',
    aiSummary: {
        type: 'flashlight-rhythm',
        label: 'Flashlight Rhythm',
        category: 'Effects',
        description: 'Maps gyro motion into a tense flashlight pulse.',
        platforms: ['mobile'],
        sideEffects: 'device-output',
        permissions: ['device.flashlight'],
        ports: { inputs: [{ id: 'rotation', type: 'gyro.rotation' }], outputs: [] },
        params: [
            { key: 'rhythmHz', type: 'number', default: 6, min: 0.5, max: 12, step: 0.5, unit: 'hz' },
            { key: 'tension', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, unit: 'ratio' },
        ],
        risks: ['Flashlight behavior requires capability approval and can affect audience-facing clients.'],
        repairHints: ['Keep rhythmHz within the safe fixture range.'],
    },
});
const baseSnapshot = (input) => ({
    revision: input.revision,
    nodes: input.nodes,
    connections: [],
    groups: [
        {
            id: `group:${input.runtimeTarget}`,
            parentId: null,
            name: `${input.runtimeTarget} group`,
            nodeIds: input.nodes.map((node) => node.id),
            disabled: false,
            owner: { actorId: 'manager:fixture', role: 'manager', capabilities: ['group.mutate'] },
            surface: 'public',
            visibility: { defaultAccess: 'visible-readonly' },
            collapsed: true,
        },
    ],
    partitions: [
        {
            id: `partition:${input.runtimeTarget}`,
            nodeIds: input.nodes.map((node) => node.id),
            targetPlatform: input.runtimeTarget,
            status: 'deployed',
            boundRevision: input.revision,
        },
    ],
    runtimeStatus: { running: true, deployedPartitionIds: [`partition:${input.runtimeTarget}`] },
    deviceCapabilities: input.deviceCapabilities,
    errors: [],
    permissions: [{ actorId: actor.id, operations: ['node.params.update'] }],
    definitions: input.definitions,
    proposals: [
        {
            id: 'proposal:previous',
            title: 'Previous redacted fixture proposal',
            commands: [],
            localPath: '/Users/ziqi/Desktop/FluffyFoundation/secrets/fixture.json',
        },
    ],
});
const cloneSnapshot = (snapshot) => ({
    revision: snapshot.revision,
    nodes: snapshot.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        params: { ...node.params },
        inputValues: { ...node.inputValues },
        outputValues: { ...node.outputValues },
    })),
    connections: [...snapshot.connections],
    groups: snapshot.groups.map((group) => ({ ...group })),
    partitions: snapshot.partitions.map((partition) => ({ ...partition })),
    runtimeStatus: {
        ...snapshot.runtimeStatus,
        deployedPartitionIds: Array.isArray(snapshot.runtimeStatus.deployedPartitionIds)
            ? [...snapshot.runtimeStatus.deployedPartitionIds]
            : [],
    },
    deviceCapabilities: snapshot.deviceCapabilities.map((capability) => ({ ...capability })),
    errors: snapshot.errors.map((error) => ({ ...error })),
    permissions: snapshot.permissions.map((permission) => ({ ...permission })),
    definitions: snapshot.definitions.map((definition) => ({
        ...definition,
        aiSummary: { ...definition.aiSummary },
    })),
    proposals: snapshot.proposals.map((proposal) => ({ ...proposal })),
});
const isNodeParamUpdate = (command) => command.type === 'node.params.update';
const numberBounds = (snapshot, nodeId, key) => {
    const node = snapshot.nodes.find((item) => item.id === nodeId);
    const definition = snapshot.definitions.find((item) => item.type === node?.type);
    const params = Array.isArray(definition?.aiSummary.params) ? definition.aiSummary.params : [];
    const param = params.find((item) => Boolean(item) && typeof item === 'object' && !Array.isArray(item) && item.key === key);
    return {
        ...(typeof param?.min === 'number' ? { min: param.min } : {}),
        ...(typeof param?.max === 'number' ? { max: param.max } : {}),
    };
};
const validateCommand = (snapshot, command) => {
    if (!isNodeParamUpdate(command))
        return [];
    const node = snapshot.nodes.find((item) => item.id === command.nodeId);
    if (!node) {
        return [
            {
                code: 'GRAPH.MISSING_NODE',
                path: `nodes.${command.nodeId}`,
                severity: 'error',
                message: `Node not found: ${command.nodeId}`,
                repairOptions: ['Refresh the semantic snapshot and choose an existing node id.'],
            },
        ];
    }
    return Object.entries(command.params).flatMap(([key, value]) => {
        if (typeof value !== 'number' || !Number.isFinite(value))
            return [];
        const bounds = numberBounds(snapshot, command.nodeId, key);
        if (typeof bounds.max === 'number' && value > bounds.max) {
            return [
                {
                    code: 'GRAPH.PARAM_OUT_OF_RANGE',
                    path: `nodes.${command.nodeId}.params.${key}`,
                    severity: 'error',
                    message: `Param ${key} is above maximum ${bounds.max}.`,
                    machineReason: `${value} violates max ${bounds.max}.`,
                    repairOptions: [`Use a value less than or equal to ${bounds.max}.`],
                },
            ];
        }
        if (typeof bounds.min === 'number' && value < bounds.min) {
            return [
                {
                    code: 'GRAPH.PARAM_OUT_OF_RANGE',
                    path: `nodes.${command.nodeId}.params.${key}`,
                    severity: 'error',
                    message: `Param ${key} is below minimum ${bounds.min}.`,
                    machineReason: `${value} violates min ${bounds.min}.`,
                    repairOptions: [`Use a value greater than or equal to ${bounds.min}.`],
                },
            ];
        }
        return [];
    });
};
const applyCommand = (snapshot, command) => {
    if (!isNodeParamUpdate(command))
        return snapshot;
    return {
        ...snapshot,
        revision: snapshot.revision + 1,
        nodes: snapshot.nodes.map((node) => node.id === command.nodeId
            ? {
                ...node,
                params: { ...node.params, ...command.params },
                outputValues: { ...node.outputValues, ...command.params },
            }
            : node),
    };
};
const createFixtureBus = (initialSnapshot) => {
    let snapshot = cloneSnapshot(initialSnapshot);
    const rollbackSnapshots = new Map();
    let auditIndex = 0;
    return {
        getSnapshot: () => cloneSnapshot(snapshot),
        dispatch: ({ command, dryRun = false }) => {
            const previousRevision = snapshot.revision;
            const rollbackToken = `rollback:${previousRevision}:${auditIndex + 1}`;
            const validationErrors = validateCommand(snapshot, command);
            if (validationErrors.length > 0) {
                return {
                    ok: false,
                    command,
                    dryRun,
                    previousRevision,
                    appliedRevision: previousRevision,
                    validationErrors,
                    message: validationErrors[0].message,
                };
            }
            const nextSnapshot = applyCommand(snapshot, command);
            const audit = {
                rollbackToken,
                policy: { allowed: true },
                lifecycle: ['dry-run', 'policy', 'apply', 'audit', 'history', 'rollback-token'],
            };
            auditIndex += 1;
            if (!dryRun) {
                rollbackSnapshots.set(rollbackToken, cloneSnapshot(snapshot));
                snapshot = nextSnapshot;
            }
            return {
                ok: true,
                command,
                dryRun,
                previousRevision,
                appliedRevision: dryRun ? previousRevision : snapshot.revision,
                rollbackToken,
                audit,
            };
        },
        rollback: (rollbackToken) => {
            const previous = rollbackSnapshots.get(String(rollbackToken));
            if (!previous)
                return { ok: false, message: 'Rollback token not found.', snapshot: cloneSnapshot(snapshot) };
            snapshot = { ...cloneSnapshot(previous), revision: snapshot.revision + 1 };
            return {
                ok: true,
                recovery: { status: 'redeployed', stoppedPartitionIds: [], redeployedPartitionIds: [] },
                snapshot: cloneSnapshot(snapshot),
            };
        },
    };
};
const executionCore = (bus) => createAiProposalExecutionCore({
    bus,
    policy: {
        allowedOperations: ['node.params.update'],
        approvalRequiredOperations: [],
        deniedOperations: [],
    },
});
const runProposal = (bus, intent) => {
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
        policy: { status: 'allowed', decisions: proposal.commands.map((command) => ({ operation: command.type, status: 'allowed' })) },
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
const traceFor = (input) => {
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
const gs12 = () => {
    const bus = createFixtureBus(baseSnapshot({
        revision: 30,
        runtimeTarget: 'mobile',
        definitions: [flashlightDefinition()],
        nodes: [
            {
                id: 'flashlight:rhythm',
                type: 'flashlight-rhythm',
                params: {
                    rhythmHz: 4,
                    tension: 0.4,
                    managerKey: 'shugu_secret_12',
                },
                inputValues: { rotationVelocity: 0.91, localPath: '/Users/ziqi/gyro.json' },
                outputValues: { rhythmHz: 4, tension: 0.4 },
            },
        ],
        deviceCapabilities: [
            { deviceId: 'phone:gs12', capabilities: ['gyro.rotation', 'device.flashlight'], status: 'online' },
        ],
    }));
    const result = runProposal(bus, {
        id: 'gs12-gyro-flashlight',
        kind: 'gyro-flashlight-rhythm',
        targetNodeId: 'flashlight:rhythm',
        constraints: { rhythmHz: 9, tension: 0.86 },
    });
    return traceFor({
        scenarioId: 'GS-12',
        title: 'Gyro rotation drives tense flashlight rhythm',
        ...result,
        observation: {
            kind: 'output-change',
            proposalId: result.execution.proposalId,
            observed: true,
            changedTargets: ['flashlight:rhythm'],
            measuredAtRevision: result.execution.appliedRevision ?? undefined,
        },
    });
};
const gs13 = () => {
    const bus = createFixtureBus(baseSnapshot({
        revision: 40,
        runtimeTarget: 'display',
        definitions: [displayDefinition()],
        nodes: [
            {
                id: 'display:breath',
                type: 'display-breathing',
                params: {
                    intensity: 0.32,
                    breathRate: 0.9,
                    managerKey: 'shugu_secret_13',
                },
                inputValues: {},
                outputValues: { intensity: 0.32, breathRate: 0.9 },
            },
        ],
        deviceCapabilities: [{ deviceId: 'display:gs13', capabilities: ['display.render'], status: 'online' }],
    }));
    const result = runProposal(bus, {
        id: 'gs13-display-breathing',
        kind: 'display-breathing',
        targetNodeId: 'display:breath',
        constraints: { maxIntensity: 0.68, breathRate: 0.42 },
    });
    return traceFor({
        scenarioId: 'GS-13',
        title: 'Display visual becomes breathing-like',
        ...result,
        observation: {
            kind: 'output-change',
            proposalId: result.execution.proposalId,
            observed: true,
            changedTargets: ['display:breath'],
            measuredAtRevision: result.execution.appliedRevision ?? undefined,
        },
    });
};
const gs14 = () => {
    const bus = createFixtureBus(baseSnapshot({
        revision: 50,
        runtimeTarget: 'display',
        definitions: [displayDefinition()],
        nodes: [
            {
                id: 'display:overflow',
                type: 'display-breathing',
                params: {
                    intensity: 0.4,
                    breathRate: 1,
                    managerKey: 'shugu_secret_14',
                },
                inputValues: {},
                outputValues: { intensity: 0.4 },
            },
        ],
        deviceCapabilities: [{ deviceId: 'display:gs14', capabilities: ['display.render'], status: 'online' }],
    }));
    const result = runProposal(bus, {
        id: 'gs14-param-overflow',
        kind: 'display-breathing',
        targetNodeId: 'display:overflow',
        constraints: { maxIntensity: 1.8, breathRate: 0.5 },
    });
    return traceFor({
        scenarioId: 'GS-14',
        title: 'AI repairs structured param overflow validation error',
        ...result,
        observation: {
            kind: 'validation-error',
            proposalId: result.execution.proposalId,
            validationErrors: result.dryRun.validationErrors,
            consoleText: 'ignored noisy console text with /Users/ziqi/private/token.txt',
        },
    });
};
export function runFf18GoldenScenarioFixtures() {
    return [gs12(), gs13(), gs14()];
}
//# sourceMappingURL=golden-scenario-fixtures.js.map