/**
 * Purpose: Normalize remote asset references for Tone adapter registration.
 */
const ASSET_REF_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

export function normalizeRemoteAssetRef(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const hashIndex = trimmed.indexOf('#');
  const hash = hashIndex >= 0 ? trimmed.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;

  const queryIndex = withoutHash.indexOf('?');
  const search = queryIndex >= 0 ? withoutHash.slice(queryIndex) : '';
  const baseRef = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;

  const baseTrimmed = baseRef.trim();
  if (!baseTrimmed) return '';

  if (baseTrimmed.startsWith('asset:')) {
    const id = baseTrimmed.slice('asset:'.length).trim().split(/[?#]/)[0]?.trim() ?? '';
    return id ? `asset:${id}${search}${hash}` : '';
  }

  const shuguPrefix = 'shugu://asset/';
  if (baseTrimmed.startsWith(shuguPrefix)) {
    const id = baseTrimmed.slice(shuguPrefix.length).trim().split(/[?#]/)[0]?.trim() ?? '';
    return id ? `asset:${id}${search}${hash}` : '';
  }

  // Reject non-asset schemes (http(s), localfile, data, etc.).
  if (ASSET_REF_SCHEME_RE.test(baseTrimmed)) return '';

  // Treat bare values as asset IDs.
  const id = baseTrimmed.split(/[?#]/)[0]?.trim() ?? '';
  return id ? `asset:${id}${search}${hash}` : '';
}
