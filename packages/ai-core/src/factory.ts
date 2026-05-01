import type { AiRuntime } from './types.js';
import { NoopAiRuntime } from './noop-runtime.js';

export type CreateAiRuntimeOptions = {
  backend?: 'noop' | 'local' | 'remote' | 'hybrid';
};

export function createAiRuntime(options?: CreateAiRuntimeOptions): AiRuntime {
  const backend = options?.backend ?? 'noop';

  if (backend === 'noop') {
    return new NoopAiRuntime();
  }

  return new NoopAiRuntime();
}
