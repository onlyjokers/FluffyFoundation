/**
 * Purpose: Execute client media and sound control actions.
 */
import type { PlayMediaPayload, PlaySoundPayload, ShowImagePayload } from '@shugu/protocol';
import { parseMediaClipParams } from '../client-media';
import type { ClientControlDeps } from './types';

export function executeMediaControl(
  deps: ClientControlDeps,
  action: string,
  payload: unknown,
  delaySeconds: number
): boolean {
  switch (action) {
    case 'playSound':
      playSound(deps, payload as PlaySoundPayload, delaySeconds);
      return true;
    case 'playMedia':
      playMedia(deps, payload as PlayMediaPayload, delaySeconds);
      return true;
    case 'stopMedia':
      deps.getMultimediaCore()?.media.stopVideo();
      deps.getMultimediaCore()?.media.stopAudio();
      deps.getToneSoundPlayer()?.stop();
      return true;
    case 'stopSound':
      deps.getToneSoundPlayer()?.stop();
      deps.getToneModulatedSoundPlayer()?.stop();
      return true;
    case 'showImage':
      showImage(deps, payload as ShowImagePayload);
      return true;
    case 'hideImage':
      deps.getMultimediaCore()?.media.hideImage();
      return true;
    default:
      return false;
  }
}

function playSound(deps: ClientControlDeps, soundPayload: PlaySoundPayload, delaySeconds: number): void {
  const multimediaCore = deps.getMultimediaCore();
  const url =
    typeof soundPayload.url === 'string'
      ? (multimediaCore?.resolveAssetRef(soundPayload.url) ?? soundPayload.url)
      : soundPayload.url;
  // Always go through ToneSoundPlayer; it has an internal HTMLAudio fallback path.
  deps.getToneSoundPlayer()?.play({ ...soundPayload, url }, delaySeconds);
}

function playMedia(deps: ClientControlDeps, mediaPayload: PlayMediaPayload, delaySeconds: number): void {
  const multimediaCore = deps.getMultimediaCore();
  const clip = typeof mediaPayload.url === 'string' ? parseMediaClipParams(mediaPayload.url) : null;
  const baseUrl = clip ? clip.baseUrl : mediaPayload.url;
  const baseUrlString = typeof baseUrl === 'string' ? baseUrl : String(baseUrl ?? '');
  const resolvedUrlString = multimediaCore?.resolveAssetRef(baseUrlString) ?? baseUrlString;
  const isVideo =
    mediaPayload.mediaType === 'video' || /\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(resolvedUrlString);

  if (isVideo) {
    const loop = clip?.loop ?? mediaPayload.loop ?? false;
    const playing = clip?.play ?? Boolean(resolvedUrlString);
    const startSec = clip ? Math.max(0, clip.startSec) : 0;
    const endSec = clip ? clip.endSec : -1;
    const cursorSec = clip?.cursorSec ?? -1;
    const reverse = clip?.reverse ?? false;
    const fit = clip?.fit ?? null;
    multimediaCore?.media.playVideo({
      url: baseUrlString,
      sourceNodeId: clip?.sourceNodeId ?? null,
      muted: mediaPayload.muted ?? true,
      loop,
      volume: mediaPayload.volume ?? 1,
      playing,
      startSec,
      endSec,
      cursorSec,
      reverse,
      ...(fit === null ? {} : { fit }),
    });
    return;
  }

  const audioPayload: PlaySoundPayload = {
    url: resolvedUrlString,
    volume: mediaPayload.volume,
    loop: mediaPayload.loop,
    fadeIn: mediaPayload.fadeIn,
  };
  void deps
    .getToneSoundPlayer()
    ?.update(audioPayload, delaySeconds)
    .then((updated) => {
      if (updated) return;
      return deps.getToneSoundPlayer()?.play(audioPayload, delaySeconds);
    })
    .catch(() => undefined);
}

function showImage(deps: ClientControlDeps, imagePayload: ShowImagePayload): void {
  const multimediaCore = deps.getMultimediaCore();
  const clip = typeof imagePayload.url === 'string' ? parseMediaClipParams(imagePayload.url) : null;
  const baseUrl = clip ? clip.baseUrl : imagePayload.url;
  const url = typeof baseUrl === 'string' ? baseUrl : String(baseUrl ?? '');
  const fit = clip?.fit ?? null;
  const scale = clip?.scale ?? null;
  const offsetX = clip?.offsetX ?? null;
  const offsetY = clip?.offsetY ?? null;
  const opacity = clip?.opacity ?? null;
  multimediaCore?.media.showImage({
    url,
    duration: imagePayload.duration,
    ...(fit === null ? {} : { fit }),
    ...(scale === null ? {} : { scale }),
    ...(offsetX === null ? {} : { offsetX }),
    ...(offsetY === null ? {} : { offsetY }),
    ...(opacity === null ? {} : { opacity }),
  });
}
