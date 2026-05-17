/**
 * Purpose: Display transport (Manager → Display), unifying local MessagePort bridge and server `group=display`.
 *
 * Phase 0 scope:
 * - Provide a single entry point for sending Display control/plugin messages.
 * - Preserve current behavior: local bridge preferred; server is used as fallback when local isn't ready.
 *
 * Notes:
 * - This module is intentionally dependency-injected to avoid coupling to `$lib/stores/manager` or UI code.
 * - It does not change the on-wire protocol; local bridge still uses `shugu:display:*` MessagePort messages.
 */

import { get, type Readable } from 'svelte/store';
import {
  targetGroup,
  type ControlAction,
  type ControlPayload,
  type TargetSelector,
} from '@shugu/protocol';
import type { ManagerState } from '@shugu/sdk-manager';
import type { DisplayBridgeState } from '$lib/display/display-bridge';

export type DisplayTransportRoute = 'none' | 'local' | 'local+server' | 'server';

export type DisplayTransportAvailability = {
  route: DisplayTransportRoute;
  hasLocalSession: boolean;
  hasLocalReady: boolean;
  hasRemoteDisplay: boolean;
  localSessionKey: string;
};

export type DisplayTransportSendOptions = {
  /**
   * Always send via server (in addition to local, if local session exists).
   * Useful for "emergency" actions like kill/stop-all in future phases.
   */
  forceServer?: boolean;
  /**
   * Only send via local bridge. Never send via server fallback.
   * Useful when a call site wants "paired Display only" semantics.
   */
  localOnly?: boolean;
};

export type DisplayTransportSdk = {
  sendControl: (
    target: TargetSelector,
    action: ControlAction,
    payload: ControlPayload,
    executeAt?: number
  ) => void;
  sendPluginControl: (
    target: TargetSelector,
    pluginId: string,
    command: string,
    payload?: Record<string, unknown>
  ) => void;
};

export type DisplayTransportLocalSender = {
  sendControl: (action: ControlAction, payload: ControlPayload, executeAtLocal?: number) => void;
  sendPlugin?: (pluginId: string, command: string, payload?: Record<string, unknown>) => void;
};

export type DisplayTransportDeps = {
  managerState: Readable<ManagerState>;
  displayBridgeState: Readable<DisplayBridgeState>;
  getSDK: () => DisplayTransportSdk | null;
  local: DisplayTransportLocalSender;
};

function hasRemoteDisplayClients(manager: ManagerState): boolean {
  return (manager.clients ?? []).some((c) => c.group === 'display' && c.connected !== false);
}

function getLocalRouteInfo(bridge: DisplayBridgeState): {
  hasLocalSession: boolean;
  hasLocalReady: boolean;
  localSessionKey: string;
} {
  const hasLocalSession = bridge.status === 'connected';
  const readyAt =
    typeof bridge.readyAt === 'number' && Number.isFinite(bridge.readyAt) ? bridge.readyAt : 0;
  const pairToken = typeof bridge.pairToken === 'string' ? bridge.pairToken : '';
  return {
    hasLocalSession,
    hasLocalReady: hasLocalSession && bridge.ready === true,
    localSessionKey: hasLocalSession ? `${pairToken}:${readyAt}` : '',
  };
}

export function createDisplayTransport(deps: DisplayTransportDeps): {
  getAvailability: () => DisplayTransportAvailability;
  sendControl: (
    action: ControlAction,
    payload: ControlPayload,
    executeAtServer?: number,
    options?: DisplayTransportSendOptions
  ) => DisplayTransportAvailability;
  sendPlugin: (
    pluginId: string,
    command: string,
    payload?: Record<string, unknown>,
    options?: DisplayTransportSendOptions
  ) => DisplayTransportAvailability;
} {
  const getAvailability = (): DisplayTransportAvailability => {
    const manager = get(deps.managerState);
    const bridge = get(deps.displayBridgeState);
    const { hasLocalSession, hasLocalReady, localSessionKey } = getLocalRouteInfo(bridge);
    const hasRemoteDisplay = hasRemoteDisplayClients(manager);

    const route: DisplayTransportRoute = hasLocalSession
      ? 'local'
      : hasRemoteDisplay
        ? 'server'
        : 'none';

    return { route, hasLocalSession, hasLocalReady, hasRemoteDisplay, localSessionKey };
  };

  const sendControl = (
    action: ControlAction,
    payload: ControlPayload,
    executeAtServer?: number,
    options?: DisplayTransportSendOptions
  ): DisplayTransportAvailability => {
    const manager = get(deps.managerState);
    const bridge = get(deps.displayBridgeState);
    const sdk = deps.getSDK();

    const { hasLocalSession, hasLocalReady, localSessionKey } = getLocalRouteInfo(bridge);
    const hasRemoteDisplay = hasRemoteDisplayClients(manager);

    let route: DisplayTransportRoute = 'none';
    if (hasLocalSession) route = 'local';
    else if (hasRemoteDisplay) route = 'server';

    if (!hasLocalSession && !hasRemoteDisplay) {
      return { route: 'none', hasLocalSession, hasLocalReady, hasRemoteDisplay, localSessionKey };
    }

    if (options?.localOnly) {
      if (!hasLocalSession)
        return { route: 'none', hasLocalSession, hasLocalReady, hasRemoteDisplay, localSessionKey };

      const offset = typeof manager.timeSync?.offset === 'number' ? manager.timeSync.offset : 0;
      const executeAtLocal =
        typeof executeAtServer === 'number' && Number.isFinite(executeAtServer)
          ? executeAtServer - offset
          : undefined;
      deps.local.sendControl(action, payload, executeAtLocal);
      return { route: 'local', hasLocalSession, hasLocalReady, hasRemoteDisplay, localSessionKey };
    }

    const offset = typeof manager.timeSync?.offset === 'number' ? manager.timeSync.offset : 0;

    if (hasLocalSession) {
      const executeAtLocal =
        typeof executeAtServer === 'number' && Number.isFinite(executeAtServer)
          ? executeAtServer - offset
          : undefined;
      deps.local.sendControl(action, payload, executeAtLocal);
      if (hasLocalReady && options?.forceServer !== true) {
        return {
          route: 'local',
          hasLocalSession,
          hasLocalReady,
          hasRemoteDisplay,
          localSessionKey,
        };
      }
    }

    if (hasRemoteDisplay && sdk) {
      sdk.sendControl(targetGroup('display'), action, payload, executeAtServer);
      if (hasLocalSession) route = 'local+server';
    }

    return { route, hasLocalSession, hasLocalReady, hasRemoteDisplay, localSessionKey };
  };

  const sendPlugin = (
    pluginId: string,
    command: string,
    payload?: Record<string, unknown>,
    options?: DisplayTransportSendOptions
  ): DisplayTransportAvailability => {
    const manager = get(deps.managerState);
    const bridge = get(deps.displayBridgeState);
    const sdk = deps.getSDK();

    const { hasLocalSession, hasLocalReady, localSessionKey } = getLocalRouteInfo(bridge);
    const hasRemoteDisplay = hasRemoteDisplayClients(manager);

    let route: DisplayTransportRoute = 'none';
    if (hasLocalSession) route = 'local';
    else if (hasRemoteDisplay) route = 'server';

    if (!hasLocalSession && !hasRemoteDisplay) {
      return { route: 'none', hasLocalSession, hasLocalReady, hasRemoteDisplay, localSessionKey };
    }

    if (options?.localOnly) {
      if (!hasLocalSession)
        return { route: 'none', hasLocalSession, hasLocalReady, hasRemoteDisplay, localSessionKey };
      if (!deps.local.sendPlugin)
        return { route: 'none', hasLocalSession, hasLocalReady, hasRemoteDisplay, localSessionKey };
      deps.local.sendPlugin(pluginId, command, payload);
      return { route: 'local', hasLocalSession, hasLocalReady, hasRemoteDisplay, localSessionKey };
    }

    if (hasLocalSession && deps.local.sendPlugin) {
      deps.local.sendPlugin(pluginId, command, payload);
      if (hasLocalReady && options?.forceServer !== true) {
        return {
          route: 'local',
          hasLocalSession,
          hasLocalReady,
          hasRemoteDisplay,
          localSessionKey,
        };
      }
    }

    if (hasRemoteDisplay && sdk) {
      sdk.sendPluginControl(targetGroup('display'), pluginId, command, payload);
      if (hasLocalSession) route = 'local+server';
    }

    return { route, hasLocalSession, hasLocalReady, hasRemoteDisplay, localSessionKey };
  };

  return { getAvailability, sendControl, sendPlugin };
}
