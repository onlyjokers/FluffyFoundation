import assert from 'node:assert/strict';
import { MediaEngine, MultimediaCore } from '../../../../packages/multimedia-core/src/index.ts';
import { executeStopAllCleanup } from '../../../../packages/sdk-client/src/stop-all-cleanup.ts';

class MemoryHeaders { constructor(values) { this.values = values; } get(name) { return this.values[name.toLowerCase()] ?? null; } }
function response(init = {}) {
  return { ok: init.ok ?? true, status: init.status ?? 200, headers: new MemoryHeaders(init.headers ?? {}), json: async () => init.json, arrayBuffer: async () => init.body ?? new ArrayBuffer(1), clone() { return response(init); } };
}

const originalFetch = globalThis.fetch;
const requests = [];
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  requests.push({ url, method: init.method ?? 'GET' });
  const id = url.match(/\/api\/assets\/([^/?]+)/)?.[1] ?? url.match(/\/api\/assets\/([^/?]+)\/content/)?.[1] ?? 'unknown';
  const mime = id.includes('video') ? 'video/mp4' : id.includes('audio') ? 'audio/wav' : 'image/png';
  const sha = id.padEnd(64, 'a').slice(0, 64);
  if (url.includes('/api/assets/') && !url.includes('/content')) return response({ json: { sha256: sha, mimeType: mime, sizeBytes: 4 } });
  if (init.method === 'HEAD') return response({ headers: { etag: `"${sha}"`, 'content-length': '4' } });
  return response({ body: new ArrayBuffer(4) });
};

try {
  const manifest = { manifestId: 'ff16-runtime-proof', assets: ['asset:image-proof', 'asset:video-proof', 'asset:audio-proof'] };
  const core = new MultimediaCore({ serverUrl: 'https://server.test', timeoutMs: 50, maxRetries: 1, autoStart: false });
  core.setAssetManifest(manifest);
  await core.preloadNow('manual');
  assert.equal(core.getState().status, 'ready');
  assert.equal(core.getState().loaded, 3);

  const media = new MediaEngine({ resolveUrl: (url) => core.resolveAssetRef(url) });
  media.showImage({ url: 'asset:image-proof' });
  media.playVideo({ url: 'asset:video-proof', playing: true });
  media.playAudio({ url: 'asset:audio-proof', playing: true, volume: 0.7 });
  assert.equal(media.getState().image.visible, true);
  assert.equal(media.getState().video.playing, true);
  assert.equal(media.getState().audio.playing, true);

  const cleanup = [];
  executeStopAllCleanup({
    media,
    sound: { stop: () => cleanup.push('sound') },
    modulatedSound: { stop: () => cleanup.push('modulatedSound') },
    screen: { clear: () => cleanup.push('screen.clear'), setColor: (payload) => cleanup.push(`screen:${payload.opacity}`) },
    visual: { clearScenes: () => cleanup.push('visualScenes'), clearEffects: () => cleanup.push('visualEffects') },
    nodeExecutor: { stopAll: () => cleanup.push('nodeExecutor') },
  });

  const state = media.getState();
  assert.equal(state.image.visible, false);
  assert.equal(state.video.playing, false);
  assert.equal(state.audio.playing, false);
  assert.deepEqual(cleanup, ['sound', 'modulatedSound', 'screen.clear', 'screen:0', 'visualScenes', 'visualEffects', 'nodeExecutor']);

  console.log(JSON.stringify({
    manifest: core.getState(),
    uploadedPreloadedPlayed: { image: true, video: true, audio: true },
    requests,
    stopAllCleared: { imageVisible: state.image.visible, videoPlaying: state.video.playing, audioPlaying: state.audio.playing, cleanup },
  }, null, 2));
  core.destroy();
} finally {
  globalThis.fetch = originalFetch;
}
