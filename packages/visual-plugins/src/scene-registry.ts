/**
 * Purpose: Central registry for mapping protocol scene types to visual plugin ids.
 */

import type { VisualSceneLayerItem } from '@shugu/protocol';

export type VisualSceneType = VisualSceneLayerItem['type'];

const SCENE_TYPE_TO_ID: Record<VisualSceneType, string | null> = {
  box: 'box-scene',
  mel: 'mel-scene',
  frontCamera: null,
  backCamera: null,
  fctTrack: 'fct-track-scene',
};

export function sceneIdForType(type: VisualSceneType): string | null {
  return SCENE_TYPE_TO_ID[type] ?? null;
}

export function sceneIdsFromLayer(items: VisualSceneLayerItem[] | unknown[]): string[] {
  if (!Array.isArray(items)) return [];
  const ids: string[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const type = (item as { type?: unknown }).type;
    if (typeof type !== 'string') continue;
    const id = sceneIdForType(type as VisualSceneType);
    if (id) ids.push(id);
  }

  return ids;
}

export function sceneLayersFromItems(
  items: VisualSceneLayerItem[] | unknown[]
): Array<{ key: string; sceneId: string; options: Record<string, unknown> }> {
  if (!Array.isArray(items)) return [];
  const layers: Array<{ key: string; sceneId: string; options: Record<string, unknown> }> = [];

  items.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const type = (item as { type?: unknown }).type;
    if (typeof type !== 'string') return;
    const sceneId = sceneIdForType(type as VisualSceneType);
    if (!sceneId) return;
    layers.push({
      key: `${index}-${type}`,
      sceneId,
      options: item as Record<string, unknown>,
    });
  });

  return layers;
}
