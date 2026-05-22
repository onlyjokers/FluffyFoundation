/**
 * Mel Spectrogram Scene
 * Renders a continuously scrolling mel spectrogram (heatmap) from live audio.
 */

import type { VisualScene, VisualContext } from './types.js';
import {
    backgroundWithOpacity,
    clampOpacity,
    normalizeVisualAudioSource,
    selectVisualAudioFeatures,
    type VisualAudioSource,
} from './audio-source.js';

export interface MelSceneOptions {
    /** Pixels shifted to the left each frame */
    scrollPixels?: number;
    /** Target render frame rate (Hz) */
    frameRate?: number;
    /** Log-power floor for normalization */
    minDb?: number;
    /** Log-power ceiling for normalization */
    maxDb?: number;
    /** Background fill color */
    backgroundColor?: string;
    /** Exponential smoothing factor for mel bands (0-1, higher = smoother) */
    smoothing?: number;
    /** Fill the scene background instead of rendering transparent. */
    showBackground?: number | boolean;
    /** Audio source used for the spectrogram. */
    audioSource?: VisualAudioSource;
}

type NormalizedMelSceneOptions = Omit<Required<MelSceneOptions>, 'showBackground'> & {
    showBackground: number;
};

export class MelSpectrogramScene implements VisualScene {
    readonly id = 'mel-scene';

    private container: HTMLElement | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private width = 0;
    private height = 0;
    private options: NormalizedMelSceneOptions;
    private smoothedBands: number[] = [];
    private accumulator = 0;
    private palette: [number, number, number][];
    private resizeObserver: ResizeObserver | null = null;
    private columnImage: ImageData | null = null;

    constructor(options: MelSceneOptions = {}) {
        this.options = {
            scrollPixels: options.scrollPixels ?? 2,
            frameRate: options.frameRate ?? 30,
            minDb: options.minDb ?? -8,
            maxDb: options.maxDb ?? 0,
            backgroundColor: options.backgroundColor ?? '#05060b',
            smoothing: options.smoothing ?? 0.65,
            showBackground: clampOpacity(options.showBackground, 0),
            audioSource: normalizeVisualAudioSource(options.audioSource),
        };

        this.palette = this.buildPalette();
    }

    configure(options: MelSceneOptions = {}): void {
        const { showBackground, audioSource, ...rest } = options;
        this.options = {
            ...this.options,
            ...rest,
            showBackground: showBackground !== undefined
                ? clampOpacity(showBackground, this.options.showBackground)
                : this.options.showBackground,
            audioSource: normalizeVisualAudioSource(audioSource, this.options.audioSource),
        };
        if (this.canvas) {
            this.canvas.style.background = backgroundWithOpacity(this.options.backgroundColor, this.options.showBackground);
        }
    }

    mount(container: HTMLElement): void {
        this.container = container;

        this.canvas = document.createElement('canvas');
        this.canvas.dataset.shuguSceneId = this.id;
        this.canvas.classList.add('shugu-scene-canvas');
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.display = 'block';
        this.canvas.style.background = backgroundWithOpacity(this.options.backgroundColor, this.options.showBackground);

        const ctx = this.canvas.getContext('2d', { alpha: true });
        if (!ctx) return;
        this.ctx = ctx;

        this.setSize(container.clientWidth, container.clientHeight);
        // Don't fill background - let it be transparent to show scenes below

        container.appendChild(this.canvas);

        // Keep canvas in sync with container size
        this.resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                this.setSize(Math.floor(width), Math.floor(height));
                // Clear canvas on resize but don't fill with opaque background
                this.clearCanvas();
            }
        });
        this.resizeObserver.observe(container);
    }

    unmount(): void {
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;

        if (this.container && this.canvas) {
            this.container.removeChild(this.canvas);
        }

        this.canvas = null;
        this.ctx = null;
        this.container = null;
        this.smoothedBands = [];
        this.accumulator = 0;
        this.columnImage = null;
    }

    update(dt: number, context: VisualContext): void {
        if (!this.ctx || !this.canvas) return;

        this.accumulator += dt;
        const minInterval = 1 / this.options.frameRate;
        if (this.accumulator < minInterval) return;
        this.accumulator = 0;

        const audioFeatures = selectVisualAudioFeatures(context, this.options.audioSource);
        const melBands = audioFeatures?.melBands;
        if (!melBands || melBands.length === 0) {
            this.fadeCanvas();
            return;
        }

        if (this.smoothedBands.length !== melBands.length) {
            this.smoothedBands = new Array(melBands.length).fill(melBands[0]);
        }

        // Smooth mel bands to reduce flicker
        const s = this.options.smoothing;
        for (let i = 0; i < melBands.length; i++) {
            this.smoothedBands[i] = this.smoothedBands[i] * s + melBands[i] * (1 - s);
        }

        // Scroll existing image to the right (so new data paints on the left, flowing left → right)
        const scroll = Math.min(this.width, Math.max(1, Math.floor(this.options.scrollPixels)));
        if (scroll < this.width) {
            this.ctx.drawImage(
                this.canvas,
                0,
                0,
                this.width - scroll,
                this.height,
                scroll,
                0,
                this.width - scroll,
                this.height
            );
        }

        // Clear the new strip on the left (transparent, not filled with background)
        this.ctx.clearRect(0, 0, scroll, this.height);

        // Draw new column(s)
        for (let px = 0; px < scroll; px++) {
            const x = px;
            this.drawColumn(x, this.smoothedBands);
        }
    }

    resize(width: number, height: number): void {
        this.setSize(width, height);
        this.fillBackground();
    }

    private setSize(width: number, height: number): void {
        if (!this.canvas) return;
        const nextW = Math.max(1, Math.floor(width));
        const nextH = Math.max(1, Math.floor(height));
        const changed = nextW !== this.width || nextH !== this.height;
        this.width = nextW;
        this.height = nextH;
        if (this.canvas.width !== this.width) this.canvas.width = this.width;
        if (this.canvas.height !== this.height) this.canvas.height = this.height;
        if (changed && this.ctx) {
            this.columnImage = this.ctx.createImageData(1, this.height);
        }
    }

    private fillBackground(): void {
        // Deprecated: kept for backward compatibility but now just clears
        this.clearCanvas();
    }

    private clearCanvas(): void {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    private fadeCanvas(): void {
        // For transparent canvas, we can't use semi-transparent fill
        // Instead, just clear a small portion or do nothing
        // This will be handled by the scroll mechanism
    }

    private drawColumn(x: number, melBands: number[]): void {
        if (!this.ctx) return;

        const h = this.height;
        const bandCount = melBands.length;
        if (!this.columnImage || this.columnImage.height !== h) {
            this.columnImage = this.ctx.createImageData(1, h);
        }
        const data = this.columnImage.data;

        for (let y = 0; y < h; y++) {
            // Map pixel to mel band (low freq at bottom)
            const t = 1 - y / h;
            const bandIndex = Math.min(bandCount - 1, Math.max(0, Math.floor(t * bandCount)));
            const value = melBands[bandIndex];

            const normalized = this.normalize(value);
            const [r, g, b] = this.sampleColor(normalized);

            const offset = y * 4;
            data[offset] = r;
            data[offset + 1] = g;
            data[offset + 2] = b;
            data[offset + 3] = 255;
        }

        this.ctx.putImageData(this.columnImage, x, 0);
    }

    private normalize(value: number): number {
        const { minDb, maxDb } = this.options;
        const clamped = Math.min(maxDb, Math.max(minDb, value));
        return (clamped - minDb) / (maxDb - minDb);
    }

    private sampleColor(t: number): [number, number, number] {
        // t is [0,1]
        const scaled = t * (this.palette.length - 1);
        const idx = Math.floor(scaled);
        const frac = scaled - idx;
        const c0 = this.palette[idx];
        const c1 = this.palette[Math.min(idx + 1, this.palette.length - 1)];

        return [
            Math.round(c0[0] + (c1[0] - c0[0]) * frac),
            Math.round(c0[1] + (c1[1] - c0[1]) * frac),
            Math.round(c0[2] + (c1[2] - c0[2]) * frac),
        ];
    }

    private buildPalette(): [number, number, number][] {
        // Simple magma-like gradient (dark purple -> orange -> yellow)
        return [
            [8, 5, 30],
            [36, 9, 66],
            [84, 4, 125],
            [129, 39, 128],
            [175, 80, 105],
            [214, 120, 66],
            [245, 171, 39],
            [252, 213, 75],
            [252, 235, 140],
        ];
    }
}
