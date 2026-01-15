/**
 * Action executors for client-side functionality
 * Handles flashlight, vibration, screen effects, sound playback
 */

import type {
    FlashlightPayload,
    ScreenColorPayload,
    VibratePayload,
    PlaySoundPayload,
    ModulateSoundPayload,
} from '@shugu/protocol';
import type {
    ToneGainLike,
    ToneLfoLike,
    ToneModule,
    ToneOscillatorLike,
    TonePlayerLike,
} from './tone-adapter/types.js';
import { getToneRawContext, unwrapDefaultExport } from './tone-adapter/tone-guards.js';
import type { LFOOptions, OscillatorType, PlayerOptions } from 'tone';

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };
type TorchConstraintSet = MediaTrackConstraintSet & { torch?: boolean };

/**
 * Flashlight controller using MediaStream torch capability
 */
export class FlashlightController {
    private stream: MediaStream | null = null;
    private track: MediaStreamTrack | null = null;
    private blinkIntervalId: ReturnType<typeof setInterval> | null = null;
    private blinkFrequency = 2;
    private blinkDutyCycle = 0.5;
    private blinkStartMs = 0;
    private blinkState = false;
    private isOn = false;
    private mode: FlashlightPayload['mode'] = 'off';
    private fallbackElement: HTMLElement | null = null;

    /**
     * Check if torch is supported
     */
    async isSupported(): Promise<boolean> {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
            });
            const track = stream.getVideoTracks()[0];
            const capabilities = track.getCapabilities() as TorchCapabilities;
            stream.getTracks().forEach(t => t.stop());
            return 'torch' in capabilities;
        } catch {
            return false;
        }
    }

    /**
     * Initialize the flashlight (request camera access)
     */
    async init(): Promise<boolean> {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' },
            });
            this.track = this.stream.getVideoTracks()[0];
            return true;
        } catch (error) {
            console.warn('[Flashlight] Failed to initialize:', error);
            return false;
        }
    }

    /**
     * Set flashlight mode
     */
    async setMode(payload: FlashlightPayload): Promise<void> {
        const mode = payload.mode ?? 'off';

        if (mode === 'blink') {
            const frequency = this.clamp(payload.frequency ?? this.blinkFrequency, 0.1, 30);
            const dutyCycle = this.clamp(payload.dutyCycle ?? this.blinkDutyCycle, 0.05, 0.95);
            const modeChanged = this.mode !== 'blink';
            this.mode = 'blink';
            this.blinkFrequency = frequency;
            this.blinkDutyCycle = dutyCycle;
            if (modeChanged) {
                this.blinkStartMs = 0;
                this.blinkState = false;
            }
            // Preserve blink phase on parameter updates.
            this.startBlinkLoop();
            return;
        }

        this.mode = mode;
        this.stopBlink();

        switch (mode) {
            case 'off': {
                if (this.isOn) {
                    await this.setTorch(false);
                }
                this.hideFallback();
                break;
            }
            case 'on': {
                if (!this.isOn) {
                    const success = await this.setTorch(true);
                    if (!success) this.showFallback();
                } else {
                    this.hideFallback();
                }
                break;
            }
        }
    }

    /**
     * Clean up resources
     */
    destroy(): void {
        this.stopBlink();
        this.hideFallback();
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
            this.track = null;
        }
    }

    private async setTorch(on: boolean): Promise<boolean> {
        if (!this.track) {
            // Try to initialize
            const success = await this.init();
            if (!success) return false;
        }

        try {
            const advanced: TorchConstraintSet[] = [{ torch: on }];
            await this.track!.applyConstraints({ advanced });
            this.isOn = on;
            return true;
        } catch {
            return false;
        }
    }

    private startBlinkLoop(): void {
        if (this.blinkIntervalId) return;
        this.tickBlink();
        this.blinkIntervalId = setInterval(() => this.tickBlink(), 80);
    }

    private tickBlink(): void {
        if (this.mode !== 'blink') return;
        const frequency = this.clamp(this.blinkFrequency, 0.1, 30);
        const dutyCycle = this.clamp(this.blinkDutyCycle, 0.05, 0.95);
        const period = 1000 / frequency;
        if (!this.blinkStartMs) this.blinkStartMs = Date.now();
        const elapsed = Date.now() - this.blinkStartMs;
        const phase = (elapsed % period) / period;
        const shouldBeOn = phase < dutyCycle;

        if (shouldBeOn === this.blinkState) return;
        this.blinkState = shouldBeOn;
        void this.applyBlinkState(shouldBeOn);
    }

    private async applyBlinkState(shouldBeOn: boolean): Promise<void> {
        const success = await this.setTorch(shouldBeOn);
        if (shouldBeOn) {
            if (!success) this.showFallback();
            else this.hideFallback();
        } else {
            this.hideFallback();
        }
    }

    private stopBlink(): void {
        if (this.blinkIntervalId) {
            clearInterval(this.blinkIntervalId);
            this.blinkIntervalId = null;
        }
        this.blinkStartMs = 0;
        this.blinkState = false;
    }

    private clamp(value: number, min: number, max: number): number {
        if (!Number.isFinite(value)) return min;
        return Math.min(max, Math.max(min, value));
    }

    private showFallback(): void {
        if (!this.fallbackElement) {
            this.fallbackElement = document.createElement('div');
            this.fallbackElement.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: white;
        z-index: 99999;
        pointer-events: none;
      `;
            document.body.appendChild(this.fallbackElement);
        }
        this.fallbackElement.style.display = 'block';
    }

    private hideFallback(): void {
        if (this.fallbackElement) {
            this.fallbackElement.style.display = 'none';
        }
    }
}

/**
 * Screen color and brightness control
 */
export class ScreenController {
    private overlayElement: HTMLElement | null = null;
    private animationFrame: number | null = null;
    private animationStart = 0;
    private lastFrameTime = 0;
    private phase = 0;
    private mode: NonNullable<ScreenColorPayload['mode']> | 'solid' = 'solid';
    private params = {
        color: '#ffffff',
        secondaryColor: '#ffffff',
        opacity: 1,
        minOpacity: 0,
        maxOpacity: 1,
        waveform: 'sine' as NonNullable<ScreenColorPayload['waveform']>,
        frequencyHz: 1,
        blinkFrequency: 2,
        pulseDuration: 1200,
        pulseMin: 0.25,
        cycleColors: [] as string[],
        cycleDuration: 4000,
    };

    /**
     * Set screen color overlay
     */
    setColor(payload: ScreenColorPayload): void {
        this.ensureOverlay();
        const nextMode = payload.mode ?? 'solid';
        const modeChanged = nextMode !== this.mode;
        const now = this.now();
        const prevPhase = this.phase;

        const opacity = this.clamp(payload.opacity ?? 1, 0, 1);
        const maxOpacity = this.clamp(payload.maxOpacity ?? opacity, 0, 1);
        const minOpacity = this.clamp(payload.minOpacity ?? payload.pulseMin ?? 0, 0, maxOpacity);
        const waveform = payload.waveform ?? 'sine';
        const frequencyHz = Number.isFinite(payload.frequencyHz) ? (payload.frequencyHz as number) : 1;
        const blinkFrequency = Number.isFinite(payload.blinkFrequency) ? (payload.blinkFrequency as number) : 2;
        const pulseDuration = Number.isFinite(payload.pulseDuration) ? (payload.pulseDuration as number) : 1200;
        const pulseMin = this.clamp(payload.pulseMin ?? payload.minOpacity ?? 0.25, 0, 1);
        const cycleDuration = Number.isFinite(payload.cycleDuration) ? (payload.cycleDuration as number) : 4000;
        const cycleColors =
            payload.cycleColors && payload.cycleColors.length >= 2
                ? payload.cycleColors
                : [payload.color, payload.color];

        this.mode = nextMode;
        this.params = {
            color: payload.color,
            secondaryColor: payload.secondaryColor ?? payload.color,
            opacity,
            minOpacity,
            maxOpacity,
            waveform,
            frequencyHz,
            blinkFrequency,
            pulseDuration,
            pulseMin,
            cycleColors,
            cycleDuration,
        };

        if (nextMode === 'solid') {
            this.stopAnimation();
            this.applySolid(payload.color, opacity);
            return;
        }

        if (modeChanged) {
            // Preserve phase across mode changes by remapping onto the new period.
            const period = this.getModePeriodMs(nextMode);
            this.animationStart = period > 0 ? now - prevPhase * period : 0;
        }
        this.startAnimationLoop();
    }

    /**
     * Set screen brightness (via overlay)
     */
    setBrightness(brightness: number): void {
        // brightness 0-1, where 0 is darkest (black overlay), 1 is normal
        this.ensureOverlay();
        const darkness = 1 - Math.max(0, Math.min(1, brightness));
        this.overlayElement!.style.backgroundColor = 'black';
        this.overlayElement!.style.opacity = String(darkness);
        this.overlayElement!.style.display = darkness > 0 ? 'block' : 'none';
    }

    /**
     * Clear screen effects
     */
    clear(): void {
        if (this.overlayElement) {
            this.overlayElement.style.display = 'none';
        }
    }

    /**
     * Clean up
     */
    destroy(): void {
        if (this.overlayElement) {
            this.overlayElement.remove();
            this.overlayElement = null;
        }
        this.stopAnimation();
    }

    private ensureOverlay(): void {
        if (!this.overlayElement) {
            this.overlayElement = document.createElement('div');
            this.overlayElement.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 99998;
        pointer-events: none;
        transition: background-color 0.1s, opacity 0.1s;
      `;
            document.body.appendChild(this.overlayElement);
        }
    }

    private applySolid(color: string, opacity: number): void {
        this.overlayElement!.style.backgroundImage = '';
        this.overlayElement!.style.backgroundColor = color;
        this.overlayElement!.style.opacity = String(opacity);
        this.overlayElement!.style.display = 'block';
    }

    private stopAnimation(): void {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        this.animationStart = 0;
    }


    private mixColors(a: string, b: string, t: number): string {
        const ca = this.parseColor(a);
        const cb = this.parseColor(b);
        if (!ca || !cb) return t < 0.5 ? a : b;

        const r = Math.round(ca.r + (cb.r - ca.r) * t);
        const g = Math.round(ca.g + (cb.g - ca.g) * t);
        const bl = Math.round(ca.b + (cb.b - ca.b) * t);
        return `rgb(${r}, ${g}, ${bl})`;
    }

    private parseColor(color: string): { r: number; g: number; b: number } | null {
        // Supports #rgb, #rrggbb, rgb()
        if (color.startsWith('#')) {
            const hex = color.slice(1);
            if (hex.length === 3) {
                const r = parseInt(hex[0] + hex[0], 16);
                const g = parseInt(hex[1] + hex[1], 16);
                const b = parseInt(hex[2] + hex[2], 16);
                return { r, g, b };
            }
            if (hex.length === 6) {
                const r = parseInt(hex.slice(0, 2), 16);
                const g = parseInt(hex.slice(2, 4), 16);
                const b = parseInt(hex.slice(4, 6), 16);
                return { r, g, b };
            }
        }

        const match = color.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
        if (match) {
            return {
                r: parseInt(match[1], 10),
                g: parseInt(match[2], 10),
                b: parseInt(match[3], 10),
            };
        }

        return null;
    }

    private startAnimationLoop(): void {
        if (this.animationFrame) return;
        this.animationFrame = requestAnimationFrame((timestamp) => this.renderFrame(timestamp));
    }

    private renderFrame(timestamp: number): void {
        if (!this.overlayElement) {
            this.animationFrame = null;
            return;
        }

        this.lastFrameTime = timestamp;
        if (!this.animationStart) this.animationStart = timestamp;
        const elapsedMs = timestamp - this.animationStart;

        switch (this.mode) {
            case 'blink': {
                const frequency = Math.max(0.2, this.params.blinkFrequency);
                const period = 1000 / frequency;
                const phase = (elapsedMs % period) / period;
                this.phase = phase;
                if (phase < 0.5) {
                    this.applySolid(this.params.color, this.params.opacity);
                } else {
                    this.overlayElement.style.display = 'none';
                }
                break;
            }
            case 'pulse': {
                const duration = Math.max(300, this.params.pulseDuration);
                const frequencyHz = 1000 / duration;
                const phase = (elapsedMs / 1000) * frequencyHz * Math.PI * 2;
                const factor = this.waveformValue(this.params.waveform, phase);
                this.phase = ((elapsedMs % duration) / duration);
                const minOpacity = this.clamp(this.params.pulseMin, 0, this.params.maxOpacity);
                const opacity = minOpacity + (this.params.maxOpacity - minOpacity) * factor;
                const mixed = this.mixColors(this.params.color, this.params.secondaryColor, factor);
                this.applySolid(mixed, opacity);
                break;
            }
            case 'cycle': {
                const colors =
                    this.params.cycleColors && this.params.cycleColors.length >= 2
                        ? this.params.cycleColors
                        : [this.params.color, this.params.color];
                const duration = Math.max(600, this.params.cycleDuration);
                const segment = duration / colors.length;
                const elapsed = elapsedMs % duration;
                this.phase = elapsed / duration;
                const index = Math.floor(elapsed / segment);
                const nextIndex = (index + 1) % colors.length;
                const localT = (elapsed % segment) / segment;
                const mixed = this.mixColors(colors[index], colors[nextIndex], localT);
                this.applySolid(mixed, this.params.opacity);
                break;
            }
            case 'modulate': {
                const freq = Math.max(0.1, this.params.frequencyHz);
                const phase = (elapsedMs / 1000) * freq * Math.PI * 2;
                const factor = this.waveformValue(this.params.waveform, phase);
                const period = 1000 / freq;
                this.phase = (elapsedMs % period) / period;
                const minOpacity = this.clamp(this.params.minOpacity, 0, this.params.maxOpacity);
                const opacity = minOpacity + (this.params.maxOpacity - minOpacity) * factor;
                const mixed = this.mixColors(this.params.color, this.params.secondaryColor, factor);
                this.applySolid(mixed, opacity);
                break;
            }
            default: {
                this.phase = 0;
                this.applySolid(this.params.color, this.params.opacity);
                break;
            }
        }

        this.animationFrame = requestAnimationFrame((next) => this.renderFrame(next));
    }

    private waveformValue(type: NonNullable<ScreenColorPayload['waveform']>, phase: number): number {
        const norm = (v: number) => (v + 1) / 2; // map -1..1 to 0..1
        switch (type) {
            case 'square':
                return phase % (2 * Math.PI) < Math.PI ? 1 : 0;
            case 'triangle': {
                const t = phase % (2 * Math.PI);
                return t < Math.PI
                    ? t / Math.PI
                    : 1 - (t - Math.PI) / Math.PI;
            }
            case 'sawtooth':
                return (phase % (2 * Math.PI)) / (2 * Math.PI);
            case 'sine':
            default:
                return norm(Math.sin(phase));
        }
    }

    private clamp(v: number, min: number, max: number): number {
        return Math.min(max, Math.max(min, v));
    }

    private getModePeriodMs(mode: NonNullable<ScreenColorPayload['mode']> | 'solid'): number {
        switch (mode) {
            case 'blink': {
                const frequency = Math.max(0.2, this.params.blinkFrequency);
                return 1000 / frequency;
            }
            case 'pulse': {
                return Math.max(300, this.params.pulseDuration);
            }
            case 'cycle': {
                return Math.max(600, this.params.cycleDuration);
            }
            case 'modulate': {
                const freq = Math.max(0.1, this.params.frequencyHz);
                return 1000 / freq;
            }
            default:
                return 0;
        }
    }

    private now(): number {
        if (this.lastFrameTime) return this.lastFrameTime;
        if (typeof performance !== 'undefined' && performance.now) return performance.now();
        return Date.now();
    }
}

/**
 * Vibration controller
 */
export class VibrationController {
    private isSupported: boolean;
    private visualShakeInterval: ReturnType<typeof setInterval> | null = null;
    private visualBaseTransform = '';
    private currentPattern: number[] = [];
    private patternStartMs: number | null = null;
    private totalDurationMs = 0;

    constructor() {
        this.isSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator;
    }

    /**
     * Check if vibration is supported
     */
    checkSupport(): boolean {
        // Evaluate support based on native API, but we'll fallback to visual
        return true; 
    }

    /**
     * Trigger vibration pattern
     */
    vibrate(payload: VibratePayload): void {
        const nextPattern = this.normalizePattern(payload);
        if (nextPattern.length === 0) {
            this.stop();
            return;
        }

        const now = Date.now();
        const nextTotal = this.totalDuration(nextPattern);

        // Preserve phase when updating the pattern mid-play.
        if (this.currentPattern.length > 0 && this.totalDurationMs > 0 && this.patternStartMs) {
            const elapsed = now - this.patternStartMs;
            const phase = (elapsed % this.totalDurationMs) / this.totalDurationMs;
            this.patternStartMs = now - phase * nextTotal;
        } else {
            this.patternStartMs = now;
        }

        const unchanged = this.isSamePattern(this.currentPattern, nextPattern);
        this.currentPattern = nextPattern;
        this.totalDurationMs = nextTotal;

        if (unchanged) return;

        const offsetMs = Math.max(0, now - (this.patternStartMs ?? now));
        const trimmed = this.buildPatternFromOffset(nextPattern, offsetMs);

        if (this.isSupported) {
            try {
                navigator.vibrate(trimmed);
                this.stopVisualVibration();
                return;
            } catch (e) {
                // Some browsers might throw even if 'vibrate' is in navigator
                this.ensureVisualVibration();
            }
        } else {
            console.log('[Vibration] Native vibration not supported, using visual fallback');
            this.ensureVisualVibration();
        }
    }

    /**
     * Stop vibration
     */
    stop(): void {
        if (this.isSupported) {
            try {
                navigator.vibrate(0);
            } catch (e) {
                // ignore
            }
        }
        this.currentPattern = [];
        this.patternStartMs = null;
        this.totalDurationMs = 0;
        this.stopVisualVibration();
    }

    /**
     * Fallback visual vibration (shakes the screen)
     */
    private ensureVisualVibration(): void {
        if (this.visualShakeInterval) return;
        const body = document.body;
        this.visualBaseTransform = body.style.transform;

        this.visualShakeInterval = setInterval(() => {
            if (!this.patternStartMs || this.currentPattern.length === 0 || this.totalDurationMs <= 0) {
                this.stopVisualVibration();
                return;
            }

            const elapsed = Date.now() - this.patternStartMs;
            if (elapsed >= this.totalDurationMs) {
                this.stopVisualVibration();
                return;
            }

            // Find current phase based on elapsed time
            let timeSum = 0;
            let currentPhaseIndex = 0;
            for (let i = 0; i < this.currentPattern.length; i++) {
                if (elapsed < timeSum + this.currentPattern[i]) {
                    currentPhaseIndex = i;
                    break;
                }
                timeSum += this.currentPattern[i];
            }

            // Even index = vibrate, Odd index = pause
            const shouldShake = currentPhaseIndex % 2 === 0;

            if (shouldShake) {
                const intensity = 5; // pixels
                const x = (Math.random() - 0.5) * intensity;
                const y = (Math.random() - 0.5) * intensity;
                body.style.transform = `translate(${x}px, ${y}px)`;
            } else {
                body.style.transform = this.visualBaseTransform;
            }
        }, 16); // ~60fps
    }

    private stopVisualVibration(): void {
        if (this.visualShakeInterval) {
            clearInterval(this.visualShakeInterval);
            this.visualShakeInterval = null;
            document.body.style.transform = this.visualBaseTransform;
        }
    }

    private normalizePattern(payload: VibratePayload): number[] {
        const base = Array.isArray(payload.pattern) ? payload.pattern.map((v) => Math.max(0, v)) : [];
        if (base.length === 0) return [];

        if (payload.repeat && payload.repeat > 1) {
            const originalPattern = [...base];
            for (let i = 1; i < payload.repeat; i++) {
                base.push(...originalPattern);
            }
        }
        return base;
    }

    private totalDuration(pattern: number[]): number {
        return pattern.reduce((sum, value) => sum + value, 0);
    }

    private isSamePattern(a: number[], b: number[]): boolean {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    private buildPatternFromOffset(pattern: number[], offsetMs: number): number[] {
        if (!Number.isFinite(offsetMs) || offsetMs <= 0) return [...pattern];
        let remaining = offsetMs;
        let idx = 0;
        while (idx < pattern.length && remaining > pattern[idx]) {
            remaining -= pattern[idx];
            idx += 1;
        }
        if (idx >= pattern.length) return [...pattern];

        const trimmed = pattern.slice(idx);
        if (remaining > 0 && trimmed.length > 0) {
            trimmed[0] = Math.max(0, trimmed[0] - remaining);
        }

        // If we land in a pause segment, prepend a 0ms vibration so we still start with a pause.
        if (idx % 2 === 1) {
            if (trimmed[0] === 0) trimmed.shift();
            trimmed.unshift(0);
        }

        return trimmed.length === 0 ? [...pattern] : trimmed;
    }
}

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
            if (!this.player || this.lastUrl !== url) return false;

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
        const playerOptions: PlayerOptions = { url, loop: opts.loop, autostart: false };
        const player = new Tone.Player(playerOptions);
        player.connect(gain);

        this.gain = gain;
        this.player = player;

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
        this.player = null;
        this.gain = null;
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
                    (Tone as { Destination?: { input?: { connect?: (dest: unknown) => void } } })
                        .Destination?.input ?? null;
                if (destInput && typeof destInput.connect === 'function') {
                    this.htmlSource.connect(destInput);
                } else {
                    this.htmlSource.connect(raw.destination);
                }
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
        this.htmlSource = null;
        this.htmlAudio = null;
    }

    private clamp(value: number, min: number, max: number): number {
        const n = Number(value);
        if (!Number.isFinite(n)) return min;
        return Math.min(max, Math.max(min, n));
    }
}

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

        this.gain = new Tone.Gain(0).toDestination();
        const oscOptions = { frequency: freq, type: waveform as OscillatorType };
        this.carrier = new Tone.Oscillator(oscOptions);
        this.carrier.connect(this.gain);

        // Envelope on gain (Tone Param supports setValueAtTime/linearRampToValueAtTime).
        const g = this.gain.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(0, now);
        g.linearRampToValueAtTime(volume, now + attack);
        g.setValueAtTime(volume, now + Math.max(attack, duration - release));
        g.linearRampToValueAtTime(0.0001, now + duration);

        if (modDepth > 0) {
            const depthHz = modDepth * freq;
            const lfoOptions: LFOOptions = {
                frequency: modFreq,
                min: Math.max(0, freq - depthHz),
                max: freq + depthHz,
                type: 'sine',
            };
            this.lfo = new Tone.LFO(lfoOptions);
            this.lfo.connect(this.carrier.frequency);
            this.lfo.start(now);
        }

        this.carrier.start(now);

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
        waveform?: OscillatorType;
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
                const lfoOptions: LFOOptions = {
                    frequency: payload.modFrequency ?? 12,
                    min: Math.max(0, currentFreq - depthHz),
                    max: currentFreq + depthHz,
                    type: 'sine',
                };
                this.lfo = new Tone.LFO(lfoOptions);
                this.lfo.connect(this.carrier.frequency);
                this.lfo.start(now);
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
