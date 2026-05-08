/**
 * Purpose: Shared helpers for FF-18 WP8 remaining command surface fixtures.
 */

import { redactAiContextValue } from './semantic-context.js';
import type { AiProposalDryRunResult, AiSemanticCommand } from './deterministic-planner.js';
import type {
  AiRuntimeObservationDeferred,
  RollbackBus,
} from './remaining-command-surfaces-types.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const sortedRecord = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortedRecord);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortedRecord(value[key])])
  );
};

export const stableJson = (value: unknown): string => JSON.stringify(sortedRecord(value));

export const snapshotForParity = (snapshot: Record<string, unknown>): Record<string, unknown> => ({
  revision: snapshot.revision,
  nodes: snapshot.nodes,
  connections: snapshot.connections,
  groups: snapshot.groups,
  partitions: snapshot.partitions,
  proposals: snapshot.proposals,
});

export const runtimeObservation = (): AiRuntimeObservationDeferred => ({
  kind: 'runtime-observation-deferred',
  deferred: true,
  reasonCode: 'BROWSER_RUNTIME_PROOF_DEFERRED',
});

export const getAuditLength = (bus: RollbackBus): number | null => {
  const method = (bus as RollbackBus & { getAuditLog?: () => unknown[] }).getAuditLog;
  return method ? method().length : null;
};

export const getHistoryLength = (bus: RollbackBus): number | null => {
  const method = (bus as RollbackBus & { getHistory?: () => unknown[] }).getHistory;
  return method ? method().length : null;
};

export const revisionOf = (snapshot: Record<string, unknown>): number | null =>
  Number.isFinite(snapshot.revision) ? Number(snapshot.revision) : null;

export const createdAt = (): string => new Date(0).toISOString();

export const effectFor = (command: AiSemanticCommand): AiProposalDryRunResult['expectedEffect'] => {
  if (command.type === 'node.restore') {
    return {
      summary: 'Archived node recovery is routed through node.restore on the semantic command bus.',
      targetNodeId: command.nodeId,
      params: { archived: false },
    };
  }
  if (command.type === 'proposal.approve') {
    return {
      summary: 'Proposal approval is routed through proposal.approve on the semantic command bus.',
      targetNodeId: command.proposalId,
      params: { status: 'accepted' },
    };
  }
  return {
    summary: `Semantic command bus operation: ${command.type}.`,
    targetNodeId: 'nodeId' in command ? String(command.nodeId) : null,
    params: {},
  };
};

export const riskFor = (command: AiSemanticCommand): AiProposalDryRunResult['risk'] =>
  command.type === 'proposal.approve'
    ? { level: 'medium', reasons: ['Approving proposals changes human approval state and must preserve audit history.'] }
    : { level: 'low', reasons: ['Restoring an archived node changes semantic graph availability through reversible metadata.'] };

export const redacted = <T>(value: T): T => redactAiContextValue(value).value as T;
