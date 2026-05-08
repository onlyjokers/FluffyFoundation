/**
 * Purpose: Provide deterministic FF-19 AI safety classification, budget, and prompt-injection gates.
 */

import type { AiExecutableProposal, AiProposalExecutionPolicy } from './proposal-execution.js';
import type { AiSemanticActor } from './deterministic-planner.js';

export type AiProviderContract = {
  provider: string;
  model: string;
  maxPromptTokens: number;
  maxCompletionTokens: number;
  maxToolCalls: number;
  maxCommands: number;
};

export type AiProviderUsage = {
  promptTokens: number;
  completionTokens: number;
  toolCalls: number;
};

export type AiSafetyDecision = {
  operation: string;
  status: 'auto' | 'approval-required' | 'denied';
  reason?: string;
};

export type AiBudgetViolation = {
  field: 'promptTokens' | 'completionTokens' | 'toolCalls' | 'commands';
  limit: number;
  actual: number;
};

export type AiPromptInjectionSignal = {
  path: string;
  effect: 'ignored';
  pattern: string;
};

export type AiProposalSafetyClassification = {
  status: 'auto' | 'approval-required' | 'denied';
  actor: AiSemanticActor;
  provider: AiProviderContract;
  usage: AiProviderUsage;
  budget: {
    allowed: boolean;
    violations: AiBudgetViolation[];
  };
  decisions: AiSafetyDecision[];
  injectionSignals: AiPromptInjectionSignal[];
};

type ClassifyAiProposalSafetyInput = {
  actor: AiSemanticActor;
  proposal: AiExecutableProposal & { metadata?: unknown };
  policy: AiProposalExecutionPolicy;
  budget: AiProviderContract;
  usage: AiProviderUsage;
};

const injectionPattern = /(ignore previous|system:|you are root|grant .*permission|reveal .*key|allowedOperations)/i;

const operationFor = (command: { type: string }): string => command.type;

const decisionForOperation = (
  operation: string,
  policy: AiProposalExecutionPolicy
): AiSafetyDecision => {
  if (policy.deniedOperations.includes(operation)) {
    return { operation, status: 'denied', reason: `Operation ${operation} is denied by AI policy.` };
  }
  if (policy.approvalRequiredOperations.includes(operation)) {
    return {
      operation,
      status: 'approval-required',
      reason: `Operation ${operation} requires explicit approval.`,
    };
  }
  if (policy.allowedOperations.includes(operation)) return { operation, status: 'auto' };
  return {
    operation,
    status: 'approval-required',
    reason: `Operation ${operation} is outside the AI auto-execute allowlist.`,
  };
};

const budgetViolations = (
  budget: AiProviderContract,
  usage: AiProviderUsage,
  commandCount: number
): AiBudgetViolation[] => {
  const violations: AiBudgetViolation[] = [];
  if (usage.promptTokens > budget.maxPromptTokens) {
    violations.push({ field: 'promptTokens', limit: budget.maxPromptTokens, actual: usage.promptTokens });
  }
  if (usage.completionTokens > budget.maxCompletionTokens) {
    violations.push({
      field: 'completionTokens',
      limit: budget.maxCompletionTokens,
      actual: usage.completionTokens,
    });
  }
  if (usage.toolCalls > budget.maxToolCalls) {
    violations.push({ field: 'toolCalls', limit: budget.maxToolCalls, actual: usage.toolCalls });
  }
  if (commandCount > budget.maxCommands) {
    violations.push({ field: 'commands', limit: budget.maxCommands, actual: commandCount });
  }
  return violations;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const collectInjectionSignals = (value: unknown, path = 'proposal'): AiPromptInjectionSignal[] => {
  if (typeof value === 'string' && injectionPattern.test(value)) {
    return [{ path, effect: 'ignored', pattern: injectionPattern.source }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectInjectionSignals(item, `${path}.${index}`));
  }
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, item]) => collectInjectionSignals(item, `${path}.${key}`));
};

export function classifyAiProposalSafety(input: ClassifyAiProposalSafetyInput): AiProposalSafetyClassification {
  const decisions = input.proposal.commands.map((command) => decisionForOperation(operationFor(command), input.policy));
  const violations = budgetViolations(input.budget, input.usage, input.proposal.commands.length);
  const hasDenied = decisions.some((decision) => decision.status === 'denied') || violations.length > 0;
  const hasApprovalRequired = decisions.some((decision) => decision.status === 'approval-required');

  return {
    status: hasDenied ? 'denied' : hasApprovalRequired ? 'approval-required' : 'auto',
    actor: { ...input.actor },
    provider: { ...input.budget },
    usage: { ...input.usage },
    budget: {
      allowed: violations.length === 0,
      violations,
    },
    decisions,
    injectionSignals: collectInjectionSignals({
      title: input.proposal.title,
      metadata: input.proposal.metadata,
    }),
  };
}
