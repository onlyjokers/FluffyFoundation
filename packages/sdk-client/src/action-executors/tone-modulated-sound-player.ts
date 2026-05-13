/**
 * Purpose: ToneModulatedSoundPlayer implementation split from action-executors for focused client-side effects.
 */
import type { ModulateSoundPayload } from '@shugu/protocol';
import type { LFOOptions, ToneOscillatorType } from 'tone';
import type { ToneGainLike, ToneLfoLike, ToneModule, ToneOscillatorLike } from '../tone-adapter/types.js';
import { unwrapDefaultExport } from '../tone-adapter/tone-guards.js';

/**
 * Tone.js-backed modulation tone player (unifies with ToneAudioEngine).
 *
 * This replaces ModulatedSoundPlayer's custom AudioContext path to avoid multiple audio systems.
 */
export class ToneModulatedSoundPlayer {
    private carrier: ToneOscillatorLike | null = null;
    private gain: ToneGainLike | null = null;
    private lfo: ToneLfoLike | null = null;
    private stopTimer: ReturnType<typeof setTimeout> | null = null;
    private startAtSeconds: number | null = null;
    private durationSeconds: number | null = null;
    private releaseSeconds = 0.04;

    async play(payload: ModulateSoundPayload, delaySeconds = 0): Promise<void> {
        const { toneAudioEngine } = await import('@shugu/multimedia-core');
        if (!toneAudioEngine.isEnabled()) return;

        const tone = await toneAudioEngine.ensureLoaded();
        const Tone = unwrapDefaultExport(tone) as ToneModule;

        this.stop();

        const now = Tone.now() + Math.max(0, delaySeconds);
        const durationMs = payload.duration ?? 200;
        const duration = Math.max(0.02, durationMs / 1000);

        const attack = Math.max(0, (payload.attack ?? 10) / 1000);
        const release = Math.max(0, (payload.release ?? 40) / 1000);
        const volume = this.clamp(payload.volume ?? 0.7, 0, 1);
        const freq = payload.frequency ?? 180;
        const waveform = payload.waveform ?? 'square';
        const modDepth = this.clamp(payload.modDepth ?? 0, 0, 1);
        const modFreq = payload.modFrequency ?? 12;

        this.startAtSeconds = now;
        this.durationSeconds = duration;
        this.releaseSeconds = release;

        const gain = new Tone.Gain(0).toDestination();
        const oscOptions = { frequency: freq, type: waveform as ToneOscillatorType };
        const carrier = new Tone.Oscillator(freq, oscOptions.type);
        carrier.connect(gain);
        this.gain = gain as unknown as ToneGainLike;
        this.carrier = carrier as unknown as ToneOscillatorLike;

        // Envelope on gain (Tone Param supports setValueAtTime/linearRampToValueAtTime).
        const g = this.gain.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(0, now);
        g.linearRampToValueAtTime(volume, now + attack);
        g.setValueAtTime(volume, now + Math.max(attack, duration - release));
        g.linearRampToValueAtTime(0.0001, now + duration);

        if (modDepth > 0) {
            const depthHz = modDepth * freq;
            const lfoOptions: Partial<LFOOptions> = {
                frequency: modFreq,
                min: Math.max(0, freq - depthHz),
                max: freq + depthHz,
                amplitude: 1,
                units: 'number',
                type: 'sine',
            };
            const lfo = new Tone.LFO(lfoOptions);
            lfo.connect(carrier.frequency);
            lfo.start(now);
            this.lfo = lfo as unknown as ToneLfoLike;
        }

        carrier.start(now);

        const stopAt = now + duration + release * 2;
        const stopDelayMs = Math.max(10, (stopAt - Tone.now()) * 1000);
        if (this.stopTimer) clearTimeout(this.stopTimer);
        this.stopTimer = setTimeout(() => this.stop(), stopDelayMs);
    }

    stop(): void {
        if (this.stopTimer) {
            clearTimeout(this.stopTimer);
            this.stopTimer = null;
        }
        this.startAtSeconds = null;
        this.durationSeconds = null;

        try {
            this.carrier?.stop();
        } catch {
            // ignore
        }
        try {
            this.lfo?.stop();
        } catch {
            // ignore
        }
        try {
            this.carrier?.dispose?.();
        } catch {
            // ignore
        }
        try {
            this.lfo?.dispose?.();
        } catch {
            // ignore
        }
        try {
            this.gain?.dispose?.();
        } catch {
            // ignore
        }
        this.carrier = null;
        this.lfo = null;
        this.gain = null;
    }

    /**
     * Update parameters of an active tone without restarting playback.
     * If nothing is playing, fall back to play().
     */
    async update(payload: {
        frequency?: number;
        volume?: number;
        waveform?: ModulateSoundPayload['waveform'];
        modFrequency?: number;
        modDepth?: number;
        durationMs?: number;
    }): Promise<void> {
        // Treat `durationMs <= 0` as an explicit stop signal (used by Synth(Update).Active=false).
        if (payload.durationMs !== undefined && Number(payload.durationMs) <= 0) {
            this.stop();
            return;
        }

        const { toneAudioEngine } = await import('@shugu/multimedia-core');
        if (!toneAudioEngine.isEnabled()) return;
        const tone = await toneAudioEngine.ensureLoaded();
        const Tone = unwrapDefaultExport(tone) as ToneModule;

        if (!this.carrier || !this.gain) {
            const nextPayload: ModulateSoundPayload = {
                frequency: payload.frequency,
                volume: payload.volume,
                duration: payload.durationMs ?? 200,
                waveform: payload.waveform ?? 'square',
                modFrequency: payload.modFrequency,
                modDepth: payload.modDepth,
            };
            await this.play(nextPayload);
            return;
        }

        const now = Tone.now();

        if (payload.frequency !== undefined) {
            try {
                this.carrier.frequency.setValueAtTime(payload.frequency, now);
            } catch {
                // ignore
            }
        }
        if (payload.waveform) {
            this.carrier.type = payload.waveform;
        }
        if (payload.volume !== undefined) {
            try {
                this.gain.gain.setValueAtTime(this.clamp(payload.volume, 0, 1), now);
            } catch {
                // ignore
            }
        }

        // Update LFO
        if (payload.modDepth !== undefined || payload.modFrequency !== undefined || payload.frequency !== undefined) {
            const currentFreq = payload.frequency !== undefined ? payload.frequency : Number(this.carrier.frequency.value ?? 0);
            const modDepth = payload.modDepth !== undefined ? this.clamp(payload.modDepth, 0, 1) : null;

            if (!this.lfo && modDepth !== null && modDepth > 0) {
                const depthHz = modDepth * currentFreq;
                const lfoOptions: Partial<LFOOptions> = {
                    frequency: payload.modFrequency ?? 12,
                    min: Math.max(0, currentFreq - depthHz),
                    max: currentFreq + depthHz,
                    amplitude: 1,
                    units: 'number',
                    type: 'sine',
                };
                const lfo = new Tone.LFO(lfoOptions);
                lfo.connect(this.carrier.frequency as unknown as never);
                lfo.start(now);
                this.lfo = lfo as unknown as ToneLfoLike;
            }

            if (this.lfo) {
                if (payload.modFrequency !== undefined) {
                    try {
                        this.lfo.frequency.setValueAtTime(payload.modFrequency, now);
                    } catch {
                        // ignore
                    }
                }
                if (modDepth !== null) {
                    if (modDepth <= 0) {
                        try {
                            this.lfo.stop();
                        } catch {
                            // ignore
                        }
                        try {
                            this.lfo.dispose?.();
                        } catch {
                            // ignore
                        }
                        this.lfo = null;
                    } else {
                        const depthHz = modDepth * currentFreq;
                        this.lfo.min = Math.max(0, currentFreq - depthHz);
                        this.lfo.max = currentFreq + depthHz;
                    }
                }
            }
        }

        // Reschedule stop if duration provided
        if (payload.durationMs !== undefined) {
            if (this.stopTimer) clearTimeout(this.stopTimer);
            const durationSec = Math.max(0.02, payload.durationMs / 1000);
            const startAt = this.startAtSeconds ?? now;
            this.durationSeconds = durationSec;
            const stopAt = startAt + durationSec + this.releaseSeconds * 2;
            const stopDelayMs = Math.max(10, (stopAt - now) * 1000);
            this.stopTimer = setTimeout(() => this.stop(), stopDelayMs);
        }
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.min(max, Math.max(min, value));
    }
}
