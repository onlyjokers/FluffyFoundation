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

const DEV_PASSWORD = import.meta.env.DEV
  ? (import.meta.env.VITE_SHUGU_MANAGER_DEV_PASSWORD ?? '')
  : '';
const COOKIE_NAME = 'shugu-manager-auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function isAuthUser(value: string): value is AuthUser {
  return (ALLOWED_USERNAMES as readonly string[]).includes(value);
}

export function isDevPasswordLoginEnabled(): boolean {
  return import.meta.env.DEV && DEV_PASSWORD.length > 0;
}

function readCookie(name: string): string | null {
  if (!browser) return null;

  const entry = document.cookie.split('; ').find((part) => part.trim().startsWith(`${name}=`));

  if (!entry) return null;
  const [, value] = entry.split('=');
  return value ? decodeURIComponent(value) : null;
}

function writeCookie(value: string, maxAge: number): void {
  if (!browser) return;

  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function clearCookie(): void {
  if (!browser) return;

  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE_NAME}=; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>({
    user: null,
    error: null,
    isRestoring: browser,
    remember: false,
  });

  const restore = () => {
    if (!browser) return;

    update((state) => ({ ...state, isRestoring: true }));

    const cookieUser = readCookie(COOKIE_NAME);

    if (cookieUser && isAuthUser(cookieUser)) {
      set({ user: cookieUser, error: null, isRestoring: false, remember: true });
      return;
    }

    clearCookie();
    set({ user: null, error: null, isRestoring: false, remember: false });
  };

  const persist = (user: AuthUser, remember: boolean) => {
    if (!browser) return;
    if (remember) {
      writeCookie(user, COOKIE_MAX_AGE);
    } else {
      clearCookie();
    }
  };

  const login = (usernameInput: string, password: string, remember: boolean): LoginResult => {
    const normalized = usernameInput.trim();

    if (!isAuthUser(normalized)) {
      update((state) => ({ ...state, error: '未知用户' }));
      return { ok: false, reason: 'invalid-user' };
    }

    if (!isDevPasswordLoginEnabled() || password !== DEV_PASSWORD) {
      update((state) => ({ ...state, error: '密码错误' }));
      return { ok: false, reason: 'invalid-password' };
    }

    set({ user: normalized, error: null, isRestoring: false, remember });
    persist(normalized, remember);

    return { ok: true };
  };

  const logout = () => {
    clearCookie();
    set({ user: null, error: null, isRestoring: false, remember: false });
  };

  const clearError = () => {
    update((state) => ({ ...state, error: null }));
  };

  if (browser) {
    restore();
  }

  return { subscribe, login, logout, restore, clearError };
}

export const auth = createAuthStore();
