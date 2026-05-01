import type { AiRuntime, AiRuntimeEnableOptions, AiRuntimeState } from './types.js';
export declare class NoopAiRuntime implements AiRuntime {
    private state;
    getState(): AiRuntimeState;
    enable(_options?: AiRuntimeEnableOptions): Promise<void>;
    disable(): Promise<void>;
    dispose(): Promise<void>;
}
//# sourceMappingURL=noop-runtime.d.ts.map