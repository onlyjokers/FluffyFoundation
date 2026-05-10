/**
 * Purpose: Published Group summaries and lightweight control helpers for the Manager console.
 */
import { derived, writable } from 'svelte/store';
import {
  targetGroup,
  type ControlAction,
  type ControlPayload,
  type PluginCommand,
  type PluginId,
  type ScreenColorPayload,
  type TargetSelector,
} from '@shugu/protocol';

export type PublishedGroup = {
  id: string;
  name: string;
  description?: string;
};

export type GroupControlSender = {
  sendControl: (
    target: TargetSelector,
    action: ControlAction,
    payload: ControlPayload,
    executeAt?: number
  ) => void;
  sendPluginControl?: (
    target: TargetSelector,
    pluginId: PluginId,
    command: PluginCommand,
    payload?: Record<string, unknown>
  ) => void;
};

export type PublishedGroupControl = {
  screenColor: (payload: ScreenColorPayload, executeAt?: number) => void;
  vibrate: (pattern: number[], executeAt?: number) => void;
  flashlight: (
    mode: 'off' | 'on' | 'blink',
    options?: { frequency?: number; dutyCycle?: number },
    executeAt?: number
  ) => void;
  stop: () => void;
};

const DEFAULT_GROUPS: PublishedGroup[] = [
  {
    id: 'audience',
    name: 'Audience',
    description: 'Default published audience Group',
  },
  {
    id: 'display',
    name: 'Display',
    description: 'Published Display Group for projection surfaces',
  },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function createPublishedGroup(input: unknown): PublishedGroup | null {
  const record = asRecord(input);
  if (!record) return null;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (!id) return null;
  const rawName = typeof record.name === 'string' ? record.name.trim() : '';
  const description = typeof record.description === 'string' ? record.description.trim() : '';

  return {
    id,
    name: rawName || id,
    ...(description ? { description } : {}),
  };
}

export function normalizePublishedGroups(input: unknown): PublishedGroup[] {
  if (!Array.isArray(input)) return [];
  const out: PublishedGroup[] = [];
  const seen = new Set<string>();

  for (const item of input) {
    const group = createPublishedGroup(item);
    if (!group || seen.has(group.id)) continue;
    seen.add(group.id);
    out.push(group);
  }

  return out;
}

export function buildPublishedGroupControl(
  group: PublishedGroup,
  sender: GroupControlSender
): PublishedGroupControl {
  const target = targetGroup(group.id);
  const send = (action: ControlAction, payload: ControlPayload, executeAt?: number) => {
    sender.sendPluginControl?.(target, 'node-executor', 'reclaim');
    sender.sendControl(target, action, payload, executeAt);
  };

  return {
    screenColor: (payload, executeAt) => send('screenColor', payload, executeAt),
    vibrate: (pattern, executeAt) => send('vibrate', { pattern }, executeAt),
    flashlight: (mode, options, executeAt) => send('flashlight', { mode, ...options }, executeAt),
    stop: () => {
      send('stopMedia', {});
      send('stopSound', {});
      send('hideImage', {});
    },
  };
}

export const publishedGroupSource = writable<PublishedGroup[]>(DEFAULT_GROUPS);
export const publishedGroups = derived(publishedGroupSource, ($groups) => normalizePublishedGroups($groups));

export function publishGroups(groups: unknown): void {
  const normalized = normalizePublishedGroups(groups);
  publishedGroupSource.set(normalized.length > 0 ? normalized : DEFAULT_GROUPS);
}
