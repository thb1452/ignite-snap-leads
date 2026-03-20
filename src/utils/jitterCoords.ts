/**
 * Deterministic coordinate jitter for non-unlocked properties.
 * Uses a simple hash of the property ID to produce consistent ±0.005° offsets,
 * so the same property always appears in the same jittered position.
 */
export function jitterCoords(
  lat: number,
  lng: number,
  propertyId: string
): { lat: number; lng: number } {
  let hash = 0;
  for (let i = 0; i < propertyId.length; i++) {
    hash = (hash * 31 + propertyId.charCodeAt(i)) | 0;
  }
  // Normalize hash to [-0.005, +0.005]
  const latOffset = ((hash & 0xffff) / 0xffff - 0.5) * 0.01;
  const lngOffset = (((hash >> 16) & 0xffff) / 0xffff - 0.5) * 0.01;
  return { lat: lat + latOffset, lng: lng + lngOffset };
}
