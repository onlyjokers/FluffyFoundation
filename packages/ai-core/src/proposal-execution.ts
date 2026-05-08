/**
 * Purpose: Execute approved FF-18/FF-19 AI semantic proposals through an injected command bus with local policy, audit, and rollback metadata.
 */

import type { AiSemanticActor, AiSemanticCommand, AiDryRunCommandResult } from './deterministic-planner.js';
import { hashAiPrompt } from './prompt-hash.js';

export type AiProposalApproval = {
  approvedBy: string;
  approvedAt: string;
};

export type AiExecutableProposal = {
  id: string;
  title: string;
  commands: AiSemanticCommand[];
  status?: 'draft' | 'proposed' | 'accepted' | 'rejected';
};

export type AiProposalExecutionPolicy = {
  allowedOperations: string[];
  approvalRequiredOperations: string[];
  deniedOperations: string[];
};

export type AiPolicyDecision = {
  operation: string;
  status: 'allowed' | 'approval-required' | 'denied';
  reason?: string;
};

export type AiProposalExecutionPolicyResult = {
  status: 'allowed' | 'approval-required' | 'denied';
  decisions: AiPolicyDecision[];
  approval?: AiProposalApproval;
};

export type AiProposalDryRunStage = {
  ok: boolean;
  results: AiDryRunCommandResult[];
};

export type AiProposalExecutionHistoryEntry = {
  id: string;
  proposalId: string;
  actor: AiSemanticActor;
  status: 'applied';
  commandCount: number;
  previousRevision: number;
  appliedRevision: number;
  rollbackReference: string;
  createdAt: string;
};

export type AiProposalExecutionAuditEntry =
  | {
      id: string;
      type: 'proposal-execution';
      proposalId: string;
      actor: AiSemanticActor;
      lifecycle: Array<'policy' | 'dry-run' | 'apply' | 'audit' | 'history' | 'rollback-token'>;
      promptHash: string;
      snapshotRevision: number;
      validation: { ok: boolean; errorCount: number };
      policy: AiProposalExecutionPolicyResult;
      approval: { status: 'not-required' | 'missing' | 'approved'; approvedBy?: string; approvedAt?: string };
      execution: { status: AiProposalExecutionResultStatus; appliedCommandCount: number };
      observation: { status: 'not-provided' | 'observed'; summary?: string };
      rollback: { reference: string | null; commandRollbackTokens: string[] };
      commandAudits: unknown[];
      previousRevision: number;
      appliedRevision: number | null;
      rollbackReference: string | null;
      createdAt: string;
    }
  | {
      id: string;
      type: 'rollback';
      rollbackReference: string;
      ok: boolean;
      restoredRevision: number;
      createdAt: string;
    };

export type AiProposalRollbackMetadata = {
  reference: string | null;
  commandRollbackTokens: string[];
  previousRevision: number | null;
  appliedRevision: number | null;
};

export type AiProposalExecutionResultStatus =
  | 'applied'
  | 'approval-required'
  | 'policy-denied'
  | 'dry-run-failed'
  | 'apply-failed';

export type AiProposalExecutionResult = {
  status: AiProposalExecutionResultStatus;
  proposalId: string;
  commandSequence: AiSemanticCommand[];
  policy: AiProposalExecutionPolicyResult;
  dryRun: AiProposalDryRunStage;
  appliedResults: AiDryRunCommandResult[];
  previousRevision: number | null;
  appliedRevision: number | null;
  audit: Extract<AiProposalExecutionAuditEntry, { type: 'proposal-execution' }>;
  historyEntry: AiProposalExecutionHistoryEntry | null;
  rollback: AiProposalRollbackMetadata;
};

export type AiProposalRollbackResult = {
  ok: boolean;
  reference: string;
  restoredRevision: number;
  message?: string;
  recovery?: unknown;
};

export type AiExecutionCommandBusLike = {
  getSnapshot: () => { revision?: number };
  dispatch: (input: {
    actor: AiSemanticActor;
    command: AiSemanticCommand;
    dryRun?: boolean;
  }) => AiDryRunCommandResult;
  rollback: (rollbackToken: string) => {
    ok: boolean;
    message?: string;
    recovery?: unknown;
    snapshot: { revision?: number };
  };
};

export type AiProposalExecutionCore = {
  executeProposal: (input: {
    actor: AiSemanticActor;
    proposal: AiExecutableProposal;
    approval?: AiProposalApproval;
    prompt?: string;
    observation?: { status?: string; summary?: string };
  }) => AiProposalExecutionResult;
  rollback: (rollbackReference: string | null | undefined) => AiProposalRollbackResult;
  getHistory: () => AiProposalExecutionHistoryEntry[];
  getAuditLog: () => AiProposalExecutionAuditEntry[];
};

const lifecycle: Extract<AiProposalExecutionAuditEntry, { type: 'proposal-execution' }>['lifecycle'] = [
  'policy',
  'dry-run',
  'apply',
  'audit',
  'history',
  'rollback-token',
];

const createdAt = () => new Date(0).toISOString();

const operationFor = (command: AiSemanticCommand): string => command.type;

const revisionOf = (snapshot: { revision?: number }): number =>
  Number.isFinite(snapshot.revision) ? Number(snapshot.revision) : 0;

const evaluatePolicy = (
  proposal: AiExecutableProposal,
  policy: AiProposalExecutionPolicy,
  approval?: AiProposalApproval
): AiProposalExecutionPolicyResult => {
  const denied = new Set(policy.deniedOperations);
  const approvalRequired = new Set(policy.approvalRequiredOperations);
  const allowed = new Set(policy.allowedOperations);
  const decisions = proposal.commands.map((command): AiPolicyDecision => {
    const operation = operationFor(command);
    if (denied.has(operation)) {
      return { operation, status: 'denied', reason: `Operation ${operation} is denied by local AI policy.` };
    }
    if (approvalRequired.has(operation) && !approval) {
      return {
        operation,
        status: 'approval-required',
        reason: `Operation ${operation} requires proposal approval.`,
      };
    }
    if (allowed.has(operation) || approvalRequired.has(operation)) return { operation, status: 'allowed' };
    return {
      operation,
      status: 'approval-required',
      reason: `Operation ${operation} is outside the local auto-execute allowlist.`,
    };
  });

  if (decisions.some((decision) => decision.status === 'denied')) return { status: 'denied', decisions, approval };
  if (decisions.some((decision) => decision.status === 'approval-required')) {
    return { status: 'approval-required', decisions, approval };
  }
  return { status: 'allowed', decisions, approval };
};

const approvalAuditFor = (
  policy: AiProposalExecutionPolicyResult,
  approval?: AiProposalApproval
): Extract<AiProposalExecutionAuditEntry, { type: 'proposal-execution' }>['approval'] => {
  const requiresApproval = policy.decisions.some((decision) => decision.status === 'approval-required');
  if (approval) {
    return { status: 'approved', approvedBy: approval.approvedBy, approvedAt: approval.approvedAt };
  }
  if (requiresApproval) return { status: 'missing' };
  return { status: 'not-required' };
};

const observationAuditFor = (
  observation?: { status?: string; summary?: string }
): Extract<AiProposalExecutionAuditEntry, { type: 'proposal-execution' }>['observation'] =>
  observation
    ? { status: 'observed', ...(observation.summary ? { summary: observation.summary } : {}) }
    : { status: 'not-provided' };

const dryRunCommands = (
  bus: AiExecutionCommandBusLike,
  actor: AiSemanticActor,
  commands: AiSemanticCommand[]
): AiProposalDryRunStage => {
  const results: AiDryRunCommandResult[] = [];
  for (const command of commands) {
    const result = bus.dispatch({ actor, command, dryRun: true });
    results.push(result);
    if (!result.ok) break;
  }
  return { ok: results.every((result) => result.ok), results };
};

const applyCommands = (
  bus: AiExecutionCommandBusLike,
  actor: AiSemanticActor,
  commands: AiSemanticCommand[]
): AiDryRunCommandResult[] => {
  const results: AiDryRunCommandResult[] = [];
  for (const command of commands) {
    const result = bus.dispatch({ actor, command, dryRun: false });
    results.push(result);
    if (!result.ok) break;
  }
  return results;
};

const rollbackReferenceFor = (proposalId: string, firstToken: string): string =>
  `ai-rollback:${proposalId}:${firstToken}`;

export function createAiProposalExecutionCore(input: {
  bus: AiExecutionCommandBusLike;
  policy: AiProposalExecutionPolicy;
}): AiProposalExecutionCore {
  const history: AiProposalExecutionHistoryEntry[] = [];
  const auditLog: AiProposalExecutionAuditEntry[] = [];
  const rollbackTokens = new Map<string, string>();

  const executeProposal: AiProposalExecutionCore['executeProposal'] = ({
    actor,
    proposal,
    approval,
    prompt,
    observation,
  }) => {
    const previousRevision = revisionOf(input.bus.getSnapshot());
    const policy = evaluatePolicy(proposal, input.policy, approval);
    const blockedStatus = policy.status === 'denied' ? 'policy-denied' : 'approval-required';
    const shouldStopBeforeDryRun = policy.status === 'denied';
    const shouldStopBeforeApply = policy.status !== 'allowed';
    const dryRun = shouldStopBeforeDryRun ? { ok: false, results: [] } : dryRunCommands(input.bus, actor, proposal.commands);
    const appliedResults = !shouldStopBeforeApply && dryRun.ok ? applyCommands(input.bus, actor, proposal.commands) : [];
    const failedApply = appliedResults.some((result) => !result.ok);
    const appliedRevision = appliedResults.length > 0 && !failedApply ? revisionOf(input.bus.getSnapshot()) : null;
    const firstRollbackToken = appliedResults.find((result) => result.ok)?.rollbackToken;
    const rollbackReference = firstRollbackToken ? rollbackReferenceFor(proposal.id, firstRollbackToken) : null;
    if (firstRollbackToken && rollbackReference) rollbackTokens.set(rollbackReference, firstRollbackToken);

    const commandAudits = appliedResults.flatMap((result) => (result.audit ? [result.audit] : []));
    const status: AiProposalExecutionResultStatus = shouldStopBeforeDryRun
      ? blockedStatus
      : shouldStopBeforeApply
        ? blockedStatus
        : !dryRun.ok
          ? 'dry-run-failed'
          : failedApply
            ? 'apply-failed'
            : 'applied';
    const validationErrors = dryRun.results.flatMap((result) => result.validationErrors ?? []);
    const commandRollbackTokens = appliedResults.flatMap((result) =>
      result.ok && result.rollbackToken ? [result.rollbackToken] : []
    );
    const audit: Extract<AiProposalExecutionAuditEntry, { type: 'proposal-execution' }> = {
      id: `audit:ai:${proposal.id}:${auditLog.length + 1}`,
      type: 'proposal-execution',
      proposalId: proposal.id,
      actor: { ...actor },
      lifecycle: [...lifecycle],
      promptHash: hashAiPrompt(prompt),
      snapshotRevision: previousRevision,
      validation: { ok: dryRun.ok, errorCount: validationErrors.length },
      policy,
      approval: approvalAuditFor(policy, approval),
      execution: { status, appliedCommandCount: appliedResults.filter((result) => result.ok).length },
      observation: observationAuditFor(observation),
      rollback: { reference: rollbackReference, commandRollbackTokens },
      commandAudits,
      previousRevision,
      appliedRevision,
      rollbackReference,
      createdAt: createdAt(),
    };
    auditLog.push(audit);

    let historyEntry: AiProposalExecutionHistoryEntry | null = null;
    if (!shouldStopBeforeApply && dryRun.ok && !failedApply && appliedRevision !== null && rollbackReference) {
      historyEntry = {
        id: `history:ai:${proposal.id}:${history.length + 1}`,
        proposalId: proposal.id,
        actor: { ...actor },
        status: 'applied',
        commandCount: proposal.commands.length,
        previousRevision,
        appliedRevision,
        rollbackReference,
        createdAt: createdAt(),
      };
      history.push(historyEntry);
    }

    return {
      status,
      proposalId: proposal.id,
      commandSequence: [...proposal.commands],
      policy,
      dryRun,
      appliedResults,
      previousRevision,
      appliedRevision,
      audit,
      historyEntry,
      rollback: {
        reference: rollbackReference,
        commandRollbackTokens,
        previousRevision,
        appliedRevision,
      },
    };
  };

  const rollback: AiProposalExecutionCore['rollback'] = (rollbackReference) => {
    const reference = String(rollbackReference ?? '');
    const rollbackToken = rollbackTokens.get(reference);
    if (!rollbackToken) return { ok: false, reference, restoredRevision: revisionOf(input.bus.getSnapshot()), message: 'Rollback reference not found.' };

    const result = input.bus.rollback(rollbackToken);
    const restoredRevision = revisionOf(result.snapshot);
    auditLog.push({
      id: `audit:ai:rollback:${auditLog.length + 1}`,
      type: 'rollback',
      rollbackReference: reference,
      ok: result.ok,
      restoredRevision,
      ...(result.message ? { message: result.message } : {}),
      createdAt: createdAt(),
    });
    return {
      ok: result.ok,
      reference,
      restoredRevision,
      ...(result.message ? { message: result.message } : {}),
      ...(result.recovery ? { recovery: result.recovery } : {}),
    };
  };

  return {
    executeProposal,
    rollback,
    getHistory: () => [...history],
    getAuditLog: () => [...auditLog],
  };
}
