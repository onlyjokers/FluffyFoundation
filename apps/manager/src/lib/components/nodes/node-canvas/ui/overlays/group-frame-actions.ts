/**
 * Purpose: Svelte actions used by the group frame overlay.
 */
export function mountGateSockets(node: HTMLElement, nodeId: string | null) {
  let currentId = nodeId ? String(nodeId) : '';
  let rafId = 0;
  let retries = 0;
  const maxRetries = 10;
  let attached = false;

  const attachSockets = () => {
    if (!currentId) return;
    const target = document.querySelector(
      `.collapsed-sockets[data-rete-node-id="${currentId}"]`
    ) as HTMLElement | null;
    if (!target) return;
    if (target.parentElement === node) return;
    node.appendChild(target);
    attached = true;
  };

  const scheduleAttach = () => {
    if (!currentId || attached || retries >= maxRetries) return;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      retries += 1;
      attachSockets();
      scheduleAttach();
    });
  };

  attachSockets();
  scheduleAttach();

  return {
    update(nextId: string | null) {
      currentId = nextId ? String(nextId) : '';
      retries = 0;
      attached = false;
      attachSockets();
      scheduleAttach();
    },
    destroy() {
      if (rafId) cancelAnimationFrame(rafId);
    },
  };
}

export function createObserveActionOverflow(opts: {
  getCompact: (groupId: string) => boolean;
  setCompact: (groupId: string, compact: boolean) => void;
  clearCompact: (groupId: string) => void;
}) {
  return (node: HTMLElement, groupId: string) => {
    let currentId = String(groupId);
    let ro: ResizeObserver | null = null;
    let mo: MutationObserver | null = null;
    let raf = 0;
    const OVERFLOW_EPS = 2;
    const EXPAND_EPS = 24;

    const updateCompact = () => {
      if (!currentId) return;
      const hasOverflow = node.scrollWidth > node.clientWidth + OVERFLOW_EPS;
      const current = opts.getCompact(currentId);
      let next = current;
      if (!current && hasOverflow) next = true;
      if (current && !hasOverflow && node.clientWidth - node.scrollWidth > EXPAND_EPS) next = false;
      if (next !== current) opts.setCompact(currentId, next);
    };

    const scheduleCheck = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        updateCompact();
      });
    };

    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(scheduleCheck);
      ro.observe(node);
    }
    if (typeof MutationObserver !== 'undefined') {
      mo = new MutationObserver(scheduleCheck);
      mo.observe(node, { childList: true, subtree: true, characterData: true });
    }

    scheduleCheck();

    return {
      update(nextId: string) {
        if (currentId && currentId !== nextId) opts.clearCompact(currentId);
        currentId = String(nextId);
        scheduleCheck();
      },
      destroy() {
        if (raf) cancelAnimationFrame(raf);
        ro?.disconnect();
        mo?.disconnect();
        if (currentId) opts.clearCompact(currentId);
      },
    };
  };
}
