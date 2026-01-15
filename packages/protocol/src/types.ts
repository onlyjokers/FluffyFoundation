/**
 * Protocol Version
 */
export const PROTOCOL_VERSION = 1 as const;

/**
 * Message types for categorizing different kinds of messages
 */
export type MessageType = 'control' | 'data' | 'media' | 'system' | 'plugin';

/**
 * Base message structure for all messages in the system
 */
export interface BaseMessage {
  /** Server timestamp when message was processed */
  serverTimestamp: number;
  /** Client timestamp when message was sent (optional) */
  clientTimestamp?: number;
  /** Type of message */
  type: MessageType;
  /** Protocol version */
  version: typeof PROTOCOL_VERSION;
}

/**
 * Target selector for specifying message recipients
 */
export type TargetSelector =
  | { mode: 'all' }
  | { mode: 'clientIds'; ids: string[] }
  | { mode: 'group'; groupId: string };

/**
 * Control actions that can be sent to clients
 */
export type ControlAction =
  | 'flashlight'
  | 'screenColor'
  | 'screenBrightness'
  | 'vibrate'
  | 'modulateSound'
  | 'modulateSoundUpdate'
  | 'playSound'
  | 'playMedia'
  | 'stopSound'
  | 'stopMedia'
  | 'showImage'
  | 'hideImage'
  | 'shutdown'
  | 'visualScenes'
  | 'visualEffects'
  | 'setDataReportingRate'
  | 'setSensorState'
  | 'custom';

/**
 * Flashlight mode configuration
 */
export interface FlashlightPayload {
  mode: 'off' | 'on' | 'blink';
  /** Blink frequency in Hz (for blink mode) */
  frequency?: number;
  /** Duty cycle 0-1 (for blink mode) */
  dutyCycle?: number;
}

/**
 * Screen color payload
 */
export interface ScreenColorPayload {
  /** CSS color string for the primary color */
  color: string;
  /** Optional opacity for solid/pulse modes (0-1) */
  opacity?: number;
  /** Display mode for the screen effect */
  mode?: 'solid' | 'blink' | 'pulse' | 'cycle' | 'modulate';
  /** Blink frequency in Hz (for blink mode) */
  blinkFrequency?: number;
  /** Pulse cycle duration in ms (for pulse mode) */
  pulseDuration?: number;
  /** Minimum opacity in pulse mode (0-1) */
  pulseMin?: number;
  /** Modulation waveform (for modulate/pulse modes) */
  waveform?: 'sine' | 'square' | 'triangle' | 'sawtooth';
  /** Modulation frequency in Hz (for modulate mode) */
  frequencyHz?: number;
  /** Minimum opacity for modulation (0-1) */
  minOpacity?: number;
  /** Maximum opacity for modulation (0-1) */
  maxOpacity?: number;
  /** Optional secondary color to morph toward during modulation/cycle */
  secondaryColor?: string;
  /** Color list to cycle through (for cycle mode) */
  cycleColors?: string[];
  /** Duration in ms for a full color cycle */
  cycleDuration?: number;
}

/**
 * Vibration pattern payload
 */
export interface VibratePayload {
  /** Vibration pattern in ms [vibrate, pause, vibrate, ...] */
  pattern: number[];
  /** Number of times to repeat the pattern */
  repeat?: number;
}

/**
 * Simple synthesized tone / modulation payload
 */
export interface ModulateSoundPayload {
  /** Fundamental frequency in Hz (default: 180) */
  frequency?: number;
  /** Duration in milliseconds (default: 200) */
  duration?: number;
  /** Output gain 0-1 (default: 0.7) */
  volume?: number;
  /** Oscillator waveform (default: 'square') */
  waveform?: 'sine' | 'square' | 'sawtooth' | 'triangle';
  /** Optional low-frequency oscillator for wobble/vibe */
  modFrequency?: number;
  /** Modulation depth 0-1 (scaled to carrier frequency) */
  modDepth?: number;
  /** Attack time in ms (default: 10) */
  attack?: number;
  /** Release time in ms (default: 40) */
  release?: number;
}

/**
 * Sound playback payload
 */
export interface PlaySoundPayload {
  url: string;
  volume?: number;
  loop?: boolean;
  fadeIn?: number;
}

/**
 * Media (audio/video) playback payload
 */
export interface PlayMediaPayload {
  url: string;
  /** 'audio' or 'video', auto-detected if not specified */
  mediaType?: 'audio' | 'video';
  volume?: number;
  loop?: boolean;
  fadeIn?: number;
  /** For video: muted by default (true) to avoid audio conflicts */
  muted?: boolean;
}

/**
 * Image display payload
 */
export interface ShowImagePayload {
  url: string;
  /** Duration in milliseconds to show the image. If not set, shows indefinitely until hideImage is called */
  duration?: number;
}

/**
 * Visual scene layer item.
 *
 * Used by `visualScenes` to describe an ordered enabled scene list on the client.
 * Items are applied in array order.
 */
export type VisualSceneLayerItem =
  | { type: 'box' }
  | { type: 'mel' }
  | { type: 'frontCamera' }
  | { type: 'backCamera' };

/**
 * Visual scenes pipeline payload.
 *
 * Sets the ordered enabled scene list applied on the client visual layer.
 * An empty list disables all visual scenes (box/mel/camera).
 */
export interface VisualScenesPayload {
  scenes: VisualSceneLayerItem[];
}

export type ConvolutionPreset =
  | 'blur'
  | 'gaussianBlur'
  | 'sharpen'
  | 'edge'
  | 'emboss'
  | 'sobelX'
  | 'sobelY'
  | 'custom';

/**
 * Visual effect description.
 *
 * Used by `visualEffects` to describe an ordered post-processing chain on the client.
 * Effects are applied in array order (first -> last).
 */
export type VisualEffect =
  | {
      type: 'ascii';
      /** Cell size in pixels (lower = finer). */
      cellSize: number;
    }
  | {
      type: 'convolution';
      preset?: ConvolutionPreset;
      /** Optional 3x3 kernel values (row-major, length 9). */
      kernel?: number[];
      /** Blend factor 0..1 (0 = original, 1 = fully convolved). */
      mix?: number;
      /** Bias added after convolution in normalized units (-1..1). */
      bias?: number;
      /** When true, normalizes by the kernel sum when non-zero. */
      normalize?: boolean;
      /** Processing scale 0.1..1 (lower = faster). */
      scale?: number;
    };

/**
 * Visual effects pipeline payload.
 *
 * Sets the ordered post-processing chain applied on the client visual layer.
 * An empty list disables all effects.
 */
export interface VisualEffectsPayload {
  effects: VisualEffect[];
}

/**
 * Data reporting rate configuration
 */
export interface DataReportingRatePayload {
  sensorHz?: number;
  audioHz?: number;
  enabled?: boolean;
}

/**
 * Union type for base (single) control payloads.
 *
 * Note: `custom` batch payloads are layered on top as `ControlPayload` (see below) to avoid
 * circular type references.
 */
export type BaseControlPayload =
  | FlashlightPayload
  | ScreenColorPayload
  | VibratePayload
  | ModulateSoundPayload
  | PlaySoundPayload
  | PlayMediaPayload
  | ShowImagePayload
  | VisualScenesPayload
  | VisualEffectsPayload
  | DataReportingRatePayload
  | Record<string, unknown>;

/**
 * Batch item for `ControlAction: 'custom'`.
 */
export type ControlBatchItem = {
  action: ControlAction;
  payload: BaseControlPayload;
  executeAt?: number;
};

/**
 * Batch payload for `ControlAction: 'custom'`.
 *
 * Used to deliver multiple control actions in a single message for better sync and lower server load.
 */
export interface ControlBatchPayload {
  kind: 'control-batch';
  items: ControlBatchItem[];
  /**
   * Optional unified execute time applied to items that don't specify `executeAt`.
   */
  executeAt?: number;
}

/**
 * Union type for all control payloads.
 */
export type ControlPayload = BaseControlPayload | ControlBatchPayload;

/**
 * Control message sent from manager or server to control client behavior
 */
export interface ControlMessage extends BaseMessage {
  type: 'control';
  from: 'manager' | 'server';
  target: TargetSelector;
  action: ControlAction;
  /** Server timestamp when the action should be executed (for sync) */
  executeAt?: number;
  payload: ControlPayload;
}

/**
 * Sensor types for data messages
 */
export type SensorType = 'gyro' | 'accel' | 'orientation' | 'mic' | 'camera' | 'custom';

/**
 * Gyroscope data
 */
export interface GyroData {
  alpha: number;
  beta: number;
  gamma: number;
}

/**
 * Accelerometer data
 */
export interface AccelData {
  x: number;
  y: number;
  z: number;
  includesGravity: boolean;
}

/**
 * Orientation data
 */
export interface OrientationData {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute: boolean;
}

/**
 * Audio features from microphone
 */
export interface MicAudioFeatures {
  /** RMS volume level 0-1 */
  volume: number;
  /** Low frequency energy */
  lowEnergy?: number;
  /** High frequency energy */
  highEnergy?: number;
  /** Estimated BPM */
  bpm?: number;
  /** Mel spectrogram data (optional, only when requested) */
  melSpectrogram?: number[];
}

/**
 * Sensor data payload union type
 */
export type SensorPayload =
  | GyroData
  | AccelData
  | OrientationData
  | MicAudioFeatures
  | Record<string, unknown>;

/**
 * Sensor data message from client to server/manager
 */
export interface SensorDataMessage extends BaseMessage {
  type: 'data';
  from: 'client';
  clientId: string;
  sensorType: SensorType;
  payload: SensorPayload;
}

/**
 * Media types
 */
export type MediaType = 'audio' | 'video';

/**
 * Media metadata message for synchronized playback
 */
export interface MediaMetaMessage extends BaseMessage {
  type: 'media';
  from: 'manager';
  target: TargetSelector;
  mediaType: MediaType;
  url: string;
  /** Server timestamp when playback should start */
  executeAt: number;
  options?: {
    loop?: boolean;
    volume?: number;
    autoplay?: boolean;
  };
}

/**
 * Plugin IDs
 */
export type AudioPluginId = 'mel-spectrogram' | 'audio-splitter' | string;
export type VisualPluginId = 'box-scene' | 'mel-scene' | 'mel-ascii-scene' | string;
export type SystemPluginId = 'node-executor';
export type PluginId = AudioPluginId | VisualPluginId | SystemPluginId;

/**
 * Plugin commands
 */
export type PluginCommand =
  | 'init'
  | 'start'
  | 'stop'
  | 'configure'
  | 'deploy'
  | 'graph-changes'
  | 'remove'
  | 'override-set'
  | 'override-remove';

/**
 * Payload shape for incremental graph updates (opaque to protocol).
 */
export type GraphChangePayload = {
  changes: Record<string, unknown>[];
};

/**
 * Plugin control message
 */
export interface PluginControlMessage extends BaseMessage {
  type: 'plugin';
  from: 'manager';
  target: TargetSelector;
  pluginId: PluginId;
  command: PluginCommand;
  payload?: Record<string, unknown>;
}

/**
 * System message types
 */
export type SystemAction =
  | 'clientRegistered'
  | 'clientList'
  | 'clientJoined'
  | 'clientLeft'
  | 'error'
  | 'ping'
  | 'pong';

/**
 * Client info for client list
 */
export interface ClientInfo {
  clientId: string;
  connectedAt: number;
  userAgent?: string;
  group?: string;
  selected?: boolean;
  connected?: boolean;
  lastSeenAt?: number;
}

/**
 * System message for connection management
 */
export interface SystemMessage extends BaseMessage {
  type: 'system';
  action: SystemAction;
  payload: {
    clientId?: string;
    clients?: ClientInfo[];
    error?: string;
    serverTimestamp?: number;
    clientTimestamp?: number;
  };
}

/**
 * Union type of all message types
 */
export type Message =
  | ControlMessage
  | SensorDataMessage
  | MediaMetaMessage
  | PluginControlMessage
  | SystemMessage;

/**
 * Message type sent to the server before server timestamp is attached.
 *
 * Note: the server is responsible for attaching `serverTimestamp` before routing/broadcasting.
 */
export type MessageWithoutServerTimestamp =
  | Omit<ControlMessage, 'serverTimestamp'>
  | Omit<SensorDataMessage, 'serverTimestamp'>
  | Omit<MediaMetaMessage, 'serverTimestamp'>
  | Omit<PluginControlMessage, 'serverTimestamp'>
  | Omit<SystemMessage, 'serverTimestamp'>;

/**
 * Socket.io event names
 */
export const SOCKET_EVENTS = {
  // Main message event
  MSG: 'msg',
  // Time sync events
  TIME_PING: 'time:ping',
  TIME_PONG: 'time:pong',
  // Connection events
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',
  RECONNECT: 'reconnect',
} as const;

/**
 * Connection roles
 */
export type ConnectionRole = 'manager' | 'client';
