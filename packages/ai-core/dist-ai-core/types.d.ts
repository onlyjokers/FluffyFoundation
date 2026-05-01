export type AiRuntimeStatus = 'disabled' | 'enabling' | 'enabled' | 'error';
export type AiRuntimeState = {
    status: AiRuntimeStatus;
    error: string | null;
    updatedAt: number;
};
export type AiRuntimeEnableOptions = {
    modelRef?: string;
    backend?: 'local' | 'remote' | 'hybrid';
};
export type AiRuntimeInferInput = {
    vector: number[];
};
export type AiRuntimeInferOutput = {
    vector: number[];
};
export interface AiRuntime {
    getState(): AiRuntimeState;
    enable(options?: AiRuntimeEnableOptions): Promise<void>;
    disable(): Promise<void>;
    dispose(): Promise<void>;
    infer?(input: AiRuntimeInferInput): Promise<AiRuntimeInferOutput>;
}
//# sourceMappingURL=types.d.ts.map