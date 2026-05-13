/**
 * Purpose: WakeLockController implementation split from action-executors for focused client-side effects.
 */

/**
 * Wake lock to prevent screen from sleeping
 */
export class WakeLockController {
    private wakeLock: WakeLockSentinel | null = null;
    private isSupported: boolean;

    constructor() {
        this.isSupported = 'wakeLock' in navigator;
    }

    /**
     * Check if wake lock is supported
     */
    checkSupport(): boolean {
        return this.isSupported;
    }

    /**
     * Request wake lock
     */
    async request(): Promise<boolean> {
        if (!this.isSupported) {
            console.log('[WakeLock] Not supported on this device');
            return false;
        }

        try {
            if (this.wakeLock) return true; // Already active

            this.wakeLock = await navigator.wakeLock.request('screen');
            console.log('[WakeLock] Acquired');

            // Re-acquire on visibility change
            document.removeEventListener('visibilitychange', this.handleVisibilityChange);
            document.addEventListener('visibilitychange', this.handleVisibilityChange);
            return true;
        } catch (error) {
            console.warn('[WakeLock] Failed to acquire:', error);
            return false;
        }
    }

    /**
     * Release wake lock
     */
    async release(): Promise<void> {
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        if (this.wakeLock) {
            await this.wakeLock.release();
            this.wakeLock = null;
            console.log('[WakeLock] Released');
        }
    }

    private handleVisibilityChange = async (): Promise<void> => {
        if (document.visibilityState === 'visible' && this.isSupported) {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
            } catch {
                // Ignore errors on re-acquire
            }
        }
    };
}
