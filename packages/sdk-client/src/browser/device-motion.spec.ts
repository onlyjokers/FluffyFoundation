// Purpose: Tests for device motion/orientation constructor guards.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getDeviceMotionEventCtor, getDeviceOrientationEventCtor } from './device-motion';

describe('device motion guards', () => {
  it('returns null when constructors missing', () => {
    const win = {} as Window;
    assert.equal(getDeviceMotionEventCtor(win), null);
    assert.equal(getDeviceOrientationEventCtor(win), null);
  });

  it('returns constructors when present', () => {
    class Motion {}
    class Orientation {}
    const win = {
      DeviceMotionEvent: Motion,
      DeviceOrientationEvent: Orientation,
    } as unknown as Window & {
      DeviceMotionEvent: typeof DeviceMotionEvent;
      DeviceOrientationEvent: typeof DeviceOrientationEvent;
    };
    assert.equal(getDeviceMotionEventCtor(win), Motion);
    assert.equal(getDeviceOrientationEventCtor(win), Orientation);
  });
});
