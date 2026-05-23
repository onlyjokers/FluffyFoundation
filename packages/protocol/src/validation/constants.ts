/**
 * Purpose: Runtime protocol enum allowlists used by schema validators.
 */
export const MESSAGE_TYPES = ['control', 'data', 'media', 'system', 'plugin', 'semantic', 'semantic-result'] as const;

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
  'showText',
  'hideText',
  'shutdown',
  'visualScenes',
  'visualEffects',
  'clientUi',
  'setDataReportingRate',
  'setSensorState',
  'custom',
] as const;

export const SENSOR_TYPES = ['gyro', 'accel', 'orientation', 'mic', 'camera', 'custom'] as const;
export const MEDIA_TYPES = ['audio', 'video'] as const;
export const CLIENT_PERMISSION_NAMES = ['microphone', 'motion', 'camera', 'wakeLock', 'geolocation'] as const;
export const CLIENT_PERMISSION_STATUSES = ['pending', 'granted', 'denied', 'unavailable', 'unsupported'] as const;

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
  'display-operation',
] as const;

export const SYSTEM_ACTIONS = [
  'clientRegistered',
  'clientList',
  'clientJoined',
  'clientLeft',
  'clientPermissions',
  'semanticSnapshot',
  'error',
  'ping',
  'pong',
] as const;
