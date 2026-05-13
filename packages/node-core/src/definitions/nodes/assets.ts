/**
 * Purpose: Compatibility barrel for asset loader node definitions.
 */
export {
  createLoadAudioAssetFromAssetsNode,
  createLoadAudioFromAssetsNode,
  createLoadAudioFromLocalNode,
} from './assets/audio.js';
export { createLoadImageFromAssetsNode, createLoadImageFromLocalNode } from './assets/image.js';
export { createLoadVideoFromAssetsNode, createLoadVideoFromLocalNode } from './assets/video.js';
