// Purpose: Typed browser AudioContext helpers.

type AudioContextCtor = new (...args: never[]) => AudioContext;

export const getBrowserAudioContextCtor = (win?: Window | null): AudioContextCtor | null => {
  if (!win) return null;
  const typed = win as Window & {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return typed.AudioContext ?? typed.webkitAudioContext ?? null;
};
