// Purpose: Verify clientUi control commands update the ClientUI runtime store.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getClientUiSnapshot, resetClientUiRuntime } from '../client-ui-runtime';
import { executeClientUiControl } from './client-ui-control-handler';

describe('executeClientUiControl', () => {
  it('applies clientUi payloads to the rendered ClientUI snapshot', () => {
    resetClientUiRuntime();

    const handled = executeClientUiControl('clientUi', {
      items: [
        { type: 'button', nodeId: 'button-1' },
        { type: 'input', nodeId: 'input-1' },
      ],
    });

    assert.equal(handled, true);
    assert.deepEqual(getClientUiSnapshot(), [
      {
        displayed: true,
        kind: 'button',
        pressed: false,
        inputContent: '',
        firstInputed: false,
      },
      {
        displayed: true,
        kind: 'input',
        pressed: false,
        inputContent: '',
        firstInputed: false,
      },
    ]);
  });
});
