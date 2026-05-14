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

  if (savedUrl && (!savedIsHttp || input.allowInsecureHttp) && !(isAccessingViaIP && savedIsLocalhost)) {
    return savedUrl;
  }

  if (input.currentProtocol === 'https:' && input.port === '') {
    return input.origin;
  }

  return `https://${input.hostname}:3001`;
}

function normalizeUrl(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed ? trimmed : null;
}
