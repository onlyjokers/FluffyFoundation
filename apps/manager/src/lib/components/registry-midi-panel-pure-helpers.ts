/**
 * Purpose: Runtime-independent formatting and target-list helpers for the Registry MIDI panel.
 */
import type { MidiEvent } from '$lib/features/midi/midi-service';
import type { MidiSource } from '$lib/features/midi/midi-node-bridge';
import { parameterRegistry } from '$lib/parameters/registry';

export type MidiTarget = { type: 'PARAM'; path: string };
export type TargetOption = { id: string; label: string; target: MidiTarget };
export type ParamGroup = { key: string; label: string; params: TargetOption[] };

function computeGroup(path: string, metadataGroup?: string): { key: string; label: string } {
  if (metadataGroup) return { key: metadataGroup, label: metadataGroup };

  const parts = path.split('/');
  if (parts[0] === 'controls') {
    const key = parts[1] ?? 'Controls';
    return { key, label: key };
  }
  if (parts[0] === 'client') {
    const key = parts[2] ?? 'Client';
    return { key, label: key };
  }
  const fallback = parts[0] || 'Other';
  return { key: fallback, label: fallback };
}

export function listMidiTargetGroups(): ParamGroup[] {
  const params = parameterRegistry
    .list('controls')
    .filter((p) => p.type === 'number')
    .filter((p) => !p.metadata?.hidden)
    .filter((p) => !p.isOffline);

  const groups = new Map<string, ParamGroup>();
  for (const p of params) {
    const group = computeGroup(p.path, p.metadata?.group);
    const entry = groups.get(group.key) ?? { key: group.key, label: group.label, params: [] };
    entry.params.push({
      id: p.path,
      label: p.metadata?.label || p.path.split('/').pop() || p.path,
      target: { type: 'PARAM', path: p.path },
    });
    groups.set(group.key, entry);
  }

  return Array.from(groups.values())
    .map((g) => ({ ...g, params: g.params.sort((a, b) => a.label.localeCompare(b.label)) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function formatMidiEvent(event: MidiEvent): string {
  if (event.type === 'pitchbend') return `Pitch Bend ch${event.channel + 1}`;
  return `${event.type.toUpperCase()} ${event.number} ch${event.channel + 1}`;
}

export function describeMidiSource(
  source: MidiSource | null | undefined,
  inputList: { id: string; name: string }[]
): string {
  if (!source) return 'Unbound';
  const input = source.inputId ? (inputList.find((i) => i.id === source.inputId)?.name ?? source.inputId) : '*';
  const channel = `ch${source.channel + 1}`;
  if (source.type === 'pitchbend') return `${input} • pitchbend • ${channel}`;
  const number = source.number ?? 0;
  return `${input} • ${source.type} ${number} • ${channel}`;
}

export function clampMidiNumber(value: number, min?: number, max?: number): number {
  let next = value;
  if (typeof min === 'number' && Number.isFinite(min)) next = Math.max(min, next);
  if (typeof max === 'number' && Number.isFinite(max)) next = Math.min(max, next);
  return next;
}
