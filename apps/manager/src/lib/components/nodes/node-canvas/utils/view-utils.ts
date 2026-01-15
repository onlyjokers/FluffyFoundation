/**
 * Purpose: Node graph view utilities shared across overlays and controllers.
 */
import type { BaseSchemes } from 'rete';
import type { AreaPlugin } from 'rete-area-plugin';

export type AreaTransform = { k: number; tx: number; ty: number };
export type NodeBounds = { left: number; top: number; right: number; bottom: number };

type AnyAreaPlugin = AreaPlugin<BaseSchemes, unknown>;
type AreaTransformTarget = { transform: { k?: number; x?: number; y?: number } };

export function normalizeAreaTransform(area: AreaTransformTarget) {
  const k = Number(area?.transform?.k);
  const x = Number(area?.transform?.x);
  const y = Number(area?.transform?.y);

  if (!Number.isFinite(k) || k <= 0) area.transform.k = 1;
  if (!Number.isFinite(x)) area.transform.x = 0;
  if (!Number.isFinite(y)) area.transform.y = 0;
}

export function readAreaTransform(areaPlugin: AnyAreaPlugin | null | undefined): AreaTransform | null {
  if (!areaPlugin?.area) return null;
  const area = areaPlugin.area;
  normalizeAreaTransform(area);
  const k = Number(area.transform?.k ?? 1) || 1;
  const tx = Number(area.transform?.x ?? 0) || 0;
  const ty = Number(area.transform?.y ?? 0) || 0;
  return { k, tx, ty };
}

export function readNodeBounds(
  areaPlugin: AnyAreaPlugin | null | undefined,
  nodeId: string,
  t: AreaTransform
): NodeBounds | null {
  if (!areaPlugin?.nodeViews) return null;
  const view = areaPlugin.nodeViews.get(String(nodeId));
  const el = view?.element as HTMLElement | undefined;
  const pos = view?.position as { x: number; y: number } | undefined;
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return null;

  const width = (el?.clientWidth ?? 230) * t.k;
  const height = (el?.clientHeight ?? 100) * t.k;
  const left = pos.x * t.k + t.tx;
  const top = pos.y * t.k + t.ty;
  return { left, top, right: left + width, bottom: top + height };
}

export function readNodeBoundsGraph(areaPlugin: AnyAreaPlugin | null | undefined, nodeId: string): NodeBounds | null {
  if (!areaPlugin?.nodeViews) return null;
  const view = areaPlugin.nodeViews.get(String(nodeId));
  const el = view?.element as HTMLElement | undefined;
  const pos = view?.position as { x: number; y: number } | undefined;
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return null;

  const width = el?.clientWidth ?? 230;
  const height = el?.clientHeight ?? 100;
  const left = pos.x;
  const top = pos.y;
  return { left, top, right: left + width, bottom: top + height };
}

export function unionBounds(
  areaPlugin: AnyAreaPlugin | null | undefined,
  nodeIds: string[],
  t: AreaTransform
): NodeBounds | null {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const nodeId of nodeIds) {
    const b = readNodeBounds(areaPlugin, nodeId, t);
    if (!b) continue;
    left = Math.min(left, b.left);
    top = Math.min(top, b.top);
    right = Math.max(right, b.right);
    bottom = Math.max(bottom, b.bottom);
  }

  const hasBounds =
    Number.isFinite(left) &&
    Number.isFinite(top) &&
    Number.isFinite(right) &&
    Number.isFinite(bottom);
  if (!hasBounds) return null;
  return { left, top, right, bottom };
}

export function unionBoundsGraph(areaPlugin: AnyAreaPlugin | null | undefined, nodeIds: string[]): NodeBounds | null {
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (const nodeId of nodeIds) {
    const b = readNodeBoundsGraph(areaPlugin, nodeId);
    if (!b) continue;
    left = Math.min(left, b.left);
    top = Math.min(top, b.top);
    right = Math.max(right, b.right);
    bottom = Math.max(bottom, b.bottom);
  }

  const hasBounds =
    Number.isFinite(left) &&
    Number.isFinite(top) &&
    Number.isFinite(right) &&
    Number.isFinite(bottom);
  if (!hasBounds) return null;
  return { left, top, right, bottom };
}
