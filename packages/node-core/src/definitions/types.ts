/**
 * Purpose: Shared types for node definitions and command routing.
 */
import type { ClientPermissions, ControlAction, ControlPayload, SensorPayload, SensorType } from '@shugu/protocol';

export type NodeCommand = {
  action: ControlAction;
  payload: ControlPayload;
  executeAt?: number;
};

export type LatestSensorDataLike = {
  sensorType: SensorType;
  payload: SensorPayload;
  serverTimestamp: number;
  clientTimestamp: number;
};

export type ClientSensorMessage = {
  sensorType: SensorType;
  payload: SensorPayload;
  serverTimestamp: number;
  clientTimestamp: number;
};

export type ClientObject = {
  clientId: string;
  sensors?: ClientSensorMessage | null;
};

export type ClientUiKind = 'button' | 'input';

export type ClientUiState = {
  displayed: boolean;
  kind?: ClientUiKind;
  pressed: boolean;
  inputContent: string;
  firstInputed: boolean;
};

export type ClientUiDeps = {
  getClientUiState?: (nodeId: string) => ClientUiState | null;
  setClientUiDisplay?: (nodeId: string, visible: boolean, kind: ClientUiKind) => void;
  consumeClientButtonPressed?: (nodeId: string) => boolean;
  clearClientUiNode?: (nodeId: string) => void;
  clearClientUi?: () => void;
};

export type ClientObjectDeps = {
  getClientId: () => string | null;
  /**
   * Manager-side list of all available clientIds (for client selection inputs).
   * Client-side implementations may return `[selfClientId]` (or `[]` when offline).
   */
  getAllClientIds?: () => string[];
  /**
   * Manager-side selected clientIds (fallback when the node has no explicit selection).
   */
  getSelectedClientIds?: () => string[];
  /**
   * Client-side convenience (single local client).
   * Prefer `getSensorForClientId` when available.
   */
  getLatestSensor?: () => LatestSensorDataLike | null;
  /**
   * Manager-side (or multi-client) lookup.
   */
  getSensorForClientId?: (clientId: string) => LatestSensorDataLike | null;
  /**
   * Manager-side lookup for per-client uploaded images (e.g. screenshots).
   */
  getImageForClientId?: (clientId: string) => unknown;
  /**
   * Manager-side lookup for the latest permission snapshot reported by a client.
   */
  getClientPermissions?: (clientId: string) => ClientPermissions | null;
  /**
   * Manager-side audience filter. Display clients should normally be excluded from client filters.
   */
  isAudienceClient?: (clientId: string) => boolean;
  /**
   * Client-side convenience (single local client).
   * Prefer `executeCommandForClientId` when available.
   */
  executeCommand: (cmd: NodeCommand) => void;
  /**
   * Manager-side (or multi-client) routing.
   */
  executeCommandForClientId?: (clientId: string, cmd: NodeCommand) => void;
  /**
   * Client-side rendered UI bridge for ClientUI nodes.
   */
  clientUi?: ClientUiDeps;
};
