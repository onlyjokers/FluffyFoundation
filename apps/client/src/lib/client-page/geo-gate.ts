/**
 * Purpose: Shared geofence helpers for the client startup page.
 */
export function haversineDistanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const r = 6371_000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return r * c;
}

export function formatMeters(value: number): string {
  const m = Math.max(0, Math.round(value));
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(2)}km`;
}
