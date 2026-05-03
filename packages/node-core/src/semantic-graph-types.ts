/**
 * Purpose: FF-09 semantic graph object model types shared by command and snapshot modules.
 */

import type { Connection, GraphState, NodeDefinition, NodeInstance } from './types.js';
import type { AgentNodeDefinitionSummary } from './node-definition-metadata.js';

export type SemanticActor = { id: string; role: string };

export type SemanticNode = {
  id: string;
  type: string;
  params: Record<string, unknown>;
  inputValues: Record<string, unknown>;
  outputValues: Record<string, unknown>;
  archived?: boolean;
};

export type SemanticDefinition = {
  type: string;
  label: string;
  category: string;
  ports: { inputs: NodeDefinition['inputs']; outputs: NodeDefinition['outputs'] };
  params: NodeDefinition['configSchema'];
  aiSummary?: AgentNodeDefinitionSummary;
};

export type SemanticGroup = {
  id: string;
  parentId: string | null;
  name: string;
  nodeIds: string[];
  disabled: boolean;
  archived?: boolean;
  runtimeActive?: boolean;
};

export type SemanticPartition = {
  id: string;
  nodeIds: string[];
  status: 'draft' | 'deployed' | 'stopped' | 'error';
  requiredCapabilities?: string[];
  error?: string;
};

export type RuntimeStatus = {
  running: boolean;
  deployedPartitionIds: string[];
  [key: string]: unknown;
};

export type DeviceCapability = { deviceId: string; capabilities: string[]; status?: string };
export type SemanticError = { code: string; message: string; targetId?: string };
export type SemanticPermission = { actorId: string; operations: string[] };

export type SemanticProposal = {
  id: string;
  title: string;
  commands: SemanticCommand[];
  status?: 'draft' | 'proposed' | 'accepted' | 'rejected';
};

export type SemanticGraphSnapshot = {
  revision: number;
  nodes: SemanticNode[];
  definitions: SemanticDefinition[];
  connections: Connection[];
  groups: SemanticGroup[];
  partitions: SemanticPartition[];
  runtimeStatus: RuntimeStatus;
  deviceCapabilities: DeviceCapability[];
  errors: SemanticError[];
  permissions: SemanticPermission[];
  proposals?: SemanticProposal[];
};

export type SemanticSnapshotInput = {
  graph: GraphState;
  definitions?: Array<Partial<NodeDefinition> & Pick<NodeDefinition, 'type'>>;
  groups?: Array<Record<string, unknown>>;
  partitions?: SemanticPartition[];
  runtimeStatus?: RuntimeStatus;
  deviceCapabilities?: DeviceCapability[];
  errors?: SemanticError[];
  permissions?: SemanticPermission[];
  revision?: number;
  proposals?: SemanticProposal[];
};

export type SemanticCommand =
  | { type: 'node.add'; node: NodeInstance }
  | { type: 'node.remove'; nodeId: string }
  | { type: 'node.archive'; nodeId: string }
  | { type: 'node.connect'; connection: Connection }
  | { type: 'node.disconnect'; connectionId: string }
  | { type: 'node.params.update'; nodeId: string; params: Record<string, unknown> }
  | { type: 'group.create'; group: SemanticGroup }
  | { type: 'group.update'; groupId: string; patch: Partial<SemanticGroup> }
  | { type: 'group.archive'; groupId: string }
  | {
      type: 'partition.deploy';
      partitionId: string;
      nodeIds: string[];
      requiredCapabilities?: string[];
    }
  | { type: 'partition.stop'; partitionId: string }
  | { type: 'proposal.create'; proposal: SemanticProposal };

export type SemanticCommandPolicy = {
  canExecute: (input: {
    actor: SemanticActor;
    command: SemanticCommand;
    snapshot: SemanticGraphSnapshot;
  }) => boolean | { allowed: boolean; reason?: string };
};

export type CommandAuditEntry = {
  id: string;
  actor: SemanticActor;
  command: SemanticCommand;
  dryRun: boolean;
  lifecycle: Array<'dry-run' | 'policy' | 'apply' | 'audit' | 'history' | 'rollback-token'>;
  policy: { allowed: boolean; reason?: string };
  previousRevision: number;
  appliedRevision: number;
  rollbackToken: string;
  createdAt: string;
};

export type SemanticCommandResult =
  | {
      ok: true;
      command: SemanticCommand;
      dryRun: boolean;
      previousRevision: number;
      appliedRevision: number;
      rollbackToken: string;
      audit: CommandAuditEntry;
      snapshot: SemanticGraphSnapshot;
    }
  | {
      ok: false;
      command: SemanticCommand;
      dryRun: boolean;
      stage: 'dry-run' | 'policy' | 'apply';
      message: string;
      previousRevision: number;
      appliedRevision: number;
      rollbackToken?: string;
      audit?: CommandAuditEntry;
      snapshot: SemanticGraphSnapshot;
    };

export type SemanticCommandBus = {
  dispatch: (input: {
    actor: SemanticActor;
    command: SemanticCommand;
    dryRun?: boolean;
  }) => SemanticCommandResult;
  rollback: (rollbackToken: string) => {
    ok: boolean;
    message?: string;
    snapshot: SemanticGraphSnapshot;
  };
  getSnapshot: () => SemanticGraphSnapshot;
  getHistory: () => CommandAuditEntry[];
  getAuditLog: () => CommandAuditEntry[];
};

export type SemanticCommandBusInput = SemanticSnapshotInput & { policy?: SemanticCommandPolicy };

export type CommandState = {
  graph: GraphState;
  groups: SemanticGroup[];
  partitions: SemanticPartition[];
  proposals: SemanticProposal[];
  revision: number;
};
