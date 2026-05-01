import { NoopAiRuntime } from './noop-runtime.js';
export function createAiRuntime(options) {
    const backend = options?.backend ?? 'noop';
    if (backend === 'noop') {
        return new NoopAiRuntime();
    }
    return new NoopAiRuntime();
}
//# sourceMappingURL=factory.js.map