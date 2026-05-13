/**
 * Purpose: VibrationController implementation split from action-executors for focused client-side effects.
 */
import type { VibratePayload } from '@shugu/protocol';

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
