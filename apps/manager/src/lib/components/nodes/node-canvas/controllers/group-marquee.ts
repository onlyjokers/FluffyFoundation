/**
 * Purpose: Manage marquee selection pointer state for the group controller.
 */
import type { Writable } from 'svelte/store';
import type { GraphViewAdapter } from '../adapters';

export type MarqueeRect = { left: number; top: number; width: number; height: number };

export type GroupMarqueeController = {
  start: (event: PointerEvent) => void;
  destroy: () => void;
};

export type GroupMarqueeControllerOptions = {
  marqueeRect: Writable<MarqueeRect | null>;
  getContainer: () => HTMLDivElement | null;
  getAdapter: () => GraphViewAdapter | null;
  setSelectedNodeIds: (ids: Set<string>) => void;
  onSelectionComplete: () => void;
};

export function createGroupMarqueeController(opts: GroupMarqueeControllerOptions): GroupMarqueeController {
  let isDragging = false;
  let start = { x: 0, y: 0 };
  let current = { x: 0, y: 0 };
  let pointerId: number | null = null;
  let moveHandler: ((event: PointerEvent) => void) | null = null;
  let upHandler: ((event: PointerEvent) => void) | null = null;

  const toContainerPoint = (clientX: number, clientY: number): { x: number; y: number } => {
    const container = opts.getContainer();
    if (!container) return { x: 0, y: 0 };
    const rect = container.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const destroy = () => {
    isDragging = false;
    pointerId = null;
    if (moveHandler) window.removeEventListener('pointermove', moveHandler, { capture: true });
    if (upHandler) {
      window.removeEventListener('pointerup', upHandler, { capture: true });
      window.removeEventListener('pointercancel', upHandler, { capture: true });
    }
    moveHandler = null;
    upHandler = null;
  };

  const startMarquee = (event: PointerEvent) => {
    destroy();
    isDragging = true;
    pointerId = event.pointerId;
    start = toContainerPoint(event.clientX, event.clientY);
    current = start;
    opts.marqueeRect.set({ left: start.x, top: start.y, width: 0, height: 0 });

    moveHandler = (ev: PointerEvent) => {
      if (!isDragging) return;
      if (pointerId !== null && ev.pointerId !== pointerId) return;
      current = toContainerPoint(ev.clientX, ev.clientY);
      const left = Math.min(start.x, current.x);
      const top = Math.min(start.y, current.y);
      const width = Math.abs(start.x - current.x);
      const height = Math.abs(start.y - current.y);
      opts.marqueeRect.set({ left, top, width, height });
    };

    upHandler = (ev: PointerEvent) => {
      if (pointerId !== null && ev.pointerId !== pointerId) return;
      const selLeft = Math.min(start.x, current.x);
      const selTop = Math.min(start.y, current.y);
      const selRight = Math.max(start.x, current.x);
      const selBottom = Math.max(start.y, current.y);
      destroy();

      const adapter = opts.getAdapter();
      if (!adapter) return;
      const t = adapter.getViewportTransform();
      const rect = {
        left: (selLeft - t.tx) / t.k,
        top: (selTop - t.ty) / t.k,
        right: (selRight - t.tx) / t.k,
        bottom: (selBottom - t.ty) / t.k,
      };
      opts.setSelectedNodeIds(new Set(adapter.getNodesInRect(rect).map(String)));
      opts.onSelectionComplete();
      opts.marqueeRect.set(null);
    };

    window.addEventListener('pointermove', moveHandler, { capture: true });
    window.addEventListener('pointerup', upHandler, { capture: true });
    window.addEventListener('pointercancel', upHandler, { capture: true });
  };

  return { start: startMarquee, destroy };
}
