/**
 * Purpose: Build deterministic FF-18 WP7 parity traces for Group internals and execution partitions.
 */
import { runAiSemanticCommandBusParityFixture, } from './semantic-command-bus-parity.js';
const effectFor = (command) => {
    if (command.type.startsWith('group.')) {
        const target = command.type === 'group.create'
            ? command.group.id
            : 'groupId' in command
                ? command.groupId
                : null;
        return {
            summary: `Group internal mutation is routed through the semantic command bus contract: ${command.type}.`,
            targetNodeId: target,
            params: command.type === 'group.update' ? command.patch : {},
        };
    }
    if (command.type.startsWith('partition.')) {
        return {
            summary: `Execution partition operation is routed through the semantic command bus contract: ${command.type}.`,
            targetNodeId: 'partitionId' in command ? command.partitionId : null,
            params: command.type === 'partition.deploy'
                ? { nodeIds: command.nodeIds, targetPlatform: command.targetPlatform ?? 'manager' }
                : {},
        };
    }
    return {
        summary: `Semantic command bus operation: ${command.type}.`,
        targetNodeId: null,
        params: {},
    };
};
const riskFor = (command) => command.type.startsWith('partition.')
    ? {
        level: 'high',
        reasons: ['Partition operations can affect deployed execution state; live browser/runtime proof is deferred.'],
    }
    : {
        level: 'medium',
        reasons: ['Group internal changes affect operator organization and surfaces through semantic metadata.'],
    };
const runtimeObservation = () => ({
    kind: 'runtime-observation-deferred',
    deferred: true,
    reasonCode: 'BROWSER_RUNTIME_PROOF_DEFERRED',
});
export function runAiGroupPartitionParityFixtures(input) {
    return input.cases.map((item) => {
        const [trace] = runAiSemanticCommandBusParityFixture({
            actor: input.actor,
            directActor: input.directActor,
            cases: [
                {
                    id: item.id,
                    command: item.command,
                    createBus: item.createBus,
                },
            ],
            policyForCase: item.approvalRequired
                ? () => ({
                    allowedOperations: [],
                    approvalRequiredOperations: [item.command.type],
                    deniedOperations: [],
                })
                : undefined,
        });
        return {
            ...trace,
            approvalRequired: Boolean(item.approvalRequired),
            expectedEffect: effectFor(item.command),
            risk: riskFor(item.command),
            runtimeObservation: runtimeObservation(),
        };
    });
}
//# sourceMappingURL=group-partition-parity-fixtures.js.map