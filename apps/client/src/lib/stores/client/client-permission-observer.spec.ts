/**
 * Purpose: Regression tests for browser permission state observation.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  observeBrowserPermissionChanges,
  readBrowserPermissionStatus,
  type PermissionStatusLike,
} from './client-permission-observer';

class FakePermissionStatus implements PermissionStatusLike {
  onchange: ((event: Event) => void) | null = null;
  private listeners = new Set<() => void>();

  constructor(public state: PermissionState) {}

  addEventListener(_type: 'change', listener: () => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'change', listener: () => void): void {
    this.listeners.delete(listener);
  }

  setState(state: PermissionState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
    this.onchange?.(new Event('change'));
  }
}

function fakeNavigator(statuses: Record<string, FakePermissionStatus>): Navigator {
  return {
    permissions: {
      query: async (descriptor: PermissionDescriptor) => {
        const status = statuses[String(descriptor.name)];
        if (!status) throw new Error(`unsupported ${String(descriptor.name)}`);
        return status as unknown as PermissionStatus;
      },
    },
  } as Navigator;
}

test('readBrowserPermissionStatus maps denied camera permission to denied', async () => {
  const nav = fakeNavigator({
    camera: new FakePermissionStatus('denied'),
  });

  assert.equal(await readBrowserPermissionStatus('camera', nav), 'denied');
});

test('readBrowserPermissionStatus combines motion sensor descriptors conservatively', async () => {
  const nav = fakeNavigator({
    accelerometer: new FakePermissionStatus('granted'),
    gyroscope: new FakePermissionStatus('denied'),
    magnetometer: new FakePermissionStatus('granted'),
  });

  assert.equal(await readBrowserPermissionStatus('motion', nav), 'denied');
});

test('observeBrowserPermissionChanges updates store when permission is revoked', async () => {
  const camera = new FakePermissionStatus('granted');
  const snapshots: Array<Record<string, unknown>> = [];
  const store: {
    current: Record<string, unknown>;
    update(updater: (current: Record<string, unknown>) => Record<string, unknown>): void;
  } = {
    current: { camera: 'pending' },
    update(updater: (current: Record<string, unknown>) => Record<string, unknown>) {
      this.current = updater(this.current);
      snapshots.push({ ...this.current });
    },
  };

  const stop = observeBrowserPermissionChanges(store, fakeNavigator({ camera }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  camera.setState('denied');
  await new Promise((resolve) => setTimeout(resolve, 0));
  stop();

  assert.equal(store.current.camera, 'denied');
  assert.ok(snapshots.some((snapshot) => snapshot.camera === 'granted'));
  assert.ok(snapshots.some((snapshot) => snapshot.camera === 'denied'));
});
