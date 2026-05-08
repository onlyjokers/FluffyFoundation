/**
 * Purpose: FF-08 regression tests for published Group control targeting.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ControlAction, ControlPayload, TargetSelector } from '@shugu/protocol';

import {
  buildPublishedGroupControl,
  createPublishedGroup,
  normalizePublishedGroups,
  type PublishedGroup,
} from './group-controls';

test('normalizePublishedGroups keeps only publishable Group records', () => {
  const groups = normalizePublishedGroups([
    { id: 'stage-left', name: 'Stage Left', description: 'main performers' },
    { id: ' ', name: 'Blank' },
    { id: 'stage-right', name: '' },
    null,
    { id: 'stage-left', name: 'Duplicate' },
  ]);

  assert.deepEqual(groups, [
    { id: 'stage-left', name: 'Stage Left', description: 'main performers' },
    { id: 'stage-right', name: 'stage-right' },
  ]);
});

test('createPublishedGroup exposes a stable lightweight Group summary', () => {
  const group = createPublishedGroup({ id: 'vip', name: 'VIP Phones', description: 'front row' });

  assert.deepEqual(group, {
    id: 'vip',
    name: 'VIP Phones',
    description: 'front row',
  });
});

test('buildPublishedGroupControl targets the published Group instead of selected clients', () => {
  const emitted: Array<{
    target: TargetSelector;
    action: ControlAction;
    payload: ControlPayload;
    executeAt?: number;
  }> = [];
  const group: PublishedGroup = { id: 'stage-left', name: 'Stage Left' };
  const control = buildPublishedGroupControl(group, {
    sendControl: (target, action, payload, executeAt) =>
      emitted.push({ target, action, payload, executeAt }),
  });

  control.screenColor({ color: '#ff0000', opacity: 0.8, mode: 'solid' }, 1234);
  control.vibrate([50, 25, 50]);
  control.stop();

  assert.deepEqual(emitted, [
    {
      target: { mode: 'group', groupId: 'stage-left' },
      action: 'screenColor',
      payload: { color: '#ff0000', opacity: 0.8, mode: 'solid' },
      executeAt: 1234,
    },
    {
      target: { mode: 'group', groupId: 'stage-left' },
      action: 'vibrate',
      payload: { pattern: [50, 25, 50] },
      executeAt: undefined,
    },
    {
      target: { mode: 'group', groupId: 'stage-left' },
      action: 'stopMedia',
      payload: {},
      executeAt: undefined,
    },
    {
      target: { mode: 'group', groupId: 'stage-left' },
      action: 'stopSound',
      payload: {},
      executeAt: undefined,
    },
    {
      target: { mode: 'group', groupId: 'stage-left' },
      action: 'hideImage',
      payload: {},
      executeAt: undefined,
    },
  ]);
});

test('buildPublishedGroupControl reclaims the published Group before mutating controls', () => {
  const emitted: Array<{
    type: 'control' | 'plugin';
    target: TargetSelector;
    action?: ControlAction;
    payload?: ControlPayload;
    pluginId?: string;
    command?: string;
  }> = [];
  const group: PublishedGroup = { id: 'display', name: 'Display' };
  const control = buildPublishedGroupControl(group, {
    sendControl: (target, action, payload) => emitted.push({ type: 'control', target, action, payload }),
    sendPluginControl: (target, pluginId, command) =>
      emitted.push({ type: 'plugin', target, pluginId, command }),
  });

  control.screenColor({ color: '#6655ff', opacity: 1, mode: 'solid' });

  assert.deepEqual(emitted, [
    {
      type: 'plugin',
      target: { mode: 'group', groupId: 'display' },
      pluginId: 'node-executor',
      command: 'reclaim',
    },
    {
      type: 'control',
      target: { mode: 'group', groupId: 'display' },
      action: 'screenColor',
      payload: { color: '#6655ff', opacity: 1, mode: 'solid' },
    },
  ]);
});
