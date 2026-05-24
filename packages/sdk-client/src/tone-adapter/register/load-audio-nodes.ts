/**
 * Purpose: Register Tone load-audio asset nodes.
 */
import type { NodeRegistry } from '@shugu/node-core';
import type { ToneAdapterDeps } from '../types.js';
import { normalizeLocalMediaRef, toString } from '../utils.js';
import { createLoadAudioProcess } from './load-audio-process.js';
import type { LoadAudioNodeOptions } from './types.js';

function registerLoadAudioNode(registry: NodeRegistry, deps: ToneAdapterDeps, opts: LoadAudioNodeOptions): void {
  registry.register({
    type: opts.type,
    label: opts.label,
    category: 'Assets',
    inputs: opts.inputs,
    outputs: [
      { id: 'ref', label: 'Audio Out', type: 'audio', kind: 'sink' },
      { id: 'ended', label: 'Finish', type: 'boolean' },
    ],
    configSchema: opts.configSchema,
    process: createLoadAudioProcess(deps, opts),
  });
}

export function registerLoadAudioNodes(registry: NodeRegistry, deps: ToneAdapterDeps): void {
  registerLoadAudioNode(registry, deps, {
    type: 'load-audio-from-assets',
    label: 'Load Audio From Remote (client)',
    inputs: [
      { id: 'asset', label: 'Asset', type: 'asset', defaultValue: '' },
      { id: 'startSec', label: 'Start (s)', type: 'number', defaultValue: 0, min: 0, step: 0.01 },
      { id: 'endSec', label: 'End (s)', type: 'number', defaultValue: -1, min: -1, step: 0.01 },
      {
        id: 'cursorSec',
        label: 'Cursor (s)',
        type: 'number',
        defaultValue: -1,
        min: -1,
        step: 0.01,
      },
      { id: 'loop', label: 'Loop', type: 'boolean', defaultValue: false },
      { id: 'play', label: 'Play', type: 'boolean', defaultValue: true },
      { id: 'reverse', label: 'Reverse', type: 'boolean', defaultValue: false },
      { id: 'playbackRate', label: 'Rate', type: 'number', defaultValue: 1, min: 0 },
      { id: 'detune', label: 'Detune', type: 'number', defaultValue: 0 },
      { id: 'volume', label: 'Volume', type: 'number', defaultValue: 0, min: -1, max: 100, step: 0.01 },
    ],
    configSchema: [
      {
        key: 'assetId',
        label: 'Audio Asset',
        type: 'asset-picker',
        assetKind: 'audio',
        defaultValue: '',
      },
      { key: 'playbackRate', label: 'Rate', type: 'number', defaultValue: 1, min: 0 },
      { key: 'detune', label: 'Detune', type: 'number', defaultValue: 0 },
      { key: 'volume', label: 'Volume', type: 'number', defaultValue: 0, min: -1, max: 100, step: 0.01 },
      {
        key: 'timeline',
        label: 'Timeline',
        type: 'time-range',
        defaultValue: { startSec: 0, endSec: -1, cursorSec: -1 },
        min: 0,
        step: 0.01,
      },
    ],
    resolveBaseUrlRaw: (_inputs, config) => {
      const assetInput = toString(_inputs.asset, '').trim();
      const assetRaw = assetInput || toString(config.assetId, '');
      const trimmed = assetRaw.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('asset:') || trimmed.startsWith('shugu://asset/')) return trimmed;
      return `asset:${trimmed}`;
    },
    sensorNodeType: 'load-audio-from-assets',
  });

  registerLoadAudioNode(registry, deps, {
    type: 'load-audio-from-local',
    label: 'Load Audio From Local(Display) (client)',
    inputs: [
      { id: 'asset', label: 'Asset', type: 'string', defaultValue: '' },
      { id: 'startSec', label: 'Start (s)', type: 'number', defaultValue: 0, min: 0, step: 0.01 },
      { id: 'endSec', label: 'End (s)', type: 'number', defaultValue: -1, min: -1, step: 0.01 },
      {
        id: 'cursorSec',
        label: 'Cursor (s)',
        type: 'number',
        defaultValue: -1,
        min: -1,
        step: 0.01,
      },
      { id: 'loop', label: 'Loop', type: 'boolean', defaultValue: false },
      { id: 'play', label: 'Play', type: 'boolean', defaultValue: true },
      { id: 'reverse', label: 'Reverse', type: 'boolean', defaultValue: false },
      { id: 'playbackRate', label: 'Rate', type: 'number', defaultValue: 1, min: 0 },
      { id: 'detune', label: 'Detune', type: 'number', defaultValue: 0 },
      { id: 'volume', label: 'Volume', type: 'number', defaultValue: 0, min: -1, max: 100, step: 0.01 },
    ],
    configSchema: [
      {
        key: 'assetPath',
        label: 'Audio Asset',
        type: 'local-asset-picker',
        assetKind: 'audio',
        defaultValue: '',
      },
      { key: 'playbackRate', label: 'Rate', type: 'number', defaultValue: 1, min: 0 },
      { key: 'detune', label: 'Detune', type: 'number', defaultValue: 0 },
      { key: 'volume', label: 'Volume', type: 'number', defaultValue: 0, min: -1, max: 100, step: 0.01 },
      {
        key: 'timeline',
        label: 'Timeline',
        type: 'time-range',
        defaultValue: { startSec: 0, endSec: -1, cursorSec: -1 },
        min: 0,
        step: 0.01,
      },
    ],
    resolveBaseUrlRaw: (inputs, config) => {
      const fromInput = toString(inputs.asset, '').trim();
      const raw = fromInput || toString(config.assetPath, '').trim();
      return raw ? normalizeLocalMediaRef(raw, 'audio') : '';
    },
    sensorNodeType: 'load-audio-from-local',
  });
}
