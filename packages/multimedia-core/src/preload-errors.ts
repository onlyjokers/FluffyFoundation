/**
 * Purpose: FF-16 asset preload timeout/retry error helpers.
 */

import { createAssetError, type AssetError } from '@shugu/protocol';

export function isAssetError(err: unknown): err is AssetError {
  return Boolean(err && typeof err === 'object' && 'code' in err && 'message' in err && 'retryable' in err && 'action' in err);
}

export function toAssetPreloadError(assetId: string, err: unknown): AssetError {
  if (isAssetError(err)) return err;
  const message = err instanceof Error ? err.message : String(err);
  if (/\(404\)|\b404\b|not found/i.test(message)) {
    return createAssetError({
      code: 'ASSET_NOT_FOUND',
      assetId,
      message: `asset ${assetId} was not found by the asset service`,
      retryable: false,
      action: 'Upload the asset or remove the reference before show start.',
    });
  }
  return createAssetError({
    code: 'ASSET_PRELOAD_FAILED',
    assetId,
    message,
    retryable: true,
    action: 'Retry preload and inspect asset service logs for this asset.',
  });
}

export async function withAssetTimeout<T>(promise: Promise<T>, input: { assetId: string; timeoutMs: number }): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            createAssetError({
              code: 'ASSET_PRELOAD_TIMEOUT',
              assetId: input.assetId,
              message: `asset ${input.assetId} preload timed out after ${input.timeoutMs}ms`,
              retryable: true,
              action: 'Retry preload; if this repeats, check network, asset size, and cache policy.',
            })
          );
        }, input.timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
