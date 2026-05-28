/**
 * Purpose: Resolve ShuGu `asset:` references to concrete HTTP(S) URLs.
 *
 * This is intentionally small and dependency-free so it can be reused by:
 * - Multimedia preload/cache
 * - Tone.js audio nodes
 * - HTML image/video elements
 */

export type ResolveAssetRefOptions = {
  serverUrl: string;
  /**
   * Optional read token. When provided, it is appended as a query param
   * so media elements (img/video/audio) can load without custom headers.
   */
  readToken?: string | null;
};

function decodeAssetId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function normalizeAssetRef(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  if (s.startsWith('asset:')) {
    const id = decodeAssetId(s.slice('asset:'.length).trim().split(/[?#]/)[0]?.trim() ?? '');
    return id ? `asset:${id}` : null;
  }

  const shuguPrefix = 'shugu://asset/';
  if (s.startsWith(shuguPrefix)) {
    const id = decodeAssetId(s.slice(shuguPrefix.length).trim().split(/[?#]/)[0]?.trim() ?? '');
    return id ? `asset:${id}` : null;
  }

  return null;
}

export function normalizeLocalFileRef(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  if (s.startsWith('localfile:')) {
    const filePath = s.slice('localfile:'.length).trim().split(/[?#]/)[0]?.trim() ?? '';
    return filePath ? `localfile:${filePath}` : null;
  }

  const shuguPrefix = 'shugu://local-file/';
  if (s.startsWith(shuguPrefix)) {
    const encoded = s.slice(shuguPrefix.length).trim().split(/[?#]/)[0]?.trim() ?? '';
    if (!encoded) return null;
    try {
      const decoded = decodeURIComponent(encoded);
      return decoded.trim() ? `localfile:${decoded.trim()}` : null;
    } catch {
      return `localfile:${encoded}`;
    }
  }

  return null;
}

export function parseAssetIdFromRef(raw: string): string | null {
  const normalized = normalizeAssetRef(raw);
  if (!normalized) return null;
  const id = normalized.slice('asset:'.length).trim();
  return id ? id : null;
}

export function resolveAssetRefToUrl(raw: string, opts: ResolveAssetRefOptions): string {
  const trimmed = raw.trim();
  if (!trimmed) return raw;

  // Preserve `?query` + `#hash` so callers can embed lightweight clip params like:
  // `asset:<id>#t=0,1&loop=1&play=1&rev=0&p=0.5`
  const hashIndex = trimmed.indexOf('#');
  const hash = hashIndex >= 0 ? trimmed.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;

  const queryIndex = withoutHash.indexOf('?');
  const search = queryIndex >= 0 ? withoutHash.slice(queryIndex) : '';
  const baseRef = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;

  const base = (() => {
    try {
      return new URL(opts.serverUrl).origin;
    } catch {
      return null;
    }
  })();

  if (!base) return raw;

  const normalizedAsset = normalizeAssetRef(baseRef);
  if (normalizedAsset) {
    const id = normalizedAsset.slice('asset:'.length).trim();
    if (!id) return raw;

    const url = new URL(`/api/assets/${encodeURIComponent(id)}/content`, base);
    if (search) {
      try {
        const existing = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
        existing.forEach((value, key) => url.searchParams.append(key, value));
      } catch {
        // ignore invalid search params
      }
    }
    const token =
      typeof opts.readToken === 'string' && opts.readToken.trim() ? opts.readToken.trim() : null;
    if (token) url.searchParams.set('token', token);
    if (hash) url.hash = hash.startsWith('#') ? hash : `#${hash}`;
    return url.toString();
  }

  const normalizedLocal = normalizeLocalFileRef(baseRef);
  if (normalizedLocal) {
    const filePath = normalizedLocal.slice('localfile:'.length).trim();
    if (!filePath) return raw;

    const url = new URL('/api/local-media/content', base);
    url.searchParams.set('path', filePath);
    if (search) {
      try {
        const existing = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
        existing.forEach((value, key) => {
          // Prevent query injection from overwriting the local file target.
          if (key === 'path') return;
          url.searchParams.append(key, value);
        });
      } catch {
        // ignore invalid search params
      }
    }
    const token =
      typeof opts.readToken === 'string' && opts.readToken.trim() ? opts.readToken.trim() : null;
    if (token) url.searchParams.set('token', token);
    if (hash) url.hash = hash.startsWith('#') ? hash : `#${hash}`;
    return url.toString();
  }

  return raw;
}
