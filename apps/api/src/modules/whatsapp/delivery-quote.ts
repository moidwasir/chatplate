// Delivery zone lookup and fee rules for the WhatsApp checkout (Step 6).
// Pure functions so they can move into the Delivery Service in Phase 5 unchanged.

export interface ZoneLike {
  id: string;
  name: string;
  polygon: unknown; // GeoJSON Polygon: { type: 'Polygon', coordinates: [[[lng, lat], ...]] }
  feeType: 'FLAT' | 'PER_KM' | 'FREE_ABOVE';
  flatFee: number | null;
  perKmFee: number | null;
  freeAbove: number | null;
  minOrder: number;
  maxDistance: number | null;
}

export type DeliveryQuote =
  | { ok: true; zone: ZoneLike; fee: number; distanceKm: number | null }
  | { ok: false; reason: 'OUT_OF_ZONE' }
  | { ok: false; reason: 'BELOW_MINIMUM'; zone: ZoneLike; minOrder: number };

/**
 * Find the zone containing the pin and work out the fee for this basket.
 * @param subtotal  basket value in paisa
 * @param branch    branch location, used for per-km pricing and max distance
 */
export function quoteDelivery(
  zones: ZoneLike[],
  lat: number,
  lng: number,
  subtotal: number,
  branch: { lat: number | null; lng: number | null },
): DeliveryQuote {
  const distanceKm =
    branch.lat != null && branch.lng != null ? haversineKm(branch.lat, branch.lng, lat, lng) : null;

  const zone = zones.find(
    (z) =>
      pointInPolygon(lng, lat, z.polygon) &&
      (z.maxDistance == null || distanceKm == null || distanceKm <= z.maxDistance),
  );
  if (!zone) return { ok: false, reason: 'OUT_OF_ZONE' };
  if (subtotal < zone.minOrder) return { ok: false, reason: 'BELOW_MINIMUM', zone, minOrder: zone.minOrder };

  let fee: number;
  switch (zone.feeType) {
    case 'PER_KM':
      fee = (zone.perKmFee ?? 0) * Math.ceil(distanceKm ?? 0);
      break;
    case 'FREE_ABOVE':
    case 'FLAT':
    default:
      fee = zone.flatFee ?? 0;
  }
  if (zone.freeAbove != null && subtotal >= zone.freeAbove) fee = 0;

  return { ok: true, zone, fee, distanceKm };
}

/** Ray-casting test against the outer ring of a GeoJSON polygon */
function pointInPolygon(x: number, y: number, polygon: unknown): boolean {
  const ring = (polygon as any)?.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 3) return false;

  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}
