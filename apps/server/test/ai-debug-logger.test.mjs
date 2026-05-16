/**
 * Purpose: Verify optional AI debug JSONL logging writes enough evidence without leaking secrets.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createAiDebugLogger } from '../dist-out/ai/ai-debug-logger.js';

test('AI debug logger writes JSONL records when enabled and redacts secret fields', () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-ai-debug-'));

  try {
    const logger = createAiDebugLogger({
      enabled: true,
      logDir,
      includePrompts: true,
      maxFieldChars: 10_000,
    });

    logger.write({
      kind: 'ai.turn.request',
      turnId: 'turn-1',
      apiKey: 'test-secret',
      headers: { Authorization: 'Bearer test-secret' },
      messages: [{ role: 'user', content: '你好' }],
    });

    const files = fs.readdirSync(logDir);
    assert.equal(files.length, 1);
    assert.match(files[0], /^ai-agent-debug-\d{4}-\d{2}-\d{2}\.jsonl$/);

    const line = fs.readFileSync(path.join(logDir, files[0]), 'utf8').trim();
    const record = JSON.parse(line);

    assert.equal(record.kind, 'ai.turn.request');
    assert.equal(record.turnId, 'turn-1');
    assert.equal(record.apiKey, '[REDACTED]');
    assert.equal(record.headers.Authorization, '[REDACTED]');
    assert.equal(record.messages[0].content, '你好');
    assert.equal(typeof record.timestamp, 'string');
  } finally {
    fs.rmSync(logDir, { recursive: true, force: true });
  }
});

test('AI debug logger stays silent when disabled', () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-ai-debug-disabled-'));

  try {
    const logger = createAiDebugLogger({ enabled: false, logDir });

    logger.write({ kind: 'ai.turn.request', turnId: 'turn-1', messages: [] });

    assert.deepEqual(fs.readdirSync(logDir), []);
  } finally {
    fs.rmSync(logDir, { recursive: true, force: true });
  }
});
