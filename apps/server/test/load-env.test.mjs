/**
 * Purpose: Verify the server bootstrap loader can read local root .env files for AI runtime config.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadOptionalEnv } from '../dist-out/bootstrap/load-env.js';

test('loadOptionalEnv loads AI config from the repository root .env without overriding existing values', () => {
  const cwd = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-load-env-'));
  const previous = {
    SHUGU_AI_PROVIDER: process.env.SHUGU_AI_PROVIDER,
    SHUGU_AI_OPENAI_MODEL: process.env.SHUGU_AI_OPENAI_MODEL,
    SHUGU_AI_OPENAI_BASE_URL: process.env.SHUGU_AI_OPENAI_BASE_URL,
    SHUGU_AI_OPENAI_CHAT_COMPLETIONS_URL: process.env.SHUGU_AI_OPENAI_CHAT_COMPLETIONS_URL,
    SHUGU_AI_OPENAI_API_KEY: process.env.SHUGU_AI_OPENAI_API_KEY,
  };

  try {
    fs.writeFileSync(
      path.join(tempRoot, '.env'),
      [
        'SHUGU_AI_PROVIDER=openai-compatible',
        'SHUGU_AI_OPENAI_MODEL=gpt-5.5',
        'SHUGU_AI_OPENAI_BASE_URL=https://code.b886.top/v1',
        'SHUGU_AI_OPENAI_CHAT_COMPLETIONS_URL=https://code.b886.top/v1/chat/completions',
        'SHUGU_AI_OPENAI_API_KEY=test-secret',
      ].join('\n'),
      'utf8'
    );

    process.chdir(tempRoot);
    delete process.env.SHUGU_AI_PROVIDER;
    delete process.env.SHUGU_AI_OPENAI_MODEL;
    delete process.env.SHUGU_AI_OPENAI_BASE_URL;
    delete process.env.SHUGU_AI_OPENAI_CHAT_COMPLETIONS_URL;
    delete process.env.SHUGU_AI_OPENAI_API_KEY;

    const result = loadOptionalEnv();

    assert.equal(fs.realpathSync(result.loadedFrom), fs.realpathSync(path.join(tempRoot, '.env')));
    assert.deepEqual(result.keys.sort(), [
      'SHUGU_AI_OPENAI_API_KEY',
      'SHUGU_AI_OPENAI_BASE_URL',
      'SHUGU_AI_OPENAI_CHAT_COMPLETIONS_URL',
      'SHUGU_AI_OPENAI_MODEL',
      'SHUGU_AI_PROVIDER',
    ]);
    assert.equal(process.env.SHUGU_AI_PROVIDER, 'openai-compatible');
    assert.equal(process.env.SHUGU_AI_OPENAI_MODEL, 'gpt-5.5');
    assert.equal(process.env.SHUGU_AI_OPENAI_BASE_URL, 'https://code.b886.top/v1');
    assert.equal(
      process.env.SHUGU_AI_OPENAI_CHAT_COMPLETIONS_URL,
      'https://code.b886.top/v1/chat/completions'
    );
    assert.equal(process.env.SHUGU_AI_OPENAI_API_KEY, 'test-secret');

    process.env.SHUGU_AI_OPENAI_MODEL = 'keep-existing';
    const secondResult = loadOptionalEnv();
    assert.equal(secondResult.keys.includes('SHUGU_AI_OPENAI_MODEL'), false);
    assert.equal(process.env.SHUGU_AI_OPENAI_MODEL, 'keep-existing');
  } finally {
    process.chdir(cwd);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
