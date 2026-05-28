/**
 * Purpose: MediaEngine — multimedia state machine for image/video playback.
 *
 * This is framework-agnostic (no DOM). The app layer (Svelte) renders state.
 * URLs can be raw or `asset:` refs; callers can inject a resolver.
 */

export type MediaFit = 'contain' | 'fit-screen' | 'cover' | 'fill';

export type VideoState = {
  url: string | null;
  // Optional node graph source id (e.g. load-video-from-assets nodeId) for UI telemetry.
  sourceNodeId: string | null;
  playing: boolean;
  muted: boolean;
  loop: boolean;
  volume: number;
  startSec: number;
  endSec: number;
  cursorSec: number;
  reverse: boolean;
  fit: MediaFit;
};

export type ImageState = {
  url: string | null;
  visible: boolean;
  duration: number | undefined;
  fit: MediaFit;
  scale: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
};

export type AudioState = {
  url: string | null;
  playing: boolean;
  loop: boolean;
  volume: number;
};

export type MediaEngineState = {
  video: VideoState;
  image: ImageState;
  audio: AudioState;
};

type Listener = (state: MediaEngineState) => void;
type ResolveKind = 'image' | 'video' | 'audio';

export class MediaEngine {
  private readonly listeners = new Set<Listener>();
  private state: MediaEngineState = {
    video: {
      url: null,
      sourceNodeId: null,
      playing: false,
      muted: true,
      loop: false,
      volume: 1,
      startSec: 0,
      endSec: -1,
      cursorSec: -1,
      reverse: false,
      fit: 'contain',
    },
    image: { url: null, visible: false, duration: undefined, fit: 'contain', scale: 1, offsetX: 0, offsetY: 0, opacity: 1 },
    audio: { url: null, playing: false, loop: false, volume: 1 },
  };

  constructor(private readonly opts: { resolveUrl?: (url: string, kind?: ResolveKind) => string } = {}) {}

  subscribeState(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): MediaEngineState {
    return this.state;
  }

  private setState(next: Partial<MediaEngineState>): void {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l(this.state);
  }

  private resolve(url: unknown, kind?: ResolveKind): string | null {
    if (typeof url !== 'string' || !url.trim()) return null;
    const raw = url.trim();
    return this.opts.resolveUrl ? this.opts.resolveUrl(raw, kind) : raw;
  }

  private coerceFit(raw: unknown): MediaFit {
    const normalized = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (normalized === 'fit-screen' || normalized === 'fitscreen' || normalized === 'fullscreen')
      return 'fit-screen';
    if (normalized === 'cover') return 'cover';
    if (normalized === 'fill' || normalized === 'stretch') return 'fill';
    return 'contain';
  }

  showImage(payload: { url: string; duration?: number; fit?: MediaFit; scale?: number; offsetX?: number; offsetY?: number; opacity?: number }): void {
    const url = this.resolve(payload.url, 'image');
    const fit = this.coerceFit(payload.fit);
    const scale = typeof payload.scale === 'number' && Number.isFinite(payload.scale) ? Math.max(0.1, Math.min(10, payload.scale)) : 1;
    const offsetX = typeof payload.offsetX === 'number' && Number.isFinite(payload.offsetX) ? payload.offsetX : 0;
    const offsetY = typeof payload.offsetY === 'number' && Number.isFinite(payload.offsetY) ? payload.offsetY : 0;
    const opacity = typeof payload.opacity === 'number' && Number.isFinite(payload.opacity) ? Math.max(0, Math.min(1, payload.opacity)) : 1;
    this.setState({
      image: { url, visible: Boolean(url), duration: payload.duration, fit, scale, offsetX, offsetY, opacity },
    });
  }

  hideImage(): void {
    this.setState({ image: { url: null, visible: false, duration: undefined, fit: 'contain', scale: 1, offsetX: 0, offsetY: 0, opacity: 1 } });
  }

  playVideo(payload: {
    url: string;
    muted?: boolean;
    loop?: boolean;
    volume?: number;
    playing?: boolean;
    startSec?: number;
    endSec?: number;
    cursorSec?: number;
    reverse?: boolean;
    sourceNodeId?: string | null;
    fit?: MediaFit;
  }): void {
    const url = this.resolve(payload.url, 'video');
    const sourceNodeIdRaw = payload.sourceNodeId;
    const sourceNodeId =
      typeof sourceNodeIdRaw === 'string' && sourceNodeIdRaw.trim() ? sourceNodeIdRaw.trim() : null;
    const fit = this.coerceFit(payload.fit);
    const startSecRaw = payload.startSec ?? 0;
    const endSecRaw = payload.endSec ?? -1;
    const cursorSecRaw = payload.cursorSec ?? -1;
    const playingRaw = payload.playing;
    const reverseRaw = payload.reverse;

    const startSec = typeof startSecRaw === 'number' && Number.isFinite(startSecRaw) ? Math.max(0, startSecRaw) : 0;
    const endCandidate = typeof endSecRaw === 'number' && Number.isFinite(endSecRaw) ? endSecRaw : -1;
    const endSec = endCandidate >= 0 ? Math.max(startSec, endCandidate) : -1;
    const cursorCandidate =
      typeof cursorSecRaw === 'number' && Number.isFinite(cursorSecRaw) ? cursorSecRaw : -1;
    const cursorSec = cursorCandidate >= 0 ? Math.max(startSec, cursorCandidate) : -1;
    const reverse = Boolean(reverseRaw ?? false);
    const playing =
      typeof playingRaw === 'boolean' ? playingRaw : typeof playingRaw === 'number' ? playingRaw >= 0.5 : Boolean(url);

    this.setState({
      video: {
        url,
        sourceNodeId,
        playing,
        muted: Boolean(payload.muted ?? true),
        loop: Boolean(payload.loop ?? false),
        volume: Math.max(0, Math.min(100, Number(payload.volume ?? 1) || 0)),
        startSec,
        endSec,
        cursorSec,
        reverse,
        fit,
      },
    });
  }

  stopVideo(): void {
    this.setState({
      video: {
        url: null,
        sourceNodeId: null,
        playing: false,
        muted: true,
        loop: false,
        volume: 1,
        startSec: 0,
        endSec: -1,
        cursorSec: -1,
        reverse: false,
        fit: 'contain',
      },
    });
  }

  playAudio(payload: { url: string; playing?: boolean; loop?: boolean; volume?: number }): void {
    const url = this.resolve(payload.url, 'audio');
    const playingRaw = payload.playing;
    const playing =
      typeof playingRaw === 'boolean' ? playingRaw : typeof playingRaw === 'number' ? playingRaw >= 0.5 : Boolean(url);
    this.setState({
      audio: {
        url,
        playing,
        loop: Boolean(payload.loop ?? false),
        volume: Math.max(0, Math.min(100, Number(payload.volume ?? 1) || 0)),
      },
    });
  }

  stopAudio(): void {
    this.setState({ audio: { url: null, playing: false, loop: false, volume: 1 } });
  }

  stopAllMedia(): void {
    this.stopVideo();
    this.hideImage();
    this.stopAudio();
  }
}
