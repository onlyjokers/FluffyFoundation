/**
 * Purpose: Deterministic registry definitions for FF-18 golden scenario fixtures.
 */
export const displayDefinition = (type = 'display-breathing') => ({
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
export const flashlightDefinition = () => ({
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
//# sourceMappingURL=golden-scenario-definitions.js.map