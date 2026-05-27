import { browser } from '$app/environment';
import { writable } from 'svelte/store';

export const ALLOWED_USERNAMES = ['Eureka', 'Starno', 'VKong'] as const;
export type AuthUser = (typeof ALLOWED_USERNAMES)[number];

type AuthState = {
  user: AuthUser | null;
  error: string | null;
  isRestoring: boolean;
  remember: boolean;
};

type LoginResult = { ok: true } | { ok: false; reason: string };

const SERVER_URL_STORAGE_KEY = 'shugu-server-url';
const SESSION_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;

function isAuthUser(value: string): value is AuthUser {
  return (ALLOWED_USERNAMES as readonly string[]).includes(value);
}

export function isDevPasswordLoginEnabled(): boolean {
  return true;
}

function readServerUrl(): string {
  if (!browser) return '';
  try {
    return localStorage.getItem(SERVER_URL_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function buildUrl(serverUrl: string, path: string): string | null {
  const baseRaw = serverUrl.trim();
  if (!baseRaw) return null;
  try {
    const base = baseRaw.endsWith('/') ? baseRaw : `${baseRaw}/`;
    return new URL(path, base).toString();
  } catch {
    return null;
  }
}

async function fetchJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, { ...init, credentials: 'include' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text ? `HTTP ${res.status}: ${text}` : `HTTP ${res.status}`);
  }
  const data = await res.json().catch(() => ({}));
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
}

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>({
    user: null,
    error: null,
    isRestoring: false,
    remember: true,
  });
  let sessionRefreshTimer: ReturnType<typeof setInterval> | null = null;

  const stopSessionRefresh = () => {
    if (!sessionRefreshTimer) return;
    clearInterval(sessionRefreshTimer);
    sessionRefreshTimer = null;
  };

  const startSessionRefresh = () => {
    if (!browser || sessionRefreshTimer) return;
    sessionRefreshTimer = setInterval(() => {
      void restore({ silent: true });
    }, SESSION_REFRESH_INTERVAL_MS);
  };

  const restore = async (
    serverUrlInputOrOptions?: string | { silent?: boolean },
    options: { silent?: boolean } = {}
  ): Promise<void> => {
    if (!browser) return;
    const serverUrlInput = typeof serverUrlInputOrOptions === 'string' ? serverUrlInputOrOptions : undefined;
    const silent = typeof serverUrlInputOrOptions === 'object' ? Boolean(serverUrlInputOrOptions.silent) : Boolean(options.silent);
    if (!silent) {
      update((state) => ({ ...state, isRestoring: true, error: null }));
    }
    const url = buildUrl(serverUrlInput ?? readServerUrl(), 'api/manager/auth/session');
    if (!url) {
      set({ user: null, error: null, isRestoring: false, remember: true });
      stopSessionRefresh();
      return;
    }

    try {
      const data = await fetchJson(url, { method: 'GET' });
      const user = typeof data.user === 'string' && isAuthUser(data.user) ? data.user : null;
      set({ user, error: null, isRestoring: false, remember: true });
      if (user) startSessionRefresh();
      else stopSessionRefresh();
    } catch {
      if (silent) return;
      set({ user: null, error: null, isRestoring: false, remember: true });
      stopSessionRefresh();
    }
  };

  const login = async (
    usernameInput: string,
    password: string,
    serverUrlInput?: string
  ): Promise<LoginResult> => {
    const normalized = usernameInput.trim();
    if (!isAuthUser(normalized)) {
      update((state) => ({ ...state, error: '未知用户' }));
      return { ok: false, reason: 'invalid-user' };
    }

    const url = buildUrl(serverUrlInput ?? readServerUrl(), 'api/manager/auth/login');
    if (!url) {
      update((state) => ({ ...state, error: 'Server URL 无效' }));
      return { ok: false, reason: 'invalid-server-url' };
    }

    try {
      const data = await fetchJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: normalized, password }),
      });
      const user = typeof data.user === 'string' && isAuthUser(data.user) ? data.user : normalized;
      set({ user, error: null, isRestoring: false, remember: true });
      startSessionRefresh();
      return { ok: true };
    } catch {
      update((state) => ({ ...state, error: '密码错误或无法连接 server' }));
      return { ok: false, reason: 'invalid-password' };
    }
  };

  const logout = async (): Promise<void> => {
    const url = buildUrl(readServerUrl(), 'api/manager/auth/logout');
    if (url) {
      await fetch(url, { method: 'POST', credentials: 'include' }).catch(() => undefined);
    }
    stopSessionRefresh();
    set({ user: null, error: null, isRestoring: false, remember: true });
  };

  const clearError = () => {
    update((state) => ({ ...state, error: null }));
  };

  return { subscribe, login, logout, restore, clearError };
}

export const auth = createAuthStore();
