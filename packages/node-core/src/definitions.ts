/**
 * Purpose: Public entrypoint for default node definitions.
 */

export { registerDefaultNodeDefinitions } from './definitions/register.js';
export type {
  ClientObject,
  ClientObjectDeps,
  ClientUiDeps,
  ClientUiKind,
  ClientUiState,
  ClientSensorMessage,
  LatestSensorDataLike,
  NodeCommand,
} from './definitions/types.js';
