// Purpose: Tests for the ClientUI runtime store used by client-rendered node UI.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clientUiRuntime,
  type ClientUiInteractionEvent,
  getClientUiSnapshot,
  resetClientUiRuntime,
} from './client-ui-runtime';

describe('clientUiRuntime', () => {
  it('consumes button presses as one-shot pulses', () => {
    resetClientUiRuntime();
    clientUiRuntime.applyPayload({ items: [{ type: 'button', nodeId: 'button-1' }] });
    clientUiRuntime.pressButton('button-1');

    assert.equal(clientUiRuntime.consumeClientButtonPressed('button-1'), true);
    assert.equal(clientUiRuntime.consumeClientButtonPressed('button-1'), false);
  });

  it('latches firstInputed when input content is submitted', () => {
    resetClientUiRuntime();
    clientUiRuntime.applyPayload({ items: [{ type: 'input', nodeId: 'input-1' }] });
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
    clientUiRuntime.applyPayload({
      items: [
        { type: 'button', nodeId: 'button-1' },
        { type: 'input', nodeId: 'input-1' },
      ],
    });
    clientUiRuntime.applyPayload({ items: [] });

    assert.deepEqual(getClientUiSnapshot(), []);
  });

  it('keeps submitted input state when the same input remains in the next payload', () => {
    resetClientUiRuntime();
    clientUiRuntime.applyPayload({ items: [{ type: 'input', nodeId: 'input-1' }] });
    clientUiRuntime.submitInput('input-1', 'hello');
    clientUiRuntime.applyPayload({ items: [{ type: 'input', nodeId: 'input-1' }] });

    assert.equal(clientUiRuntime.getClientUiState('input-1')?.inputContent, 'hello');
    assert.equal(clientUiRuntime.getClientUiState('input-1')?.firstInputed, true);
  });

  it('clears stale button presses when a button is hidden and rendered again', () => {
    resetClientUiRuntime();
    clientUiRuntime.applyPayload({ items: [{ type: 'button', nodeId: 'button-1' }] });
    clientUiRuntime.pressButton('button-1');
    clientUiRuntime.applyPayload({ items: [] });
    clientUiRuntime.applyPayload({ items: [{ type: 'button', nodeId: 'button-1' }] });

    assert.equal(clientUiRuntime.consumeClientButtonPressed('button-1'), false);
  });

  it('notifies subscribers when ClientUI controls are used', () => {
    resetClientUiRuntime();
    const events: ClientUiInteractionEvent[] = [];
    const unsubscribe = clientUiRuntime.onInteraction((event) => events.push(event));

    try {
      clientUiRuntime.applyPayload({
        items: [
          { type: 'button', nodeId: 'button-1' },
          { type: 'input', nodeId: 'input-1' },
        ],
      });

      clientUiRuntime.pressButton('button-1');
      clientUiRuntime.submitInput('input-1', 'hello');
    } finally {
      unsubscribe();
    }

    assert.deepEqual(
      events.map(({ nodeId, kind, pressed, inputContent, firstInputed }) => ({
        nodeId,
        kind,
        pressed,
        inputContent,
        firstInputed,
      })),
      [
        {
          nodeId: 'button-1',
          kind: 'button',
          pressed: true,
          inputContent: '',
          firstInputed: false,
        },
        {
          nodeId: 'input-1',
          kind: 'input',
          pressed: false,
          inputContent: 'hello',
          firstInputed: true,
        },
      ]
    );
  });
});
