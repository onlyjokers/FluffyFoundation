import type { AiRuntime, AiRuntimeEnableOptions, AiRuntimeState } from './types.js';

function now(): number {
  return Date.now();
}

export class NoopAiRuntime implements AiRuntime {
  private state: AiRuntimeState = { status: 'disabled', error: null, updatedAt: now() };

  getState(): AiRuntimeState {
    return this.state;
  }

  async enable(_options?: AiRuntimeEnableOptions): Promise<void> {
    if (this.state.status === 'enabled') return;
    this.state = { status: 'enabled', error: null, updatedAt: now() };
  }

  async disable(): Promise<void> {
    if (this.state.status === 'disabled') return;
    this.state = { status: 'disabled', error: null, updatedAt: now() };
  }

  async dispose(): Promise<void> {
    await this.disable();
  }
}
