// Purpose: Coordinate projection helpers for the node canvas minimap.
import { get } from 'svelte/store';

export function createMinimapProjection(minimapStore: unknown) {
  const project = (value: number, axis: 'x' | 'y') => {
    const minimap = get(minimapStore as any) as any;
    const min = axis === 'x' ? minimap.bounds.minX : minimap.bounds.minY;
    const offset = axis === 'x' ? minimap.offsetX : minimap.offsetY;
    return offset + (value - min) * minimap.scale;
  };

  return {
    toMiniX: (value: number) => project(value, 'x'),
    toMiniY: (value: number) => project(value, 'y'),
  };
}
