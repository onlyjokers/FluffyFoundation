// Purpose: Client-side runtime state for ClientUI nodes rendered by the Client app.
import { get, writable } from 'svelte/store';

export type ClientUiKind = 'button' | 'input';

export type ClientUiNodeState = {
  displayed: boolean;
  kind: ClientUiKind;
  pressed: boolean;
  inputContent: string;
  firstInputed: boolean;
};

const createDefaultState = (kind: ClientUiKind): ClientUiNodeState => ({
  displayed: false,
  kind,
  pressed: false,
  inputContent: '',
  firstInputed: false,
});

const clientUiNodes = writable<Map<string, ClientUiNodeState>>(new Map());

const updateNode = (
  nodeId: string,
  kind: ClientUiKind,
  updater: (state: ClientUiNodeState) => ClientUiNodeState
): void => {
  const id = String(nodeId ?? '').trim();
  if (!id) return;
  clientUiNodes.update((prev) => {
    const next = new Map(prev);
    const current = next.get(id) ?? createDefaultState(kind);
    next.set(id, updater({ ...current, kind }));
    return next;
  });
};

export const clientUiRuntime = {
  subscribe: clientUiNodes.subscribe,

  getClientUiState(nodeId: string): ClientUiNodeState | null {
    const id = String(nodeId ?? '').trim();
    if (!id) return null;
    return get(clientUiNodes).get(id) ?? null;
  },

  setClientUiDisplay(nodeId: string, visible: boolean, kind: ClientUiKind): void {
    updateNode(nodeId, kind, (state) => ({ ...state, displayed: Boolean(visible), kind }));
  },

  pressButton(nodeId: string): void {
    updateNode(nodeId, 'button', (state) => ({ ...state, displayed: true, pressed: true }));
  },

  consumeClientButtonPressed(nodeId: string): boolean {
    const id = String(nodeId ?? '').trim();
    if (!id) return false;
    const current = get(clientUiNodes).get(id);
    const pressed = Boolean(current?.pressed);
    if (pressed) {
      clientUiNodes.update((prev) => {
        const next = new Map(prev);
        const state = next.get(id);
        if (state) next.set(id, { ...state, pressed: false });
        return next;
      });
    }
    return pressed;
  },

  submitInput(nodeId: string, value: string): void {
    updateNode(nodeId, 'input', (state) => ({
      ...state,
      displayed: true,
      inputContent: String(value ?? ''),
      firstInputed: true,
    }));
  },

  clearClientUiNode(nodeId: string): void {
    const id = String(nodeId ?? '').trim();
    if (!id) return;
    clientUiNodes.update((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  },

  clearClientUi(): void {
    clientUiNodes.set(new Map());
  },
};

export const getClientUiSnapshot = (): ClientUiNodeState[] =>
  Array.from(get(clientUiNodes).values()).filter((node) => node.displayed);

export const resetClientUiRuntime = (): void => {
  clientUiRuntime.clearClientUi();
};
