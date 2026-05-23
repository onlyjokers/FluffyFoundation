// Purpose: Tests for the ClientUI runtime store used by client-rendered node UI.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clientUiRuntime,
  getClientUiSnapshot,
  resetClientUiRuntime,
} from './client-ui-runtime';

describe('clientUiRuntime', () => {
  it('consumes button presses as one-shot pulses', () => {
    resetClientUiRuntime();
    clientUiRuntime.setClientUiDisplay('button-1', true, 'button');
    clientUiRuntime.pressButton('button-1');

    assert.equal(clientUiRuntime.consumeClientButtonPressed('button-1'), true);
    assert.equal(clientUiRuntime.consumeClientButtonPressed('button-1'), false);
  });

  it('latches firstInputed when input content is submitted', () => {
    resetClientUiRuntime();
    clientUiRuntime.setClientUiDisplay('input-1', true, 'input');
    clientUiRuntime.submitInput('input-1', 'hello');

    assert.deepEqual(clientUiRuntime.getClientUiState('input-1'), {
      displayed: true,
      kind: 'input',
      pressed: false,
      inputContent: 'hello',
      firstInputed: true,
    });
  });

  it('clears hidden or removed nodes from the render snapshot', () => {
    resetClientUiRuntime();
    clientUiRuntime.setClientUiDisplay('button-1', true, 'button');
    clientUiRuntime.setClientUiDisplay('input-1', true, 'input');
    clientUiRuntime.setClientUiDisplay('button-1', false, 'button');
    clientUiRuntime.clearClientUiNode('input-1');

    assert.deepEqual(getClientUiSnapshot(), []);
  });
});
