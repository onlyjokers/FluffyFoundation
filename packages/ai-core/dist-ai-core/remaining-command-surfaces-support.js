/**
 * Purpose: Shared helpers for FF-18 WP8 remaining command surface fixtures.
 */
import { redactAiContextValue } from './semantic-context.js';
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const sortedRecord = (value) => {
    if (Array.isArray(value))
        return value.map(sortedRecord);
    if (!isRecord(value))
        return value;
    return Object.fromEntries(Object.keys(value)
        .sort()
        .map((key) => [key, sortedRecord(value[key])]));
};
export const stableJson = (value) => JSON.stringify(sortedRecord(value));
export const snapshotForParity = (snapshot) => ({
    revision: snapshot.revision,
    nodes: snapshot.nodes,
    connections: snapshot.connections,
    groups: snapshot.groups,
    partitions: snapshot.partitions,
    proposals: snapshot.proposals,
});
export const runtimeObservation = () => ({
    kind: 'runtime-observation-deferred',
    deferred: true,
    reasonCode: 'BROWSER_RUNTIME_PROOF_DEFERRED',
});
export const getAuditLength = (bus) => {
    const method = bus.getAuditLog;
    return method ? method().length : null;
};
export const getHistoryLength = (bus) => {
    const method = bus.getHistory;
    return method ? method().length : null;
};
export const revisionOf = (snapshot) => Number.isFinite(snapshot.revision) ? Number(snapshot.revision) : null;
export const createdAt = () => new Date(0).toISOString();
export const effectFor = (command) => {
    if (command.type === 'node.restore') {
        return {
            summary: 'Archived node recovery is routed through node.restore on the semantic command bus.',
            targetNodeId: command.nodeId,
            params: { archived: false },
        };
    }
    if (command.type === 'proposal.approve') {
        return {
            summary: 'Proposal approval is routed through proposal.approve on the semantic command bus.',
            targetNodeId: command.proposalId,
            params: { status: 'accepted' },
        };
    }
    if (command.type === 'runtime.override.set') {
        return {
            summary: 'Runtime override set is routed through the semantic command bus and recorded as runtime status intent.',
            targetNodeId: command.nodeId,
            params: {
                portId: command.portId,
                kind: command.kind ?? 'input',
                value: command.value,
                ...(command.ttlMs === undefined ? {} : { ttlMs: command.ttlMs }),
            },
        };
    }
    if (command.type === 'runtime.override.clear') {
        return {
            summary: 'Runtime override clear is routed through the semantic command bus and removes runtime status intent.',
            targetNodeId: command.nodeId,
            params: { portId: command.portId, kind: command.kind ?? 'input' },
        };
    }
    return {
        summary: `Semantic command bus operation: ${command.type}.`,
        targetNodeId: 'nodeId' in command ? String(command.nodeId) : null,
        params: {},
    };
};
export const riskFor = (command) => command.type === 'proposal.approve'
    ? { level: 'medium', reasons: ['Approving proposals changes human approval state and must preserve audit history.'] }
    : command.type === 'runtime.override.set' || command.type === 'runtime.override.clear'
        ? { level: 'medium', reasons: ['Runtime overrides can affect live deployed behavior and require audit/rollback metadata.'] }
        : { level: 'low', reasons: ['Restoring an archived node changes semantic graph availability through reversible metadata.'] };
export const redacted = (value) => redactAiContextValue(value).value;
//# sourceMappingURL=remaining-command-surfaces-support.js.map