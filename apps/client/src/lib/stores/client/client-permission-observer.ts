/**
 * Purpose: Observe browser permission state changes and map them into the client permission store.
 */
import type { ClientPermissionName, ClientPermissionStatus } from '@shugu/protocol';

type PermissionPatch = Partial<Record<ClientPermissionName, ClientPermissionStatus>>;
type PermissionStore<T extends PermissionPatch = PermissionPatch> = { update(updater: (current: T) => T): void };
export type PermissionStatusLike = {
  state: PermissionState;
  onchange: ((event: Event) => void) | null;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
};

type PermissionProbe = {
  permission: ClientPermissionName;
  descriptors: PermissionDescriptor[];
  combine?: (states: PermissionState[]) => ClientPermissionStatus;
};

const browserPermissionProbes: PermissionProbe[] = [
  { permission: 'microphone', descriptors: [{ name: 'microphone' as PermissionName }] },
  {
    permission: 'motion',
    descriptors: [
      { name: 'accelerometer' as PermissionName },
      { name: 'gyroscope' as PermissionName },
      { name: 'magnetometer' as PermissionName },
    ],
    combine: (states) => {
      if (states.includes('denied')) return 'denied';
      if (states.length > 0 && states.every((state) => state === 'granted')) return 'granted';
      return 'pending';
    },
  },
  { permission: 'camera', descriptors: [{ name: 'camera' as PermissionName }] },
  { permission: 'wakeLock', descriptors: [{ name: 'screen-wake-lock' as PermissionName }] },
  { permission: 'geolocation', descriptors: [{ name: 'geolocation' as PermissionName }] },
];

function toClientPermissionStatus(state: PermissionState): ClientPermissionStatus {
  if (state === 'granted') return 'granted';
  if (state === 'denied') return 'denied';
  return 'pending';
}

export async function readBrowserPermissionStatus(
  permission: ClientPermissionName,
  nav: Navigator = navigator
): Promise<ClientPermissionStatus | null> {
  const probe = browserPermissionProbes.find((entry) => entry.permission === permission);
  const permissionsApi = nav.permissions;
  if (!probe || !permissionsApi?.query) return null;

  const states: PermissionState[] = [];
  for (const descriptor of probe.descriptors) {
    try {
      const status = await permissionsApi.query(descriptor);
      states.push(status.state);
    } catch {
      // Browsers expose different permission descriptor sets; use any supported entries.
    }
  }

  if (states.length === 0) return null;
  return probe.combine ? probe.combine(states) : toClientPermissionStatus(states[0]);
}

export async function refreshBrowserPermissionSnapshot<T extends PermissionPatch>(
  store: PermissionStore<T>,
  nav: Navigator = navigator
): Promise<void> {
  const entries = await Promise.all(
    browserPermissionProbes.map(async ({ permission }) => {
      const status = await readBrowserPermissionStatus(permission, nav);
      return [permission, status] as const;
    })
  );

  const patch: PermissionPatch = {};
  for (const [permission, status] of entries) {
    if (status) patch[permission] = status;
  }
  if (Object.keys(patch).length === 0) return;

  store.update((current) => ({ ...current, ...patch }) as T);
}

export function observeBrowserPermissionChanges<T extends PermissionPatch>(
  store: PermissionStore<T>,
  nav: Navigator = navigator
): () => void {
  const permissionsApi = nav.permissions;
  if (!permissionsApi?.query) return () => undefined;

  const cleanups: Array<() => void> = [];
  const syncPermission = (permission: ClientPermissionName) => {
    void readBrowserPermissionStatus(permission, nav).then((status) => {
      if (!status) return;
      store.update((current) => ({ ...current, [permission]: status }) as T);
    });
  };

  for (const probe of browserPermissionProbes) {
    for (const descriptor of probe.descriptors) {
      void permissionsApi
        .query(descriptor)
        .then((status) => {
          const permissionStatus = status as PermissionStatusLike;
          const sync = () => syncPermission(probe.permission);
          syncPermission(probe.permission);

          if (permissionStatus.addEventListener && permissionStatus.removeEventListener) {
            permissionStatus.addEventListener('change', sync);
            cleanups.push(() => permissionStatus.removeEventListener?.('change', sync));
            return;
          }

          permissionStatus.onchange = sync;
          cleanups.push(() => {
            if (permissionStatus.onchange === sync) permissionStatus.onchange = null;
          });
        })
        .catch(() => undefined);
    }
  }

  return () => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  };
}
