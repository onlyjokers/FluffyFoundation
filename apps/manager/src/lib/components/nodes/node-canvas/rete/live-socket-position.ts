/**
 * Purpose: Socket position watcher that keeps DOM sockets aligned after layout changes.
 */
import type { BaseSchemes, Scope } from 'rete';
import { DOMSocketPosition } from 'rete-render-utils';

export class LiveDOMSocketPosition extends DOMSocketPosition<BaseSchemes, unknown> {
  private ro: ResizeObserver | null = null;
  private observed = new WeakSet<HTMLElement>();
  private elementToNodeId = new WeakMap<HTMLElement, string>();
  private pending = new Set<string>();
  private raf = 0;

  constructor(private onQueue: () => void = () => undefined) {
    super();
  }

  override attach(scope: Scope<never, [unknown]>) {
    super.attach(scope);
    if (typeof ResizeObserver === 'undefined') return;
    if (this.ro) return;

    this.ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const nodeId = this.elementToNodeId.get(entry.target as HTMLElement);
        if (nodeId) this.queue(nodeId);
      }
    });

    const area = this.area;
    if (!area) return;

    const observeAll = () => {
      if (!this.ro) return;
      for (const [id, view] of area.nodeViews?.entries?.() ?? []) {
        const el = view?.element as HTMLElement | undefined;
        if (!el) continue;
        if (this.observed.has(el)) continue;
        this.observed.add(el);
        this.elementToNodeId.set(el, String(id));
        try {
          this.ro.observe(el);
        } catch {
          // ignore
        }
      }
    };

    observeAll();
    area.addPipe((ctx) => {
      if (ctx?.type === 'rendered' && ctx.data?.type === 'node') {
        observeAll();
      }
      return ctx;
    });
  }

  destroy() {
    if (this.raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.pending.clear();
    this.ro?.disconnect();
    this.ro = null;
  }

  private queue(nodeId: string) {
    this.pending.add(nodeId);
    this.onQueue();
    if (typeof requestAnimationFrame === 'undefined') return;
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      void this.flush();
    });
  }

  private async flush() {
    const area = this.area;
    if (!area) return;
    const ids = Array.from(this.pending);
    this.pending.clear();

    for (const nodeId of ids) {
      const items = this.sockets
        ?.snapshot?.()
        ?.filter((item) => String(item.nodeId) === String(nodeId));
      if (!items || items.length === 0) continue;

      await Promise.all(
        items.map(async (item) => {
          const position = await this.calculatePosition(
            String(nodeId),
            item.side,
            String(item.key),
            item.element
          );
          if (position) item.position = position;
        })
      );

      this.emitter?.emit?.({ nodeId: String(nodeId) });
    }
  }

  override async calculatePosition(
    nodeId: string,
    side: 'input' | 'output',
    key: string,
    element: HTMLElement
  ) {
    const area = this.area;
    const view = area?.nodeViews?.get?.(String(nodeId));
    const nodeEl = view?.element as HTMLElement | undefined;
    const isHeaderSocket = Boolean(element.closest?.('.group-frame-gate-sockets'));
    const isGroupProxy = Boolean(
      nodeEl?.classList?.contains('group-proxy-input') || nodeEl?.classList?.contains('group-proxy-output')
    );

    if (!nodeEl) return super.calculatePosition(nodeId, side, key, element);
    if (!isHeaderSocket && !isGroupProxy) return super.calculatePosition(nodeId, side, key, element);

    const target = (element.querySelector?.('.socket') as HTMLElement | null) ?? element;
    const rect = target.getBoundingClientRect();
    const nodeRect = nodeEl.getBoundingClientRect();
    const k = Number(area?.transform?.k ?? 1) || 1;

    const local = {
      x: (rect.left - nodeRect.left + rect.width / 2) / k,
      y: (rect.top - nodeRect.top + rect.height / 2) / k,
    };

    const props = (this as { props?: { offset?: (pos: { x: number; y: number }, nodeId: string, side: string, key: string) => { x: number; y: number } } }).props;
    if (props?.offset) return props.offset(local, nodeId, side, key);

    return { x: local.x, y: local.y };
  }
}
