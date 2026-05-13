// Wheel zoom binding for the NodeCanvas Rete area.
import type { BaseSchemes } from 'rete';
import type { AreaPlugin } from 'rete-area-plugin';

import { normalizeAreaTransform } from '../utils/view-utils';

type AnyAreaPlugin = AreaPlugin<BaseSchemes, unknown>;

export type CanvasWheelBindingOptions = {
  windowRef: Window;
  getContainer: () => HTMLDivElement | null;
  getAreaPlugin: () => AnyAreaPlugin | null | undefined;
  requestMinimapUpdate: () => void;
  requestFramesUpdate: () => void;
};

export function bindCanvasWheelZoom(options: CanvasWheelBindingOptions): (event: WheelEvent) => void {
  const onWheel = (event: WheelEvent) => {
    const target = event.target as HTMLElement | null;
    const container = options.getContainer();
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const hasBounds = bounds.width > 0 && bounds.height > 0;
    const within =
      hasBounds &&
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom;

    if (event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      if (!hasBounds) return;
    } else if (!within) {
      return;
    }

    if (target?.closest?.('.node-picker')) return;
    if (target?.closest?.('.minimap')) return;
    const tag = target?.tagName?.toLowerCase?.() ?? '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    const area = options.getAreaPlugin()?.area;
    if (!area) return;
    normalizeAreaTransform(area);

    const current = Number(area.transform?.k ?? 1) || 1;
    let deltaY = event.deltaY;
    if (event.deltaMode === 1) deltaY *= 16;
    if (event.deltaMode === 2) deltaY *= container.clientHeight || 1;
    if (!deltaY) return;

    const abs = Math.abs(deltaY);
    const isFine = abs < 10;
    const speed = event.ctrlKey ? 0.02 : isFine ? 0.012 : 0.0022;
    const zoomFactor = Math.exp(-deltaY * speed);

    const minZoom = 0.2;
    const maxZoom = 2.5;
    const next = Math.max(minZoom, Math.min(maxZoom, current * zoomFactor));
    const ratio = next / current - 1;
    if (ratio === 0) return;

    const rectEl: HTMLElement | null = area?.content?.holder ?? container;
    const rect = rectEl?.getBoundingClientRect?.();
    if (!rect) return;

    if (!event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
    }

    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    const clientX = within ? event.clientX : clamp(event.clientX, bounds.left, bounds.right);
    const clientY = within ? event.clientY : clamp(event.clientY, bounds.top, bounds.bottom);

    const ox = (rect.left - clientX) * ratio;
    const oy = (rect.top - clientY) * ratio;
    void area.zoom(next, ox, oy, 'wheel');
    options.requestMinimapUpdate();
    options.requestFramesUpdate();
  };

  options.windowRef.addEventListener('wheel', onWheel, { passive: false, capture: true });
  return onWheel;
}
