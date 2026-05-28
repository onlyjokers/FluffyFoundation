/**
 * Client store - wraps the SDK and provides reactive state for Svelte.
 *
 * This is a thin entrypoint that re-exports the public store API from internal modules.
 */

export { state, permissions, latency, connectionStatus, clientId } from './client/client-state';
export {
  clientControlTransfer,
  applyClientControlTransferStatus,
  clearClientControlTransfer,
  formatClientControlTransferStatus,
} from './client/client-transfer';
export {
  boxSceneEnabled,
  melSceneEnabled,
  frontCameraEnabled,
  backCameraEnabled,
  visualScenes,
  cameraStream,
  cameraFacing,
  visualEffects,
  type CameraFacing,
} from './client/client-visual';
export { audioStream, videoState, imageState, audioPlaybackState } from './client/client-media';
export { textOverlay } from './client/client-text-overlay';
export { clientUiRuntime } from './client/client-ui-runtime';
export { audioEnabled } from './client/client-tone';
export {
  startEarlyPreload,
  getMultimediaCore,
  initialize,
  connectToServer,
  disconnectFromServer,
  requestPermissions,
  enableAudio,
  disconnect,
  getSDK,
  getServerUrl,
  measureLatency,
} from './client/client-runtime';
