/**
 * Purpose: Define the FF-06 server state strategy and reject unsupported clustered runtime modes.
 */
import { isEnabledFlag, isProductionLike } from './security-policy.js';

export const SERVER_STATE_STRATEGY = 'single-server' as const;

const UNSUPPORTED_CLUSTER_ENV = [
  'REDIS_URL',
  'SHUGU_STATE_STRATEGY',
  'WEB_CONCURRENCY',
  'INSTANCES',
  'NODE_APP_INSTANCE',
] as const;

export type ServerStateStrategyMode = typeof SERVER_STATE_STRATEGY;

export type ServerStateStrategyConfig = {
  nodeEnv?: string;
  redisUrl?: string;
  disableRedisAdapter?: string;
  stateStrategy?: string;
  webConcurrency?: string;
  instances?: string;
  nodeAppInstance?: string;
  instanceId?: string;
};

export type ServerStateStrategyStatus = {
  mode: ServerStateStrategyMode;
  instanceId: string;
  registryOwner: 'server-process';
  selectionOwner: 'server-process';
  ownershipOwner: 'server-process';
  controlPlaneSnapshotOwner: 'server-process';
  unsupportedClusterEnv: string[];
};

function parsePositiveInteger(value: string | undefined): number | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
}

export function createStateStrategyConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ServerStateStrategyConfig {
  return {
    nodeEnv: env.NODE_ENV,
    redisUrl: env.REDIS_URL,
    disableRedisAdapter: env.DISABLE_REDIS_ADAPTER,
    stateStrategy: env.SHUGU_STATE_STRATEGY,
    webConcurrency: env.WEB_CONCURRENCY,
    instances: env.INSTANCES,
    nodeAppInstance: env.NODE_APP_INSTANCE,
    instanceId: env.SHUGU_SERVER_INSTANCE_ID,
  };
}

export function createStateStrategyStatus(config: ServerStateStrategyConfig = {}): ServerStateStrategyStatus {
  return {
    mode: SERVER_STATE_STRATEGY,
    instanceId: (config.instanceId ?? process.pid.toString()).trim() || process.pid.toString(),
    registryOwner: 'server-process',
    selectionOwner: 'server-process',
    ownershipOwner: 'server-process',
    controlPlaneSnapshotOwner: 'server-process',
    unsupportedClusterEnv: [...UNSUPPORTED_CLUSTER_ENV],
  };
}

export function validateServerStateStrategyConfig(config: ServerStateStrategyConfig): void {
  if ((config.stateStrategy ?? '').trim() && (config.stateStrategy ?? '').trim() !== SERVER_STATE_STRATEGY) {
    throw new Error(
      `Production boot denied: SHUGU_STATE_STRATEGY must be ${SERVER_STATE_STRATEGY}; shared state is not implemented.`
    );
  }

  if (!isProductionLike(config.nodeEnv)) return;

  if ((config.redisUrl ?? '').trim() && !isEnabledFlag(config.disableRedisAdapter)) {
    throw new Error(
      'Production boot denied: REDIS_URL enables cross-process broadcast without shared registry/control-plane state.'
    );
  }

  const webConcurrency = parsePositiveInteger(config.webConcurrency);
  if (webConcurrency !== null && webConcurrency !== 1) {
    throw new Error('Production boot denied: WEB_CONCURRENCY must be 1 in single-server state mode.');
  }

  const instances = parsePositiveInteger(config.instances);
  if (instances !== null && instances !== 1) {
    throw new Error('Production boot denied: INSTANCES must be 1 in single-server state mode.');
  }

  const nodeAppInstance = parsePositiveInteger(config.nodeAppInstance);
  if (nodeAppInstance !== null && nodeAppInstance > 0) {
    throw new Error('Production boot denied: NODE_APP_INSTANCE indicates clustered state.');
  }
}
