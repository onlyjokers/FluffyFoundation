/**
 * Purpose: Normalize mic sensor payloads before sending them to the server.
 */

export type MicSensorFeatureInput = {
  rms: number;
  lowEnergy: number;
  highEnergy: number;
  bpm: number | null | undefined;
};

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function createMicSensorPayload(feature: MicSensorFeatureInput): Record<string, number> {
  const payload: Record<string, number> = {
    volume: finiteNumber(feature.rms) ?? 0,
    lowEnergy: finiteNumber(feature.lowEnergy) ?? 0,
    highEnergy: finiteNumber(feature.highEnergy) ?? 0,
  };

  const bpm = finiteNumber(feature.bpm);
  if (bpm !== null) payload.bpm = bpm;

  return payload;
}
