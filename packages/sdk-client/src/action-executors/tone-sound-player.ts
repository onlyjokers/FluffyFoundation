/**
 * Purpose: ToneSoundPlayer implementation split from action-executors for focused client-side effects.
 */
import type { PlaySoundPayload } from '@shugu/protocol';
import { clearPlaybackAudioTapSource, setPlaybackAudioTapSource } from '@shugu/multimedia-core';
import type { PlayerOptions } from 'tone';
import type { ToneGainLike, ToneModule, TonePlayerLike } from '../tone-adapter/types.js';
import { getToneRawContext, unwrapDefaultExport } from '../tone-adapter/tone-guards.js';

/**
 * ToneSoundPlayer (Tone.Player based)
 *
 * Purpose: Replace the legacy SoundPlayer WebAudio/HTMLAudio hybrid with a Tone.js-backed player
 * that shares the single ToneAudioEngine context.
 *
 * Fallback: If Tone isn't enabled, will fall back to HTMLAudio + MediaElementSource (best-effort).
 */
export class ToneSoundPlayer {
    private tone: ToneModule | null = null;
    private player: TonePlayerLike | null = null;
    private gain: ToneGainLike | null = null;

    private htmlAudio: HTMLAudioElement | null = null;
    private htmlSource: MediaElementAudioSourceNode | null = null;

    private lastUrl: string | null = null;
    private lastLoop: boolean | null = null;
    private lastVolume: number | null = null;
    private lastFadeInMs: number | null = null;

    async play(payload: PlaySoundPayload, delaySeconds = 0): Promise<void> {
        const url = typeof payload.url === 'string' ? payload.url : '';
        if (!url) return;

        const volume = this.clamp(Number(payload.volume ?? 1), 0, 1);
        const loop = Boolean(payload.loop ?? false);
        const fadeInMs = Number(payload.fadeIn ?? 0);
        const fadeIn = Number.isFinite(fadeInMs) && fadeInMs > 0 ? fadeInMs : 0;

        this.lastUrl = url;
        this.lastLoop = loop;
        this.lastVolume = volume;
        this.lastFadeInMs = fadeIn;

        const { toneAudioEngine } = await import('@shugu/multimedia-core');
        if (toneAudioEngine.isEnabled()) {
            await this.ensureTone();
            this.stopHtmlFallback();
            await this.playTone(url, { volume, loop, fadeInMs: fadeIn }, delaySeconds);
            return;
        }

        // Fallback path (Tone not enabled): HTMLAudio (best-effort) + MediaElementSource.
        this.stopTone();
        await this.playHtml(url, { volume, loop }, delaySeconds);
    }

    /**
     * Update parameters without restarting when possible.
     * Returns true if updated in-place, false if caller should do a fresh play().
     */
    async update(
        payload: Partial<PlaySoundPayload> & { url?: string; fadeIn?: number },
        delaySeconds = 0
    ): Promise<boolean> {
        void delaySeconds;
        const url = typeof payload.url === 'string' ? payload.url : this.lastUrl ?? '';
        if (!url) return false;

        const nextVolume = payload.volume !== undefined ? this.clamp(Number(payload.volume), 0, 1) : this.lastVolume ?? 1;
        const nextLoop = payload.loop !== undefined ? Boolean(payload.loop) : this.lastLoop ?? false;
        const fadeInMs = payload.fadeIn !== undefined ? Number(payload.fadeIn) : this.lastFadeInMs ?? 0;
        const nextFadeIn = Number.isFinite(fadeInMs) && fadeInMs > 0 ? fadeInMs : 0;

        const { toneAudioEngine } = await import('@shugu/multimedia-core');
        if (toneAudioEngine.isEnabled()) {
            await this.ensureTone();
            if (!this.tone || !this.player || !this.gain || this.lastUrl !== url) return false;

            this.lastVolume = nextVolume;
            this.lastLoop = nextLoop;
            this.lastFadeInMs = nextFadeIn;

            try {
                this.player.loop = nextLoop;
            } catch {
                // ignore
            }
            try {
                const now = this.tone.now();
                this.gain.gain.setValueAtTime(nextVolume, now);
            } catch {
                // ignore
            }
            return true;
        }

        // HTMLAudio update
        if (!this.htmlAudio || this.lastUrl !== url) return false;
        this.lastVolume = nextVolume;
        this.lastLoop = nextLoop;
        try {
            this.htmlAudio.volume = nextVolume;
            this.htmlAudio.loop = nextLoop;
        } catch {
            // ignore
        }
        return true;
    }

    stop(): void {
        this.stopTone();
        this.stopHtmlFallback();
        this.lastUrl = null;
    }

    private async ensureTone(): Promise<void> {
        if (this.tone) return;
        const { toneAudioEngine } = await import('@shugu/multimedia-core');
        const mod = await toneAudioEngine.ensureLoaded();
        this.tone = unwrapDefaultExport(mod) as ToneModule;
    }

    private async playTone(
        url: string,
        opts: { volume: number; loop: boolean; fadeInMs: number },
        delaySeconds: number
    ): Promise<void> {
        this.stopTone();

        const Tone = this.tone;
        if (!Tone) return;
        const gain = new Tone.Gain(0).toDestination();
        const playerOptions: Partial<PlayerOptions> = { url, loop: opts.loop, autostart: false };
        const player = new Tone.Player(playerOptions);
        player.connect(gain);

        this.gain = gain as unknown as ToneGainLike;
        this.player = player as unknown as TonePlayerLike;
        setPlaybackAudioTapSource(gain as unknown as AudioNode, getToneRawContext(Tone));

        const startAt = Tone.now() + Math.max(0, delaySeconds);
        const g = gain.gain;
        g.cancelScheduledValues(startAt);
        g.setValueAtTime(0, startAt);
        if (opts.fadeInMs > 0) {
            g.linearRampToValueAtTime(opts.volume, startAt + opts.fadeInMs / 1000);
        } else {
            g.setValueAtTime(opts.volume, startAt);
        }

        try {
            player.start(startAt);
        } catch {
            // ignore
        }
    }

    private stopTone(): void {
        try {
            this.player?.stop();
        } catch {
            // ignore
        }
        try {
            this.player?.dispose?.();
        } catch {
            // ignore
        }
        try {
            this.gain?.dispose?.();
        } catch {
            // ignore
        }
        const source = this.gain as unknown as AudioNode | null;
        this.player = null;
        this.gain = null;
        clearPlaybackAudioTapSource(source);
    }

    private async playHtml(url: string, opts: { volume: number; loop: boolean }, delaySeconds: number): Promise<void> {
        this.stopHtmlFallback();

        const audio = new Audio(url);
        audio.loop = opts.loop;
        audio.volume = opts.volume;
        audio.preload = 'auto';
        this.htmlAudio = audio;

        // Best-effort: route through the shared AudioContext so it "lives" in the same output path.
        try {
            const { toneAudioEngine } = await import('@shugu/multimedia-core');
            const mod = await toneAudioEngine.ensureLoaded();
            const Tone = unwrapDefaultExport(mod) as ToneModule;
            const raw: AudioContext | null = getToneRawContext(Tone);
            if (raw && raw.createMediaElementSource) {
                this.htmlSource = raw.createMediaElementSource(audio);
                // Try to connect into Tone destination graph when possible.
                const destInput =
                    (Tone as unknown as { Destination?: { input?: unknown } })
                        .Destination?.input ?? null;
                if (destInput instanceof AudioNode) {
                    this.htmlSource.connect(destInput);
                } else {
                    this.htmlSource.connect(raw.destination);
                }
                setPlaybackAudioTapSource(this.htmlSource, raw);
            }
        } catch {
            // ignore
        }

        const start = async () => {
            try {
                await audio.play();
            } catch {
                // ignore
            }
        };
        if (delaySeconds > 0) {
            setTimeout(() => void start(), Math.floor(delaySeconds * 1000));
        } else {
            void start();
        }
    }

    private stopHtmlFallback(): void {
        try {
            this.htmlAudio?.pause();
        } catch {
            // ignore
        }
        try {
            if (this.htmlAudio) this.htmlAudio.currentTime = 0;
        } catch {
            // ignore
        }
        try {
            this.htmlSource?.disconnect();
        } catch {
            // ignore
        }
        const source = this.htmlSource;
        this.htmlSource = null;
        this.htmlAudio = null;
        clearPlaybackAudioTapSource(source);
    }

    private clamp(value: number, min: number, max: number): number {
        const n = Number(value);
        if (!Number.isFinite(n)) return min;
        return Math.min(max, Math.max(min, n));
    }
}
