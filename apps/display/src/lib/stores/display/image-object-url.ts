/**
 * Purpose: Normalize Display image URLs while keeping streaming data-image frames off the blob URL path.
 */
export function isDataImageUrl(url: string): boolean {
  return url.startsWith('data:image/');
}

export async function normalizeImageUrlForDisplay(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed) return url;
  return trimmed;
}

export function clearActiveImageObjectUrl(): void {
  // Streaming display frames remain data URLs, so there is no display-owned object URL to revoke.
}
