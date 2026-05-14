/**
 * Purpose: BroadcastChannel helpers for Manager-to-Display local media registration.
 */
const LOCAL_MEDIA_BROADCAST_CHANNEL = 'shugu:display:local-media';

let localMediaBroadcast: BroadcastChannel | null = null;

type LocalMediaBroadcastMessage = {
  type: 'shugu:display:local-media';
  command: 'register' | 'clear';
  payload?: Record<string, unknown>;
};

function getLocalMediaBroadcast(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (typeof BroadcastChannel === 'undefined') return null;
  if (localMediaBroadcast) return localMediaBroadcast;

  try {
    localMediaBroadcast = new BroadcastChannel(LOCAL_MEDIA_BROADCAST_CHANNEL);
  } catch {
    localMediaBroadcast = null;
  }
  return localMediaBroadcast;
}

export function broadcastLocalMedia(
  command: LocalMediaBroadcastMessage['command'],
  payload?: Record<string, unknown>
): void {
  const channel = getLocalMediaBroadcast();
  if (!channel) return;

  const message: LocalMediaBroadcastMessage = {
    type: 'shugu:display:local-media',
    command,
    ...(payload ? { payload } : {}),
  };

  try {
    channel.postMessage(message);
  } catch (error) {
    console.warn('[display-bridge] BroadcastChannel postMessage failed:', error);
  }
}

export function collectDisplayFileRefsDeep(value: unknown): string[] {
  const refs = new Set<string>();
  const visited = new WeakSet<object>();

  const walk = (current: unknown, depth: number) => {
    if (depth > 8) return;
    if (typeof current === 'string') {
      if (current.trim().startsWith('displayfile:')) refs.add(current.trim());
      return;
    }
    if (!current || typeof current !== 'object') return;
    if (visited.has(current)) return;
    visited.add(current);

    if (Array.isArray(current)) {
      for (const item of current) walk(item, depth + 1);
      return;
    }

    for (const item of Object.values(current as Record<string, unknown>)) {
      walk(item, depth + 1);
    }
  };

  walk(value, 0);
  return Array.from(refs);
}
