/**
 * Purpose: Load configurable AI orchestrator system prompts from env or disk.
 */

import { existsSync, readFileSync } from 'node:fs';

export const DEFAULT_AI_SYSTEM_PROMPT = [
  'You are the FluffyFoundation AI orchestrator.',
  'Return only one valid JSON object.',
  'Prefer AgentActionPlan v1: {"version":1,"id":"turn-id","summary":"...","actions":[...]}',
  'Allowed actions are setParam, addNode, connect, disconnect, and removeNode.',
  'Use only nodes, node types, ports, params, and bounds listed in capabilityManifest.',
  'Do not read or write canvas layout, node position, secrets, network, or denied surfaces.',
  'For a parameter connected to an upstream editable value node, still request the semantic target; the server will compile it safely.',
].join('\n');

export type AiPromptConfig = {
  systemPrompt: string;
  source: string;
};

export function loadAiSystemPromptFromEnv(): AiPromptConfig {
  const inline = process.env.SHUGU_AI_SYSTEM_PROMPT?.trim();
  if (inline) return { systemPrompt: inline, source: 'env:SHUGU_AI_SYSTEM_PROMPT' };

  const filePath = process.env.SHUGU_AI_SYSTEM_PROMPT_FILE?.trim();
  if (filePath && existsSync(filePath)) {
    return { systemPrompt: readFileSync(filePath, 'utf8'), source: filePath };
  }

  return { systemPrompt: DEFAULT_AI_SYSTEM_PROMPT, source: 'default' };
}
