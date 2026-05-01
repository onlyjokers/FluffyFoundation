import type { AiRuntime } from './types.js';
export type CreateAiRuntimeOptions = {
    backend?: 'noop' | 'local' | 'remote' | 'hybrid';
};
export declare function createAiRuntime(options?: CreateAiRuntimeOptions): AiRuntime;
//# sourceMappingURL=factory.d.ts.map