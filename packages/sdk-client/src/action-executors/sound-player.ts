/**
 * Purpose: SoundPlayer implementation split from action-executors for focused client-side effects.
 */
import type { PlaySoundPayload } from '@shugu/protocol';

/**
 * Sound player using Web Audio API
 */
export class SoundPlayer {
    private currentUrl: string | null = null;
    private htmlAudio: HTMLAudioElement | null = null;

    /**
     * Initialize legacy sound player.
     *
     * Deprecated: this implementation no longer creates its own AudioContext to keep the
     * system single-engine (ToneAudioEngine). It is retained as a lightweight HTMLAudio fallback.
     */
    async init(): Promise<void> {
        return;
    }

    /**
     * Resume audio context if suspended
     */
    async resume(): Promise<void> {
        return;
    }

    /**
     * Play sound from URL
     */
    async play(payload: PlaySoundPayload, delaySeconds = 0): Promise<void> {
        this.stop();

        try {
            this.htmlAudio = new Audio(payload.url);
            this.htmlAudio.loop = payload.loop ?? false;
            this.htmlAudio.volume = payload.volume ?? 1;

            const start = () => this.htmlAudio?.play().catch(console.warn);
            if (delaySeconds > 0) {
                setTimeout(start, delaySeconds * 1000);
            } else {
                start();
            }
            this.currentUrl = payload.url;
        } catch (error) {
            console.error('[SoundPlayer] HTMLAudio failed:', error);
        }
    }

    /**
     * Update current playback without restarting (volume/loop).
     */
    update(payload: PlaySoundPayload): boolean {
        if (!payload?.url || payload.url !== this.currentUrl) return false;

        if (this.htmlAudio) {
            if (typeof payload.loop === 'boolean') this.htmlAudio.loop = payload.loop;
            if (typeof payload.volume === 'number') {
                this.htmlAudio.volume = Math.max(0, Math.min(1, payload.volume));
            }
            return true;
        }

        return false;
    }

    /**
     * Stop current playback
     */
    stop(): void {
        this.currentUrl = null;

        if (this.htmlAudio) {
            try {
                this.htmlAudio.pause();
                this.htmlAudio.currentTime = 0;
            } catch {
                // ignore
            }
            this.htmlAudio = null;
        }
    }

    /**
     * Set volume
     */
    setVolume(volume: number): void {
        if (!this.htmlAudio) return;
        this.htmlAudio.volume = Math.max(0, Math.min(1, volume));
    }

    /**
     * Get audio context for plugins
     */
    getAudioContext(): AudioContext | null {
        return null;
    }

    /**
     * Destroy and clean up
     */
    async destroy(): Promise<void> {
        this.stop();
        return;
    }
}
