import type { CardProgram, ZipCentroids } from "./types";

/** Straight-line miles between two points (haversine). */
export function miles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Add "0.4 mi" distances from a ZIP's centre and sort nearest first. Without
 * a known ZIP there is nothing to measure from, so the badge shows the
 * borough instead and the order is unchanged.
 */
export function withDistance(list: CardProgram[], zip: string, centroids: ZipCentroids): {
  programs: CardProgram[];
  measured: boolean;
} {
  const from = centroids[zip.trim()];
  if (!from) return { programs: list.map((p) => ({ ...p, distance: p.borough || null })), measured: false };
  const scored = list.map((p) => {
    const d = p.lat != null && p.lng != null ? miles(from, { lat: p.lat, lng: p.lng }) : null;
    return { p: { ...p, distance: d == null ? p.borough : `${d.toFixed(1)} mi` }, d: d ?? Infinity };
  });
  scored.sort((a, b) => a.d - b.d);
  return { programs: scored.map((s) => s.p), measured: true };
}
