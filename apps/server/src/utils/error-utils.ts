/**
 * Purpose: Shared error helpers for server-side I/O.
 */
export function getErrorCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const raw = (err as { code?: unknown }).code;
  return typeof raw === 'string' ? raw : null;
}
