/**
 * Purpose: Share a best-effort analysis tap for locally played client/display audio.
 */

export type PlaybackAudioTapSource = AudioNode | MediaElementAudioSourceNode | null;

type Listener = (source: PlaybackAudioTapSource, context: AudioContext | null) => void;

const listeners = new Set<Listener>();
let currentSource: PlaybackAudioTapSource = null;
let currentContext: AudioContext | null = null;
let outputSource: PlaybackAudioTapSource = null;
let outputContext: AudioContext | null = null;

const effectiveSource = (): PlaybackAudioTapSource => currentSource ?? outputSource;
const effectiveContext = (): AudioContext | null => (currentSource ? currentContext : outputContext);

const notify = (): void => {
  const source = effectiveSource();
  const context = effectiveContext();
  for (const listener of listeners) {
    listener(source, context);
  }
};

export function setPlaybackAudioTapSource(source: PlaybackAudioTapSource, context: AudioContext | null): void {
  currentSource = source;
  currentContext = context;
  notify();
}

export function clearPlaybackAudioTapSource(source?: PlaybackAudioTapSource): void {
  if (source && currentSource !== source) return;
  setPlaybackAudioTapSource(null, null);
}

export function setPlaybackOutputAudioTapSource(source: PlaybackAudioTapSource, context: AudioContext | null): void {
  outputSource = source;
  outputContext = context;
  notify();
}

export function clearPlaybackOutputAudioTapSource(source?: PlaybackAudioTapSource): void {
  if (source && outputSource !== source) return;
  outputSource = null;
  outputContext = null;
  notify();
}

export function subscribePlaybackAudioTap(listener: Listener): () => void {
  listeners.add(listener);
  listener(effectiveSource(), effectiveContext());
  return () => listeners.delete(listener);
}
