/**
 * Purpose: Execute display-compatible text overlay controls on the Client runtime.
 */
import type { Writable } from 'svelte/store';
import type { ShowTextPayload } from '@shugu/protocol';
import {
  createClearedClientTextOverlayState,
  createClientTextOverlayState,
  type ClientTextOverlayState,
} from '../client-text-overlay';

export type TextControlDeps = {
  textOverlay: Writable<ClientTextOverlayState>;
};

let textClearHandle: ReturnType<typeof setTimeout> | null = null;

function clearText(deps: TextControlDeps): void {
  if (textClearHandle) {
    clearTimeout(textClearHandle);
    textClearHandle = null;
  }
  deps.textOverlay.set(createClearedClientTextOverlayState());
}

export function executeTextControl(deps: TextControlDeps, action: string, payload: unknown): boolean {
  switch (action) {
    case 'showText': {
      clearText(deps);
      const state = createClientTextOverlayState(payload as ShowTextPayload);
      deps.textOverlay.set(state);
      if (state.visible && typeof state.duration === 'number') {
        textClearHandle = setTimeout(() => clearText(deps), state.duration);
      }
      return true;
    }
    case 'hideText':
      clearText(deps);
      return true;
    default:
      return false;
  }
}
