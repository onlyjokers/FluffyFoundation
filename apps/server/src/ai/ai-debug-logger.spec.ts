/**
 * Purpose: Verify the AI debug logger creates inspectable JSONL records as soon as debug logging is enabled.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createAiDebugLogger } from './ai-debug-logger.js';

test('enabled debug logger writes an initialization record with resolved log path', () => {
  const logDir = mkdtempSync(join(tmpdir(), 'shugu-ai-debug-'));

  try {
    createAiDebugLogger({
      enabled: true,
      logDir,
      includePrompts: true,
      now: () => new Date('2026-05-17T03:00:00.000Z'),
    });

    const logPath = join(logDir, 'ai-agent-debug-2026-05-17.jsonl');
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    const first = JSON.parse(lines[0]) as Record<string, unknown>;
    assert.equal(first.kind, 'ai.debug.logger.ready');
    assert.equal(first.enabled, true);
    assert.equal(first.logDir, logDir);
    assert.equal(first.includePrompts, true);
  } finally {
    rmSync(logDir, { recursive: true, force: true });
  }
});
