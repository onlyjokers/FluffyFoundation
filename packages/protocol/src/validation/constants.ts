/**
 * Purpose: Runtime protocol enum allowlists used by schema validators.
 */
export const MESSAGE_TYPES = ['control', 'data', 'media', 'system', 'plugin'] as const;

export const CONTROL_ACTIONS = [
  'flashlight',
  'screenColor',
  'screenBrightness',
  'vibrate',
  'modulateSound',
  'modulateSoundUpdate',
  'playSound',
  'playMedia',
  'stopSound',
  'stopMedia',
  'showImage',
  'hideImage',
  'shutdown',
  'visualScenes',
  'visualEffects',
  'setDataReportingRate',
  'setSensorState',
  'custom',
] as const;

export const SENSOR_TYPES = ['gyro', 'accel', 'orientation', 'mic', 'camera', 'custom'] as const;
export const MEDIA_TYPES = ['audio', 'video'] as const;

export const PLUGIN_COMMANDS = [
  'init',
  'start',
  'stop',
  'configure',
  'deploy',
  'graph-changes',
  'remove',
  'reclaim',
  'release',
  'archive',
  'restore',
  'override-set',
  'override-remove',
] as const;

export const SYSTEM_ACTIONS = [
  'clientRegistered',
  'clientList',
  'clientJoined',
  'clientLeft',
  'error',
  'ping',
  'pong',
] as const;
