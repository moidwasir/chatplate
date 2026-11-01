// Delivery zone lookup and fee rules for the WhatsApp checkout (Step 6).
// Pure functions so they can move into the Delivery Service in Phase 5 unchanged.

export interface ZoneLike {
  id: string;
  name: string;
  /** GeoJSON Polygon { type: 'Polygon', coordinates: [[[lng, lat], ...]] }; null = within maxDistance km of the branch */
  polygon: unknown;
  feeType: 'FLAT' | 'PER_KM' | 'FREE_ABOVE';
  flatFee: number | null;
  perKmFee: number | null;
  freeAbove: number | null;
  minOrder: number;
  maxDistance: number | null;
}

export type DeliveryQuote =
  | { ok: true; zone: ZoneLike; fee: number; distanceKm: number | null }
  | { ok: false; reason: 'OUT_OF_ZONE'; distanceKm: number | null }
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

  // Drawn areas first, then radius zones from the smallest circle out (so "0–5 km" wins over "0–10 km")
  const ordered = [
    ...zones.filter((z) => z.polygon != null),
    ...zones.filter((z) => z.polygon == null).sort((a, b) => (a.maxDistance ?? Infinity) - (b.maxDistance ?? Infinity)),
  ];
  const zone = ordered.find((z) =>
    z.polygon == null
      ? z.maxDistance != null && distanceKm != null && distanceKm <= z.maxDistance
      : pointInPolygon(lng, lat, z.polygon) && (z.maxDistance == null || distanceKm == null || distanceKm <= z.maxDistance),
  );
  if (!zone) return { ok: false, reason: 'OUT_OF_ZONE', distanceKm };
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
