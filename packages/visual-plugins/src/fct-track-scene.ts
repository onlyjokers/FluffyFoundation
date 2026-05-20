/**
 * Purpose: ShuGu visual scene wrapper for the migrated FCT WebGL track renderer.
 */
import { definePlugin } from '@shugu/plugin-core';
import {
  FCT_TRACK_PALETTES,
  FCT_TRACK_VARIANTS,
  PROTOCOL_VERSION,
  type FctTrackPalette,
  type FctTrackSceneLayerItem,
  type FctTrackVariant,
} from '@shugu/protocol';

import {
  createMirroredStageRenderer,
  SHATTERED_REALITY_FRAGMENT_SHADER,
  type MirroredStageRenderer,
  type StageAudioFeatures,
  type StageItem,
  type ThemeName,
} from './fct-stage-renderer.js';
import {
  clampOpacity,
  normalizeVisualAudioSource,
  selectVisualAudioFeatures,
} from './audio-source.js';
import type { VisualContext, VisualScene } from './types.js';

export { FCT_TRACK_PALETTES, FCT_TRACK_VARIANTS, SHATTERED_REALITY_FRAGMENT_SHADER };
export type { StageItem, ThemeName };

export type FctTrackSceneOptions = Partial<Omit<FctTrackSceneLayerItem, 'type'>>;
type FctAudioFeaturesInput = NonNullable<VisualContext['audioFeatures']>;

export const FCT_VISIBLE_THEME_STYLES = {
  red: {
    background: '#fff',
    overlayColor: '#de000d',
    overlayBlendMode: 'screen',
    overlayOpacity: '1',
  },
  dark: {
    background: '#fff',
    overlayColor: '#de000d',
    overlayBlendMode: 'screen',
    overlayOpacity: '0',
  },
  light: {
    background: '#000',
    overlayColor: '#de000d',
    overlayBlendMode: 'screen',
    overlayOpacity: '0',
  },
  'red-white-invert': {
    background: '#f00',
    overlayColor: '#fff',
    overlayBlendMode: 'normal',
    overlayOpacity: '0',
  },
  'red-black': {
    background: '#000',
    overlayColor: '#de000d',
    overlayBlendMode: 'screen',
    overlayOpacity: '0',
  },
  'red-black-invert': {
    background: '#de000d',
    overlayColor: '#de000d',
    overlayBlendMode: 'screen',
    overlayOpacity: '0',
  },
} satisfies Record<FctTrackPalette, {
  background: string;
  overlayColor: string;
  overlayBlendMode: string;
  overlayOpacity: string;
}>;

const clampRange = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

const isFctVariant = (value: unknown): value is FctTrackVariant =>
  typeof value === 'string' && FCT_TRACK_VARIANTS.includes(value as FctTrackVariant);

const isFctPalette = (value: unknown): value is FctTrackPalette =>
  typeof value === 'string' && FCT_TRACK_PALETTES.includes(value as FctTrackPalette);

const normalizeOptions = (options: FctTrackSceneOptions = {}): Required<FctTrackSceneOptions> => ({
  variant: isFctVariant(options.variant) ? options.variant : 'shattered-reality',
  palette: isFctPalette(options.palette) ? options.palette : 'red-black',
  sensitivity: clampRange(options.sensitivity, 1, 0, 2),
  brightness: clampRange(options.brightness, 1, 0, 2),
  contrast: clampRange(options.contrast, 1, 0, 2),
  blend: options.blend === 'over' ? 'over' : 'replace',
  audioSource: normalizeVisualAudioSource(options.audioSource),
  showBackground: clampOpacity(options.showBackground, 0),
});

const clamp01 = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
};

const normalizeMelBandForFft = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  // FCT's FFT texture expects byte-analyser style 0..1 values. ShuGu mel bands
  // are log-power values, using the same default -8..0 normalization as MelScene.
  return Math.max(0, Math.min(1, (n + 8) / 8));
};

export function selectFctAudioFeatures(
  context: VisualContext,
  source: Required<FctTrackSceneOptions>['audioSource']
): FctAudioFeaturesInput | undefined {
  return selectVisualAudioFeatures(context, source) as FctAudioFeaturesInput | undefined;
}

export function buildStageAudioFeaturesForFct(
  features: FctAudioFeaturesInput | undefined,
  sensitivity: number
): StageAudioFeatures {
  const source = features ?? {};
  const bands = Array.isArray(source.melBands) ? source.melBands : [];
  const normalizedBands = bands.map(normalizeMelBandForFft);
  const bandEnergy = (from: number, to: number): number => {
    if (!normalizedBands.length) return 0;
    const start = Math.max(0, Math.floor(normalizedBands.length * from));
    const end = Math.max(start + 1, Math.floor(normalizedBands.length * to));
    let total = 0;
    for (let i = start; i < Math.min(normalizedBands.length, end); i += 1) {
      total += normalizedBands[i] ?? 0;
    }
    return total / Math.max(1, end - start);
  };

  return {
    low: clamp01(source.lowEnergy ?? bandEnergy(0, 0.28)),
    mid: clamp01(source.midEnergy ?? bandEnergy(0.28, 0.68)),
    high: clamp01(source.highEnergy ?? bandEnergy(0.68, 1)),
    fft: normalizedBands,
    sensitivity,
  };
}

export class FctTrackScene implements VisualScene {
  readonly id = 'fct-track-scene';

  private container: HTMLElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private renderer: MirroredStageRenderer | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private config: Required<FctTrackSceneOptions>;
  private mounted = false;

  constructor(options: FctTrackSceneOptions = {}) {
    this.config = normalizeOptions(options);
  }

  configure(options: FctTrackSceneOptions = {}): void {
    this.config = normalizeOptions({ ...this.config, ...options });
    this.applyRendererConfig();
  }

  getConfig(): Required<FctTrackSceneOptions> {
    return { ...this.config };
  }

  mount(container: HTMLElement): void {
    this.container = container;
    this.canvas = this.createCanvasElement();
    this.canvas.dataset.shuguSceneId = this.id;
    this.canvas.classList.add('shugu-scene-canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.canvas.style.mixBlendMode = this.config.blend === 'over' ? 'screen' : 'normal';
    container.appendChild(this.canvas);
    this.applyVisibleThemeSurface();

    if (this.canCreateRenderer(this.canvas)) {
      this.renderer = createMirroredStageRenderer(this.canvas);
      this.renderer.setMode('track');
      this.renderer.setActive(false);
      this.applyRendererConfig();
    }

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.renderer?.resize());
      this.resizeObserver.observe(container);
    }
    this.mounted = true;
  }

  unmount(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.renderer?.destroy();
    this.renderer = null;
    if (this.container && this.canvas?.parentNode === this.container) {
      this.container.removeChild(this.canvas);
    }
    this.canvas = null;
    this.container = null;
    this.mounted = false;
  }

  update(_dt: number, context: VisualContext): void {
    if (!this.renderer) return;
    this.renderer.setAudioFeatures(this.readAudioFeatures(context));
    this.renderer.setActive(this.mounted);
  }

  resize(): void {
    this.renderer?.resize();
  }

  private applyRendererConfig(): void {
    this.applyVisibleThemeSurface();
    if (this.canvas) {
      this.canvas.style.mixBlendMode = this.config.blend === 'over' ? 'screen' : 'normal';
      this.canvas.style.filter = `brightness(${this.config.brightness}) contrast(${this.config.contrast})`;
    }
    this.renderer?.setItem(this.config.variant as StageItem);
    this.renderer?.setTheme(this.config.palette as ThemeName);
    this.renderer?.setShowBackground(this.config.showBackground);
    this.renderer?.setMode('track');
  }

  private readAudioFeatures(context: VisualContext): StageAudioFeatures {
    const source = selectFctAudioFeatures(context, this.config.audioSource);
    return buildStageAudioFeaturesForFct(source, this.config.sensitivity);
  }

  private applyVisibleThemeSurface(): void {
    if (this.container) {
      this.container.style.background = 'transparent';
    }
    if (this.canvas) {
      this.canvas.style.background = 'transparent';
    }
  }

  private createCanvasElement(): HTMLCanvasElement {
    if (typeof document !== 'undefined') {
      return document.createElement('canvas');
    }

    return {
      dataset: {},
      classList: { add: () => undefined },
      style: {},
      width: 0,
      height: 0,
      clientWidth: 0,
      clientHeight: 0,
      parentNode: null,
      getContext: () => null,
    } as unknown as HTMLCanvasElement;
  }

  private canCreateRenderer(canvas: HTMLCanvasElement): boolean {
    return typeof window !== 'undefined' && typeof canvas.getContext === 'function';
  }
}

export const fctTrackVisualPlugin = definePlugin<FctTrackSceneOptions>(
  {
    id: 'fct-track-visuals',
    version: '1.0.0',
    apiVersion: 1,
    capabilities: ['visual.scene'],
    supportedProtocolVersions: [PROTOCOL_VERSION],
    sideEffects: ['visual'],
    description: 'Migrated FCT WebGL audio-reactive track visual scene for Client and Display surfaces.',
  },
  () => ({
    configure: () => undefined,
  })
);
