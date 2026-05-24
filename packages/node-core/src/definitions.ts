/**
 * Purpose: Public entrypoint for default node definitions.
 */

export { registerDefaultNodeDefinitions } from './definitions/register.js';
export type {
  ClientObject,
  ClientObjectDeps,
  ClientUiDeps,
  ClientUiKind,
  ClientUiLayerItem,
  ClientUiState,
  ClientSensorMessage,
  GeneratedImageAssetRequest,
  ImageAssetNodeDeps,
  LatestSensorDataLike,
  NodeCommand,
  AudioAssetNodeDeps,
} from './definitions/types.js';
