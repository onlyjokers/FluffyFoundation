/**
 * Purpose: In-memory deterministic command bus used by FF-18 golden scenario fixtures.
 */

import type { AiSemanticActor, AiSemanticCommand } from './deterministic-planner.js';
import type {
  FixtureBus,
  FixtureCommandAudit,
  FixtureDefinition,
  FixtureNode,
  FixtureSnapshot,
} from './golden-scenario-types.js';
import { actor } from './golden-scenario-support.js';

export const baseSnapshot = (input: {
  revision: number;
  nodes: FixtureNode[];
  definitions: FixtureDefinition[];
  deviceCapabilities: Array<Record<string, unknown>>;
  runtimeTarget: string;
}): FixtureSnapshot => ({
  revision: input.revision,
  nodes: input.nodes,
  connections: [],
  groups: [
    {
      id: `group:${input.runtimeTarget}`,
      parentId: null,
      name: `${input.runtimeTarget} group`,
      nodeIds: input.nodes.map((node) => node.id),
      disabled: false,
      owner: { actorId: 'manager:fixture', role: 'manager', capabilities: ['group.mutate'] },
      surface: 'public',
      visibility: { defaultAccess: 'visible-readonly' },
      collapsed: true,
    },
  ],
  partitions: [
    {
      id: `partition:${input.runtimeTarget}`,
      nodeIds: input.nodes.map((node) => node.id),
      targetPlatform: input.runtimeTarget,
      status: 'deployed',
      boundRevision: input.revision,
    },
  ],
  runtimeStatus: { running: true, deployedPartitionIds: [`partition:${input.runtimeTarget}`] },
  deviceCapabilities: input.deviceCapabilities,
  errors: [],
  permissions: [{ actorId: actor.id, operations: ['node.params.update'] }],
  definitions: input.definitions,
  proposals: [
    {
      id: 'proposal:previous',
      title: 'Previous redacted fixture proposal',
      commands: [],
      localPath: '/Users/ziqi/Desktop/FluffyFoundation/secrets/fixture.json',
    },
  ],
});

const cloneSnapshot = (snapshot: FixtureSnapshot): FixtureSnapshot => ({
  revision: snapshot.revision,
  nodes: snapshot.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    params: { ...node.params },
    inputValues: { ...node.inputValues },
    outputValues: { ...node.outputValues },
  })),
  connections: [...snapshot.connections],
  groups: snapshot.groups.map((group) => ({ ...group })),
  partitions: snapshot.partitions.map((partition) => ({ ...partition })),
  runtimeStatus: {
    ...snapshot.runtimeStatus,
    deployedPartitionIds: Array.isArray(snapshot.runtimeStatus.deployedPartitionIds)
      ? [...snapshot.runtimeStatus.deployedPartitionIds]
      : [],
  },
  deviceCapabilities: snapshot.deviceCapabilities.map((capability) => ({ ...capability })),
  errors: snapshot.errors.map((error) => ({ ...error })),
  permissions: snapshot.permissions.map((permission) => ({ ...permission })),
  definitions: snapshot.definitions.map((definition) => ({
    ...definition,
    aiSummary: { ...definition.aiSummary },
  })),
  proposals: snapshot.proposals.map((proposal) => ({ ...proposal })),
});

const isNodeParamUpdate = (
  command: AiSemanticCommand
): command is Extract<AiSemanticCommand, { type: 'node.params.update' }> => command.type === 'node.params.update';

const numberBounds = (
  snapshot: FixtureSnapshot,
  nodeId: string,
  key: string
): { min?: number; max?: number } => {
  const node = snapshot.nodes.find((item) => item.id === nodeId);
  const definition = snapshot.definitions.find((item) => item.type === node?.type);
  const params = Array.isArray(definition?.aiSummary.params) ? definition.aiSummary.params : [];
  const param = params.find(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item) && item.key === key
  );
  return {
    ...(typeof param?.min === 'number' ? { min: param.min } : {}),
    ...(typeof param?.max === 'number' ? { max: param.max } : {}),
  };
};

const validateCommand = (snapshot: FixtureSnapshot, command: AiSemanticCommand) => {
  if (!isNodeParamUpdate(command)) return [];
  const node = snapshot.nodes.find((item) => item.id === command.nodeId);
  if (!node) {
    return [
      {
        code: 'GRAPH.MISSING_NODE',
        path: `nodes.${command.nodeId}`,
        severity: 'error' as const,
        message: `Node not found: ${command.nodeId}`,
        repairOptions: ['Refresh the semantic snapshot and choose an existing node id.'],
      },
    ];
  }

  return Object.entries(command.params).flatMap(([key, value]) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return [];
    const bounds = numberBounds(snapshot, command.nodeId, key);
    if (typeof bounds.max === 'number' && value > bounds.max) {
      return [
        {
          code: 'GRAPH.PARAM_OUT_OF_RANGE',
          path: `nodes.${command.nodeId}.params.${key}`,
          severity: 'error' as const,
          message: `Param ${key} is above maximum ${bounds.max}.`,
          machineReason: `${value} violates max ${bounds.max}.`,
          repairOptions: [`Use a value less than or equal to ${bounds.max}.`],
        },
      ];
    }
    if (typeof bounds.min === 'number' && value < bounds.min) {
      return [
        {
          code: 'GRAPH.PARAM_OUT_OF_RANGE',
          path: `nodes.${command.nodeId}.params.${key}`,
          severity: 'error' as const,
          message: `Param ${key} is below minimum ${bounds.min}.`,
          machineReason: `${value} violates min ${bounds.min}.`,
          repairOptions: [`Use a value greater than or equal to ${bounds.min}.`],
        },
      ];
    }
    return [];
  });
};

const applyCommand = (snapshot: FixtureSnapshot, command: AiSemanticCommand): FixtureSnapshot => {
  if (!isNodeParamUpdate(command)) return snapshot;
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    nodes: snapshot.nodes.map((node) =>
      node.id === command.nodeId
        ? {
            ...node,
            params: { ...node.params, ...command.params },
            outputValues: { ...node.outputValues, ...command.params },
          }
        : node
    ),
  };
};

export const createFixtureBus = (initialSnapshot: FixtureSnapshot): FixtureBus => {
  let snapshot = cloneSnapshot(initialSnapshot);
  const rollbackSnapshots = new Map<string, FixtureSnapshot>();
  let auditIndex = 0;

  return {
    getSnapshot: () => cloneSnapshot(snapshot),
    dispatch: ({ command, dryRun = false }) => {
      const previousRevision = snapshot.revision;
      const rollbackToken = `rollback:${previousRevision}:${auditIndex + 1}`;
      const validationErrors = validateCommand(snapshot, command);
      if (validationErrors.length > 0) {
        return {
          ok: false,
          command,
          dryRun,
          previousRevision,
          appliedRevision: previousRevision,
          validationErrors,
          message: validationErrors[0].message,
        };
      }

      const nextSnapshot = applyCommand(snapshot, command);
      const audit: FixtureCommandAudit = {
        rollbackToken,
        policy: { allowed: true },
        lifecycle: ['dry-run', 'policy', 'apply', 'audit', 'history', 'rollback-token'],
      };
      auditIndex += 1;
      if (!dryRun) {
        rollbackSnapshots.set(rollbackToken, cloneSnapshot(snapshot));
        snapshot = nextSnapshot;
      }

      return {
        ok: true,
        command,
        dryRun,
        previousRevision,
        appliedRevision: dryRun ? previousRevision : snapshot.revision,
        rollbackToken,
        audit,
      };
    },
    rollback: (rollbackToken) => {
      const previous = rollbackSnapshots.get(String(rollbackToken));
      if (!previous) return { ok: false, message: 'Rollback token not found.', snapshot: cloneSnapshot(snapshot) };
      snapshot = { ...cloneSnapshot(previous), revision: snapshot.revision + 1 };
      return {
        ok: true,
        recovery: { status: 'redeployed', stoppedPartitionIds: [], redeployedPartitionIds: [] },
        snapshot: cloneSnapshot(snapshot),
      };
    },
  };
};

export type { AiSemanticActor };
