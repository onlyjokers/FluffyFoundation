/**
 * Purpose: Compatibility barrel for asset loader node definitions.
 */
export {
  createLoadAudioAssetFromAssetsNode,
  createGenerateTtsAudioAssetNode,
  createReferenceAudioFromDropBoxNode,
  createUploadAudioToDropBoxNode,
  createLoadAudioFromAssetsNode,
  createLoadAudioFromLocalNode,
} from './assets/audio.js';
export { createGptImageGenNode } from './assets/image-generation.js';
export { createLoadImageFromAssetsNode, createLoadImageFromLocalNode } from './assets/image.js';
export { createLoadVideoFromAssetsNode, createLoadVideoFromLocalNode } from './assets/video.js';
