/**
 * Purpose: Convert data-image URLs to revocable object URLs for display refresh stability.
 */
const IMAGE_OBJECT_URL_REVOKE_DELAY_MS = 800; // allow the fade-out transition to finish

let activeImageObjectUrl: string | null = null;
let imageObjectUrlSeq = 0;

export function isDataImageUrl(url: string): boolean {
  return url.startsWith('data:image/');
}

function scheduleRevokeObjectUrl(url: string): void {
  if (!url) return;
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, IMAGE_OBJECT_URL_REVOKE_DELAY_MS);
}

export async function normalizeImageUrlForDisplay(url: string): Promise<string> {
  const seq = (imageObjectUrlSeq += 1);
  const trimmed = url.trim();
  if (!trimmed) {
    clearActiveImageObjectUrl();
    return url;
  }

  if (!isDataImageUrl(trimmed)) {
    clearActiveImageObjectUrl();
    return trimmed;
  }

  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    clearActiveImageObjectUrl();
    return trimmed;
  }

  const blob = await fetch(trimmed)
    .then((response) => response.blob())
    .catch(() => null);
  if (!blob) {
    clearActiveImageObjectUrl();
    return trimmed;
  }

  const objectUrl = URL.createObjectURL(blob);
  if (seq !== imageObjectUrlSeq) return objectUrl;
  const prev = activeImageObjectUrl;
  activeImageObjectUrl = objectUrl;
  if (prev) scheduleRevokeObjectUrl(prev);
  return objectUrl;
}

export function clearActiveImageObjectUrl(): void {
  imageObjectUrlSeq += 1;
  const prev = activeImageObjectUrl;
  activeImageObjectUrl = null;
  if (prev) scheduleRevokeObjectUrl(prev);
}
