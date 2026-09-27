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

/** How far from a searched ZIP's centre a program may be and still be listed. */
export const RADIUS_MILES = 1;

/**
 * Programs within `radius` miles of a ZIP's centre, nearest first, with
 * "0.4 mi" distances. Without a known ZIP there is nothing to measure from,
 * so every program is returned with its borough as the badge.
 *
 * `nearestMiles` is the closest program's distance even when it falls
 * outside the radius, so an empty result can say how far the nearest one is.
 */
export function withDistance(
  list: CardProgram[],
  zip: string,
  centroids: ZipCentroids,
  radius = RADIUS_MILES,
): { programs: CardProgram[]; measured: boolean; nearestMiles: number | null } {
  const from = centroids[zip.trim()];
  if (!from) {
    return { programs: list.map((p) => ({ ...p, distance: p.borough || null })), measured: false, nearestMiles: null };
  }
  const scored = list
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => {
      const d = miles(from, { lat: p.lat!, lng: p.lng! });
      return { p: { ...p, distance: `${d.toFixed(1)} mi` }, d };
    })
    .sort((a, b) => a.d - b.d);
  return {
    programs: scored.filter((s) => s.d <= radius).map((s) => s.p),
    measured: true,
    nearestMiles: scored[0]?.d ?? null,
  };
}
