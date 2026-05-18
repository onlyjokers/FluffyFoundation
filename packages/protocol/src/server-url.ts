/**
 * Purpose: Shared local dev server URL resolution for manager and client entry pages.
 */
export type LocalServerUrlInput = {
  currentProtocol: string;
  hostname: string;
  port: string;
  origin: string;
  queryUrl?: string | null;
  savedUrl?: string | null;
  allowInsecureHttp?: boolean;
};

export function resolveLocalServerUrl(input: LocalServerUrlInput): string {
  const queryUrl = normalizeUrl(input.queryUrl);
  if (queryUrl) return queryUrl;

  const savedUrl = normalizeUrl(input.savedUrl);
  const isAccessingViaIP = input.hostname !== 'localhost' && input.hostname !== '127.0.0.1';
  const savedIsLocalhost = Boolean(savedUrl && (savedUrl.includes('localhost') || savedUrl.includes('127.0.0.1')));
  const savedIsHttp = Boolean(savedUrl && savedUrl.toLowerCase().startsWith('http:'));
  const savedLocalServerHttpUrl =
    savedUrl &&
    input.allowInsecureHttp &&
    savedUrl.toLowerCase().startsWith('https:') &&
    savedIsLocalhost &&
    safeUrlPort(savedUrl) === '3001'
      ? savedUrl.replace(/^https:/i, 'http:')
      : null;

  if (savedLocalServerHttpUrl) return savedLocalServerHttpUrl;

  if (savedUrl && (!savedIsHttp || input.allowInsecureHttp) && !(isAccessingViaIP && savedIsLocalhost)) {
    return savedUrl;
  }

  if (input.currentProtocol === 'https:' && input.port === '') {
    return input.origin;
  }

  const protocol = input.allowInsecureHttp ? 'http' : 'https';
  return `${protocol}://${input.hostname}:3001`;
}

function normalizeUrl(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : null;
}

function safeUrlPort(value: string): string | null {
  try {
    return new URL(value).port;
  } catch {
    return null;
  }
}
