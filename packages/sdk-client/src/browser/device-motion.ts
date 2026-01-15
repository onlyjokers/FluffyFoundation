// Purpose: Typed helpers for device motion/orientation constructors.

type DeviceMotionCtor = typeof DeviceMotionEvent;
type DeviceOrientationCtor = typeof DeviceOrientationEvent;

export const getDeviceMotionEventCtor = (win?: Window | null): DeviceMotionCtor | null => {
  if (!win) return null;
  const typed = win as Window & { DeviceMotionEvent?: DeviceMotionCtor };
  return typed.DeviceMotionEvent ?? null;
};

export const getDeviceOrientationEventCtor = (
  win?: Window | null
): DeviceOrientationCtor | null => {
  if (!win) return null;
  const typed = win as Window & { DeviceOrientationEvent?: DeviceOrientationCtor };
  return typed.DeviceOrientationEvent ?? null;
};
