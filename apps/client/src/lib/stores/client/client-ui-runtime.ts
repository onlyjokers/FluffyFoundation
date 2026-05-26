// Purpose: Client-side runtime state for ClientUI nodes rendered by the Client app.
import type { ClientUiPayload } from '@shugu/protocol';
import { get, writable } from 'svelte/store';

export type ClientUiKind = 'button' | 'input';

export type ClientUiNodeState = {
  displayed: boolean;
  kind: ClientUiKind;
  pressed: boolean;
  inputContent: string;
  firstInputed: boolean;
};

export type ClientUiInteractionEvent = ClientUiNodeState & { nodeId: string };

const createDefaultState = (kind: ClientUiKind): ClientUiNodeState => ({
  displayed: false,
  kind,
  pressed: false,
  inputContent: '',
  firstInputed: false,
});

const clientUiNodes = writable<Map<string, ClientUiNodeState>>(new Map());
const interactionListeners = new Set<(event: ClientUiInteractionEvent) => void>();

const emitInteraction = (nodeId: string, state: ClientUiNodeState): void => {
  const event: ClientUiInteractionEvent = { ...state, nodeId };
  for (const listener of interactionListeners) {
    listener(event);
  }
};

const updateNode = (
  nodeId: string,
  kind: ClientUiKind,
  updater: (state: ClientUiNodeState) => ClientUiNodeState
): ClientUiNodeState | null => {
  const id = String(nodeId ?? '').trim();
  if (!id) return null;
  let updatedState: ClientUiNodeState | null = null;
  clientUiNodes.update((prev) => {
    const next = new Map(prev);
    const current = next.get(id) ?? createDefaultState(kind);
    updatedState = updater({ ...current, kind });
    next.set(id, updatedState);
    return next;
  });
  return updatedState;
};

export const clientUiRuntime = {
  subscribe: clientUiNodes.subscribe,

  applyPayload(payload: ClientUiPayload): void {
    const rawItems = Array.isArray(payload?.items) ? payload.items : [];
    clientUiNodes.update((prev) => {
      const next = new Map<string, ClientUiNodeState>(
        Array.from(prev.entries()).map(([nodeId, state]) => [
          nodeId,
          { ...state, displayed: false, pressed: false },
        ])
      );
      for (const item of rawItems) {
        const nodeId = typeof item?.nodeId === 'string' ? item.nodeId.trim() : '';
        if (!nodeId) continue;
        if (item.type !== 'button' && item.type !== 'input') continue;
        const previous = prev.get(nodeId);
        next.set(nodeId, {
          ...(previous ?? createDefaultState(item.type)),
          kind: item.type,
          displayed: true,
        });
      }
      return next;
    });
  },

  getClientUiState(nodeId: string): ClientUiNodeState | null {
    const id = String(nodeId ?? '').trim();
    if (!id) return null;
    return get(clientUiNodes).get(id) ?? null;
  },

  onInteraction(listener: (event: ClientUiInteractionEvent) => void): () => void {
    interactionListeners.add(listener);
    return () => interactionListeners.delete(listener);
  },

  pressButton(nodeId: string): void {
    const id = String(nodeId ?? '').trim();
    const state = updateNode(id, 'button', (current) => ({
      ...current,
      displayed: true,
      pressed: true,
    }));
    if (id && state) emitInteraction(id, state);
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
    const id = String(nodeId ?? '').trim();
    const state = updateNode(id, 'input', (current) => ({
      ...current,
      displayed: true,
      inputContent: String(value ?? ''),
      firstInputed: true,
    }));
    if (id && state) emitInteraction(id, state);
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
