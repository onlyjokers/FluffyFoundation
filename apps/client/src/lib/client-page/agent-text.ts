/**
 * Purpose: Normalize Client text input into AI Agent environment-event sensor payloads.
 */

export type AgentTextPayload = {
  kind: 'agent-text';
  text: string;
};

export function createAgentTextPayload(value: string): AgentTextPayload | null {
  const text = value.trim();
  if (!text) return null;
  return { kind: 'agent-text', text };
}
