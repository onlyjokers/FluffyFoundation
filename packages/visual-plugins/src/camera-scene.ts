/**
 * Purpose: Camera stream scene layer for front/back camera visual composition.
 */
import type { VisualContext, VisualScene } from './types.js';

export type CameraSceneFacing = 'user' | 'environment';

export interface CameraSceneOptions {
  facing?: CameraSceneFacing;
}

export class CameraScene implements VisualScene {
  readonly id: string;

  private video: HTMLVideoElement | null = null;
  private container: HTMLElement | null = null;
  private facing: CameraSceneFacing;

  constructor(options: CameraSceneOptions = {}) {
    this.facing = options.facing === 'environment' ? 'environment' : 'user';
    this.id = this.facing === 'environment' ? 'back-camera-scene' : 'front-camera-scene';
  }

  configure(options: CameraSceneOptions = {}): void {
    if (options.facing === 'user' || options.facing === 'environment') {
      this.facing = options.facing;
    }
    this.applyVideoStyles();
  }

  mount(container: HTMLElement): void {
    this.container = container;
    this.video = this.createVideoElement();
    this.video.dataset.shuguSceneId = this.id;
    this.video.classList.add('shugu-scene-canvas');
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.muted = true;
    this.applyVideoStyles();
    container.appendChild(this.video);
  }

  unmount(): void {
    if (this.video) {
      this.video.srcObject = null;
      if (this.container && this.video.parentNode === this.container) {
        this.container.removeChild(this.video);
      }
    }
    this.video = null;
    this.container = null;
  }

  update(_dt: number, context: VisualContext): void {
    if (!this.video) return;
    const stream = context.cameraStream ?? null;
    if (this.video.srcObject !== stream) {
      this.video.srcObject = stream;
      if (stream) void this.video.play().catch(() => undefined);
    }
  }

  resize(): void {
    this.applyVideoStyles();
  }

  private applyVideoStyles(): void {
    if (!this.video) return;
    this.video.style.position = 'absolute';
    this.video.style.inset = '0';
    this.video.style.width = '100%';
    this.video.style.height = '100%';
    this.video.style.objectFit = 'cover';
    this.video.style.display = 'block';
    this.video.style.transform = this.facing === 'user' ? 'scaleX(-1)' : '';
  }

  private createVideoElement(): HTMLVideoElement {
    if (typeof document !== 'undefined') {
      return document.createElement('video');
    }

    return {
      dataset: {},
      classList: { add: () => undefined },
      style: {},
      autoplay: true,
      playsInline: true,
      muted: true,
      srcObject: null,
      parentNode: null,
      play: () => Promise.resolve(),
    } as unknown as HTMLVideoElement;
  }
}
