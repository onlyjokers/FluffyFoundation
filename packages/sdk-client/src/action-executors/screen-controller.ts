/**
 * Purpose: ScreenController implementation split from action-executors for focused client-side effects.
 */
import type { ScreenColorPayload } from '@shugu/protocol';

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
