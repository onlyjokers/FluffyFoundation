/**
 * Purpose: Local display pairing helpers for MessagePort transport.
 */
import { PROTOCOL_VERSION, type PluginCommand, type PluginControlMessage, type TargetSelector } from '@shugu/protocol';

const LOCAL_PLUGIN_TARGET: TargetSelector = { mode: 'all' };

export function createLocalPluginMessage(
  command: PluginCommand,
  payload?: Record<string, unknown>
): PluginControlMessage {
  return {
    type: 'plugin',
    from: 'manager',
    target: LOCAL_PLUGIN_TARGET,
    pluginId: 'node-executor',
    command,
    payload,
    version: PROTOCOL_VERSION,
    serverTimestamp: Date.now(),
  };
}

export function isAllowedManagerOrigin(origin: string, isDev: boolean): boolean {
  if (!origin) return false;
  if (typeof window === 'undefined') return false;

  const allowed = new Set<string>([
    // Dev: Manager runs on a dedicated Vite port.
    'https://localhost:5173',
    'https://127.0.0.1:5173',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]);

  try {
    const url = new URL(window.location.origin);
    url.port = '5173';
    allowed.add(url.origin);
    // When Manager and Display are deployed under the same origin, allow same-origin pairing.
    allowed.add(window.location.origin);
  } catch {
    // ignore
  }

  // Dev convenience: allow Manager to pair from the same hostname (any port).
  if (isDev) {
    try {
      const sender = new URL(origin);
      const display = new URL(window.location.origin);

      if (sender.protocol === display.protocol && sender.hostname === display.hostname) return true;

      const hostPair = new Set([sender.hostname, display.hostname]);
      if (sender.protocol === display.protocol && hostPair.has('localhost') && hostPair.has('127.0.0.1')) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  return allowed.has(origin);
}
