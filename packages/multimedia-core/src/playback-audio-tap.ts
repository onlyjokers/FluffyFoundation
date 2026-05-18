/**
 * Purpose: Share a best-effort analysis tap for locally played client/display audio.
 */

export type PlaybackAudioTapSource = AudioNode | MediaElementAudioSourceNode | null;

type Listener = (source: PlaybackAudioTapSource, context: AudioContext | null) => void;

const listeners = new Set<Listener>();
let currentSource: PlaybackAudioTapSource = null;
let currentContext: AudioContext | null = null;

export function setPlaybackAudioTapSource(source: PlaybackAudioTapSource, context: AudioContext | null): void {
  currentSource = source;
  currentContext = context;
  for (const listener of listeners) {
    listener(currentSource, currentContext);
  }
}

export function clearPlaybackAudioTapSource(source?: PlaybackAudioTapSource): void {
  if (source && currentSource !== source) return;
  setPlaybackAudioTapSource(null, null);
}

export function subscribePlaybackAudioTap(listener: Listener): () => void {
  listeners.add(listener);
  listener(currentSource, currentContext);
  return () => listeners.delete(listener);
}
