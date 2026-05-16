/**
 * Purpose: Verify manager JSON command specs can emit Display text overlay controls.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createCommandProcess } from './register/command-mapping';
import displayTextSpec from './proc-display-text.json' assert { type: 'json' };

test('proc-display-text maps text input to a showText control command', () => {
  const process = createCommandProcess(displayTextSpec.runtime);
  const output = process(
    { text: '你好，AI 已收到' },
    {
      text: 'fallback',
      color: '#ffffff',
      backgroundColor: 'rgba(0, 0, 0, 0.72)',
      durationMs: 0,
    },
    { nodeId: 'n-display-text' }
  );

  assert.deepEqual(output, {
    cmd: {
      action: 'showText',
      payload: {
        text: '你好，AI 已收到',
        color: '#ffffff',
        backgroundColor: 'rgba(0, 0, 0, 0.72)',
      },
    },
  });
});
