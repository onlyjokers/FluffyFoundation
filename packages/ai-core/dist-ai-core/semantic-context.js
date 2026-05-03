/**
 * Purpose: Package AI-readable semantic context without Canvas/UI layout noise or sensitive local data.
 */
const UI_NOISE_KEYS = new Set([
    'position',
    'x',
    'y',
    'selected',
    'collapsed',
    'minimized',
    'color',
    'hover',
    'hovered',
    'viewport',
    'viewportZoom',
    'zoom',
    'pan',
    'panel',
    'layout',
]);
const SECRET_KEY_PATTERN = /(secret|token|key|password|credential|auth|managerKey)/i;
const PRIVATE_PATH_PATTERN = /(?:^|["'\s])(?:\/Users\/|\/private\/|\/Volumes\/|[A-Za-z]:\\)/;
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const redactionMetadata = (accumulator) => ({
    count: accumulator.redactions.length,
    redactions: accumulator.redactions,
});
const mark = (accumulator, kind, _path) => {
    accumulator.redactions.push({ kind, path: `[${kind}]` });
};
const isUiNoiseKey = (key) => UI_NOISE_KEYS.has(key);
const redactedScalar = (key, value, path, accumulator) => {
    if (SECRET_KEY_PATTERN.test(key)) {
        mark(accumulator, 'secret', path);
        return '[REDACTED:secret]';
    }
    if (typeof value === 'string' && PRIVATE_PATH_PATTERN.test(value)) {
        mark(accumulator, 'private-path', path);
        return '[REDACTED:private-path]';
    }
    return value;
};
const redact = (value, path, accumulator) => {
    if (Array.isArray(value)) {
        return value.map((item, index) => redact(item, `${path}.${index}`, accumulator));
    }
    if (!isRecord(value)) {
        const key = path.split('.').at(-1) ?? '';
        return redactedScalar(key, value, path, accumulator);
    }
    const output = {};
    for (const [key, raw] of Object.entries(value)) {
        const childPath = path ? `${path}.${key}` : key;
        if (isUiNoiseKey(key)) {
            mark(accumulator, 'ui-noise', childPath);
            continue;
        }
        if (SECRET_KEY_PATTERN.test(key)) {
            output[key] = redactedScalar(key, raw, childPath, accumulator);
            continue;
        }
        if (typeof raw === 'string' && PRIVATE_PATH_PATTERN.test(raw)) {
            output[key] = redactedScalar(key, raw, childPath, accumulator);
            continue;
        }
        output[key] = redact(raw, childPath, accumulator);
    }
    return output;
};
export function redactAiContextValue(value) {
    const accumulator = { redactions: [] };
    return {
        value: redact(value, 'context', accumulator),
        metadata: redactionMetadata(accumulator),
    };
}
const arrayFromSnapshot = (snapshot, key) => Array.isArray(snapshot[key]) ? [...snapshot[key]] : [];
const compactDefinition = (definition) => ({
    type: definition.type,
    label: definition.label,
    category: definition.category,
    aiSummary: definition.aiSummary,
});
const defaultPolicy = {
    mode: 'proposal-only',
    deniedOperations: ['read.secrets', 'mutate.live'],
    approvalRequired: ['node.params.update', 'node.connect', 'node.add'],
};
export function buildAiSemanticContext(input) {
    const redacted = redactAiContextValue(input.snapshot);
    const snapshot = redacted.value;
    const registry = arrayFromSnapshot(snapshot, 'definitions').map(compactDefinition);
    const proposals = arrayFromSnapshot(snapshot, 'proposals');
    return {
        revision: Number.isFinite(snapshot.revision) ? Number(snapshot.revision) : 0,
        actor: { ...input.actor },
        nodes: arrayFromSnapshot(snapshot, 'nodes'),
        connections: arrayFromSnapshot(snapshot, 'connections'),
        groups: arrayFromSnapshot(snapshot, 'groups'),
        partitions: arrayFromSnapshot(snapshot, 'partitions'),
        runtimeStatus: isRecord(snapshot.runtimeStatus) ? snapshot.runtimeStatus : {},
        deviceCapabilities: arrayFromSnapshot(snapshot, 'deviceCapabilities'),
        errors: arrayFromSnapshot(snapshot, 'errors'),
        permissions: arrayFromSnapshot(snapshot, 'permissions'),
        registry,
        proposals,
        policy: {
            ...defaultPolicy,
            ...(input.policy ?? {}),
            deniedOperations: input.policy?.deniedOperations ?? defaultPolicy.deniedOperations,
            approvalRequired: input.policy?.approvalRequired ?? defaultPolicy.approvalRequired,
        },
        validationReports: input.validationReports ?? [],
        dryRunResults: input.dryRunResults ?? [],
        rollbackMetadataRefs: proposals
            .map((proposal) => proposal.rollbackToken ?? proposal.rollbackReference ?? proposal.rollbackRef)
            .filter((value) => typeof value === 'string' && value.length > 0),
        redactions: redacted.metadata,
    };
}
//# sourceMappingURL=semantic-context.js.map