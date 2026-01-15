// Purpose: Bind custom-node UI events to NodeCanvas handlers.
import { getString } from '$lib/utils/value-guards';

type EventHandlers = {
  onUncouple: (nodeId: string) => void;
  onExpand: (nodeId: string) => void;
  windowRef?: Window;
};

export const bindCustomNodeEvents = (handlers: EventHandlers) => {
  const win = handlers.windowRef ?? window;

  const readNodeId = (event: Event): string => {
    const detail = (event as CustomEvent<Record<string, unknown>>).detail ?? {};
    return getString(detail?.nodeId, '');
  };

  const onCustomNodeUncouple: EventListener = (event) => {
    const nodeId = readNodeId(event);
    if (!nodeId) return;
    handlers.onUncouple(nodeId);
  };
  win.addEventListener('shugu:custom-node-uncouple', onCustomNodeUncouple);

  const onCustomNodeExpand: EventListener = (event) => {
    const nodeId = readNodeId(event);
    if (!nodeId) return;
    handlers.onExpand(nodeId);
  };
  win.addEventListener('shugu:custom-node-expand', onCustomNodeExpand);

  const cleanup = () => {
    win.removeEventListener('shugu:custom-node-uncouple', onCustomNodeUncouple);
    win.removeEventListener('shugu:custom-node-expand', onCustomNodeExpand);
  };

  return { onCustomNodeUncouple, onCustomNodeExpand, cleanup };
};
