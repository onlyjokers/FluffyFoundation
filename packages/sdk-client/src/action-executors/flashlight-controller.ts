/**
 * Purpose: FlashlightController implementation split from action-executors for focused client-side effects.
 */
import type { FlashlightPayload } from '@shugu/protocol';

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
