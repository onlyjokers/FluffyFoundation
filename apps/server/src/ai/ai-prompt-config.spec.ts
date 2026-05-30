/**
 * Purpose: Verify AI system prompt resolution keeps the editable prompt file as the default source.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { loadAiSystemPromptFromEnv } from './ai-prompt-config.js';

test('loads the repository editable system prompt file when no env override is set', () => {
  const previousInline = process.env.SHUGU_AI_SYSTEM_PROMPT;
  const previousFile = process.env.SHUGU_AI_SYSTEM_PROMPT_FILE;
  delete process.env.SHUGU_AI_SYSTEM_PROMPT;
  delete process.env.SHUGU_AI_SYSTEM_PROMPT_FILE;

  try {
    const prompt = loadAiSystemPromptFromEnv();
    assert.match(prompt.source, /apps\/server\/prompts\/ai-orchestrator\.system\.txt$/);
    assert.match(prompt.systemPrompt, /AgentActionPlan v1/);
    assert.match(prompt.systemPrompt, /Return only one valid JSON object/);
    assert.match(prompt.systemPrompt, /explicitly asks to add, create, delete, remove, connect, or disconnect/);
  } finally {
    if (previousInline === undefined) {
      delete process.env.SHUGU_AI_SYSTEM_PROMPT;
    } else {
      process.env.SHUGU_AI_SYSTEM_PROMPT = previousInline;
    }
    if (previousFile === undefined) {
      delete process.env.SHUGU_AI_SYSTEM_PROMPT_FILE;
    } else {
      process.env.SHUGU_AI_SYSTEM_PROMPT_FILE = previousFile;
    }
  }
});
