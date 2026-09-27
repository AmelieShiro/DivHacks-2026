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

/** How far the map looks for programs when a ZIP itself has none. */
export const SPILLOVER_MILES = 2;

/**
 * What a ZIP search found:
 * - `in-zip`: programs whose own address is in that ZIP.
 * - `nearby`: the ZIP is a real NYC ZIP with no K-5 programs in it (a STEM
 *   access desert), so the closest ones outside it are shown instead.
 * - `unknown`: not a ZIP the dataset has a centre for; nothing to measure from.
 * - `none`: no search yet.
 */
export type ZipMatchKind = "in-zip" | "nearby" | "unknown" | "none";

export type ZipMatch = {
  kind: ZipMatchKind;
  programs: CardProgram[];
  /** The ZIP's centre, to move the map to. Null when the ZIP is unknown. */
  center: { lat: number; lng: number } | null;
};

/**
 * The ZIP whose centre is closest to a point, so a browser location fix can
 * fill the ZIP box without a geocoding request.
 */
export function nearestZip(point: { lat: number; lng: number }, centroids: ZipCentroids): string | null {
  let best: { zip: string; d: number } | null = null;
  for (const [zip, c] of Object.entries(centroids)) {
    const d = miles(point, c);
    if (!best || d < best.d) best = { zip, d };
  }
  return best?.zip ?? null;
}

/** Distances from a point, nearest first, on the programs that have coordinates. */
function byDistanceFrom(list: CardProgram[], from: { lat: number; lng: number }) {
  return list
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => {
      const d = miles(from, { lat: p.lat!, lng: p.lng! });
      return { p: { ...p, distance: `${d.toFixed(1)} mi` }, d };
    })
    .sort((a, b) => a.d - b.d);
}

/**
 * The programs a typed ZIP code should surface, nearest first. Exact ZIP
 * matches win, because a parent who types 11226 means Flatbush and not
 * "somewhere within a mile"; only when the ZIP has no programs at all does
 * this widen to the closest ones around it, and it says so via `kind`.
 */
export function findByZip(list: CardProgram[], zip: string, centroids: ZipCentroids): ZipMatch {
  const clean = zip.trim();
  if (!/^\d{5}$/.test(clean)) return { kind: "none", programs: list, center: null };

  const center = centroids[clean] ?? null;
  if (!center) return { kind: "unknown", programs: list, center: null };

  const inZip = byDistanceFrom(list.filter((p) => p.zip === clean), center);
  if (inZip.length > 0) return { kind: "in-zip", programs: inZip.map((s) => s.p), center };

  const spillover = byDistanceFrom(list, center).filter((s) => s.d <= SPILLOVER_MILES);
  return { kind: "nearby", programs: spillover.map((s) => s.p), center };
}

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
