/**
 * Purpose: Convert data-image URLs to revocable object URLs for display refresh stability.
 */
const IMAGE_OBJECT_URL_REVOKE_DELAY_MS = 800; // allow the fade-out transition to finish

let activeImageObjectUrl: string | null = null;

export function isDataImageUrl(url: string): boolean {
  return url.startsWith('data:image/');
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  if (typeof dataUrl !== 'string') return null;
  if (!dataUrl.startsWith('data:')) return null;

  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;

  const meta = dataUrl.slice(5, comma);
  const data = dataUrl.slice(comma + 1);
  const parts = meta.split(';').map((s) => s.trim()).filter(Boolean);
  const mime = parts[0] && parts[0].includes('/') ? parts[0] : 'application/octet-stream';
  const isBase64 = parts.includes('base64');

  try {
    if (!isBase64) {
      const decoded = decodeURIComponent(data);
      return new Blob([decoded], { type: mime });
    }

    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
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

export function normalizeImageUrlForDisplay(url: string): string {
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

  const blob = dataUrlToBlob(trimmed);
  if (!blob) {
    clearActiveImageObjectUrl();
    return trimmed;
  }

  const objectUrl = URL.createObjectURL(blob);
  const prev = activeImageObjectUrl;
  activeImageObjectUrl = objectUrl;
  if (prev) scheduleRevokeObjectUrl(prev);
  return objectUrl;
}

export function clearActiveImageObjectUrl(): void {
  const prev = activeImageObjectUrl;
  activeImageObjectUrl = null;
  if (prev) scheduleRevokeObjectUrl(prev);
}
