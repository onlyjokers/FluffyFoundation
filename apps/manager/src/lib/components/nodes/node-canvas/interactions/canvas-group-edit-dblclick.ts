// Double-click handling for opening group edit mode from the canvas.
import { get } from 'svelte/store';
import type { BaseSchemes } from 'rete';
import type { AreaPlugin } from 'rete-area-plugin';

import type { GroupFrame } from '../controllers/group-controller';
import { readAreaTransform } from '../utils/view-utils';

type AnyAreaPlugin = AreaPlugin<BaseSchemes, unknown>;

type CanvasGroupEditDblClickOptions = {
  container: HTMLDivElement;
  getAreaPlugin: () => AnyAreaPlugin | null | undefined;
  groupFrames: Parameters<typeof get>[0];
  toggleGroupEditMode: (groupId: string) => void;
};

export function bindCanvasGroupEditDblClick(
  options: CanvasGroupEditDblClickOptions
): (event: MouseEvent) => void {
  const onDblClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest?.('.node')) return;
    if (target?.closest?.('.node-picker')) return;
    if (target?.closest?.('.marquee-actions')) return;
    if (target?.closest?.('.minimap')) return;
    if (target?.closest?.('.executor-logs')) return;
    if (target?.closest?.('.loop-frame-header')) return;
    if (target?.closest?.('.group-frame-header')) return;

    const tag = target?.tagName?.toLowerCase?.() ?? '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    const rect = options.container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const t = readAreaTransform(options.getAreaPlugin());
    if (!t) return;
    const gx = (x - t.tx) / t.k;
    const gy = (y - t.ty) / t.k;

    const frames = get(options.groupFrames) ?? [];
    let picked: GroupFrame | null = null;
    let bestDepth = -1;
    let bestArea = Number.POSITIVE_INFINITY;

    for (const frame of frames) {
      const left = Number(frame?.left);
      const top = Number(frame?.top);
      const width = Number(frame?.width);
      const height = Number(frame?.height);
      if (
        !Number.isFinite(left) ||
        !Number.isFinite(top) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height)
      )
        continue;

      const inside = gx >= left && gx <= left + width && gy >= top && gy <= top + height;
      if (!inside) continue;

      const depth = Number(frame?.depth ?? 0);
      const area = width * height;
      if (depth > bestDepth || (depth === bestDepth && area < bestArea)) {
        picked = frame;
        bestDepth = depth;
        bestArea = area;
      }
    }

    if (!picked?.group?.id) return;
    event.preventDefault();
    event.stopPropagation();
    options.toggleGroupEditMode(String(picked.group.id));
  };

  options.container.addEventListener('dblclick', onDblClick, { capture: true });
  return onDblClick;
}
