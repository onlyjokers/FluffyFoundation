/**
 * Purpose: Pure capability checks for the client runtime NodeExecutor gate.
 */

export type RuntimePermissions = {
  microphone: 'pending' | 'granted' | 'denied';
  motion: 'pending' | 'granted' | 'denied';
  camera: 'pending' | 'granted' | 'denied';
  wakeLock: 'pending' | 'granted' | 'denied';
  geolocation: 'pending' | 'granted' | 'denied' | 'unavailable' | 'unsupported';
};

export type RuntimeCapabilityOptions = {
  permissions: RuntimePermissions;
  e2eFlashlightProof?: boolean;
  hasAudioContext?: boolean;
};

export function canRunClientRuntimeCapability(
  capability: string,
  options: RuntimeCapabilityOptions
): boolean {
  const permissions = options.permissions;
  if (capability === 'flashlight') {
    return permissions.camera === 'granted' || Boolean(options.e2eFlashlightProof);
  }
  if (capability === 'sensors') {
    return permissions.motion === 'granted' || permissions.microphone === 'granted';
  }
  if (capability === 'sound') {
    return Boolean(options.hasAudioContext);
  }
  return true;
}
