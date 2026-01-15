/**
 * Purpose: Safe request/body/query parsing helpers for server controllers.
 */
const readStringValue = (value: unknown, trim = true): string | null => {
  if (typeof value === 'string') {
    const raw = trim ? value.trim() : value;
    return raw ? raw : null;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    const raw = trim ? value[0].trim() : value[0];
    return raw ? raw : null;
  }
  return null;
};

export function getQueryString(query: unknown, key: string): string | null {
  if (!query || typeof query !== 'object') return null;
  const raw = (query as Record<string, unknown>)[key];
  return readStringValue(raw, false);
}

export function getBodyString(body: unknown, key: string): string | null {
  if (!body || typeof body !== 'object') return null;
  const raw = (body as Record<string, unknown>)[key];
  return readStringValue(raw, true);
}
