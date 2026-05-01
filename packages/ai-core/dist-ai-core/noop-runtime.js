function now() {
    return Date.now();
}
export class NoopAiRuntime {
    state = { status: 'disabled', error: null, updatedAt: now() };
    getState() {
        return this.state;
    }
    async enable(_options) {
        if (this.state.status === 'enabled')
            return;
        this.state = { status: 'enabled', error: null, updatedAt: now() };
    }
    async disable() {
        if (this.state.status === 'disabled')
            return;
        this.state = { status: 'disabled', error: null, updatedAt: now() };
    }
    async dispose() {
        await this.disable();
    }
}
//# sourceMappingURL=noop-runtime.js.map