/**
 * Purpose: FF-09 semantic graph object model types shared by command and snapshot modules.
 */

import type { Connection, GraphState, NodeDefinition, NodeInstance } from './types.js';
import type { AgentNodeDefinitionSummary } from './node-definition-metadata.js';
import type {
  ExecutionPartition,
  ExecutionTargetPlatform,
  PartitionFailureReport,
  PartitionResourceBudget,
  PartitionWatchdogConfig,
  ControlPlaneActorRole,
  ControlPlaneCapability,
  ControlPlaneSurface,
  ControlPlaneVisibilityAccess,
} from '@shugu/protocol';

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

export type AgentGroupPort = {
  id: string;
  type: string;
  label?: string;
  description?: string;
};

export type AgentGroupInterface = {
  publicInputs?: AgentGroupPort[];
  publicOutputs?: AgentGroupPort[];
  exposedNodeIds?: string[];
  callableCommands?: string[];
  eventBindings?: string[];
};

export type AgentGroupDeniedSurface =
  | 'canvas'
  | 'client'
  | 'display'
  | 'device'
  | 'media'
  | 'network'
  | 'partition'
  | 'secrets'
  | 'storage';

export type AgentGroupPolicy = {
  enabled?: boolean;
  allowedActorIds?: string[];
  allowedCommands?: string[];
  deniedSurfaces?: AgentGroupDeniedSurface[];
  targetScope?: {
    nodeIds?: string[];
    allowNewNodes?: boolean;
    allowedNodeTypes?: string[];
    deniedNodeTypes?: string[];
  };
  budgets?: {
    maxNodes?: number;
    maxConnections?: number;
    maxParamsPerCommand?: number;
    maxCommandsPerTurn?: number;
    maxRetries?: number;
  };
  approvalRequired?: boolean;
  rollbackOnReject?: boolean;
};

export type SemanticGroup = {
  id: string;
  parentId: string | null;
  name: string;
  nodeIds: string[];
  disabled: boolean;
  kind?: 'group' | 'ai-space';
  archived?: boolean;
  runtimeActive?: boolean;
  owner?: {
    actorId: string;
    role: ControlPlaneActorRole;
    capabilities: ControlPlaneCapability[];
  };
  ownerStack?: Array<{
    actorId: string;
    role: ControlPlaneActorRole;
    capabilities: ControlPlaneCapability[];
  }>;
  transferable?: boolean;
  surface?: ControlPlaneSurface;
  visibility?: { defaultAccess: ControlPlaneVisibilityAccess };
  agentInterface?: AgentGroupInterface;
  agentPolicy?: AgentGroupPolicy;
};

export type SemanticPartition = ExecutionPartition;

export type RuntimeStatus = {
  running: boolean;
  deployedPartitionIds: string[];
  runtimeOverrides?: RuntimeOverride[];
  [key: string]: unknown;
};

export type RuntimeOverride = {
  nodeId: string;
  portId: string;
  kind?: 'input' | 'output' | 'param';
  value?: unknown;
  ttlMs?: number;
  updatedAtRevision: number;
};

export type DeviceCapability = { deviceId: string; capabilities: string[]; status?: string };
export type SemanticError = { code: string; message: string; targetId?: string };
export type SemanticPermission = { actorId: string; operations: string[] };

export type CustomNodePortSide = 'input' | 'output';

export type CustomNodePortBinding = {
  nodeId: string;
  portId: string;
};

export type CustomNodePort = {
  portKey: string;
  side: CustomNodePortSide;
  label: string;
  type: string;
  pinned: boolean;
  y: number;
  binding: CustomNodePortBinding;
};

export type CustomNodeDefinition = {
  definitionId: string;
  name: string;
  template: GraphState;
  ports: CustomNodePort[];
};

export type AgentCapabilityNodeSource = 'builtin' | 'custom' | 'plugin';

export type AgentCapabilityNodeSetting = {
  nodeType: string;
  enabled: boolean;
  source?: AgentCapabilityNodeSource;
  aiNotes?: string;
  disabledReason?: string;
  updatedAt?: string;
};

export type AgentCapabilitySettings = {
  version: 1;
  nodes: AgentCapabilityNodeSetting[];
};

export type SemanticValidationError = {
  code: string;
  path: string;
  severity: 'error' | 'warning';
  message: string;
  machineReason?: string;
  repairOptions: string[];
};

export type SemanticWarning = {
  code: string;
  path: string;
  message: string;
};

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
  customDefinitions: CustomNodeDefinition[];
  agentCapabilities: AgentCapabilitySettings;
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
  customDefinitions?: CustomNodeDefinition[];
  agentCapabilities?: AgentCapabilitySettings;
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
  | { type: 'graph.snapshot' }
  | { type: 'definition.custom.upsert'; definition: CustomNodeDefinition }
  | { type: 'definition.custom.remove'; definitionId: string }
  | {
      type: 'agent.capability.set';
      nodeType: string;
      enabled: boolean;
      source?: AgentCapabilityNodeSource;
      aiNotes?: string;
      disabledReason?: string;
    }
  | {
      type: 'graph.replace';
      graph: GraphState;
      groups?: SemanticGroup[];
      partitions?: SemanticPartition[];
    }
  | { type: 'node.add'; node: NodeInstance; scopeGroupId?: string }
  | { type: 'node.remove'; nodeId: string; scopeGroupId?: string }
  | { type: 'node.archive'; nodeId: string; scopeGroupId?: string }
  | { type: 'node.restore'; nodeId: string; scopeGroupId?: string }
  | { type: 'node.connect'; connection: Connection; scopeGroupId?: string }
  | { type: 'node.disconnect'; connectionId: string; scopeGroupId?: string }
  | {
      type: 'node.params.update';
      nodeId: string;
      params: Record<string, unknown>;
      scopeGroupId?: string;
    }
  | { type: 'group.create'; group: SemanticGroup }
  | { type: 'group.update'; groupId: string; patch: Partial<SemanticGroup> }
  | { type: 'group.archive'; groupId: string }
  | { type: 'group.delete'; groupId: string }
  | { type: 'group.restore'; groupId: string }
  | { type: 'group.reclaim'; groupId: string }
  | { type: 'group.release'; groupId: string }
  | {
      type: 'partition.deploy';
      partitionId: string;
      nodeIds: string[];
      targetPlatform?: ExecutionTargetPlatform;
      requiredCapabilities?: string[];
      resourceBudget?: PartitionResourceBudget;
      watchdog?: PartitionWatchdogConfig;
      expectedRevision?: number;
    }
  | { type: 'partition.start'; partitionId: string; expectedRevision?: number }
  | { type: 'partition.stop'; partitionId: string; expectedRevision?: number }
  | { type: 'partition.remove'; partitionId: string; expectedRevision?: number }
  | { type: 'partition.redeploy'; partitionId: string; expectedRevision?: number }
  | { type: 'partition.report.failure'; partitionId: string; report: PartitionFailureReport }
  | { type: 'partition.stop.all' }
  | {
      type: 'runtime.override.set';
      nodeId: string;
      portId: string;
      kind?: 'input' | 'output' | 'param';
      value: unknown;
      ttlMs?: number;
    }
  | {
      type: 'runtime.override.clear';
      nodeId: string;
      portId: string;
      kind?: 'input' | 'output' | 'param';
    }
  | { type: 'proposal.create'; proposal: SemanticProposal }
  | { type: 'proposal.approve'; proposalId: string; approvedBy?: string };

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

export type RollbackRecoveryStatus = {
  status: 'redeployed' | 'stopped' | 'partial' | 'error';
  stoppedPartitionIds: string[];
  redeployedPartitionIds: string[];
  errors: SemanticError[];
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
      warnings?: SemanticWarning[];
      snapshot: SemanticGraphSnapshot;
    }
  | {
      ok: false;
      command: SemanticCommand;
      dryRun: boolean;
      stage: 'dry-run' | 'policy' | 'apply';
      message: string;
      validationErrors?: SemanticValidationError[];
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
    recovery?: RollbackRecoveryStatus;
    snapshot: SemanticGraphSnapshot;
  };
  rollbackToRevision: (revision: number) => {
    ok: boolean;
    message?: string;
    recovery?: RollbackRecoveryStatus;
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
  customDefinitions: CustomNodeDefinition[];
  agentCapabilities: AgentCapabilitySettings;
  proposals: SemanticProposal[];
  runtimeStatus: RuntimeStatus;
  revision: number;
};

export type SemanticHistoryState = Pick<CommandState, 'runtimeStatus'>;
