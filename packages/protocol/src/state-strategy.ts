/**
 * Purpose: Shared FF-06 state strategy and control-plane snapshot protocol types.
 */

export interface StateStrategyStatus {
  mode: 'single-server';
  instanceId?: string;
  registryOwner?: 'server-process';
  selectionOwner?: 'server-process';
  ownershipOwner?: 'server-process';
  controlPlaneSnapshotOwner?: 'server-process';
  unsupportedClusterEnv?: string[];
}

export interface ControlPlaneSnapshot {
  strategy: 'single-server';
  selection: {
    selectedClientIds: string[];
    revision: number;
  };
  ownership: Record<string, { owner: 'server-process'; selectedClientIds: string[] }>;
}
