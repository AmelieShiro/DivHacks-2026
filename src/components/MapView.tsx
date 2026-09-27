"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  AdvancedMarker,
  APIProvider,
  CollisionBehavior,
  ControlPosition,
  Map as GoogleMap,
  MapControl,
  useMap,
} from "@vis.gl/react-google-maps";
import FlaskIcon from "./FlaskIcon";
import ProgramImage from "./ProgramImage";
import { findByZip, nearestZip, SPILLOVER_MILES } from "@/lib/geo";
import type { CardProgram, SubjectGroup, ZipCentroids } from "@/lib/types";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
/** Advanced markers need a map ID; Google's DEMO_MAP_ID works for development. */
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

const NYC = { lat: 40.7128, lng: -73.95 };
const CITY_ZOOM = 11;
/** Wide enough that a ZIP and its immediate surroundings are both on screen. */
const ZIP_ZOOM = 13;

type LatLng = { lat: number; lng: number };
type Camera = { center: LatLng; zoom?: number };
type Bounds = google.maps.LatLngBoundsLiteral;

/* ------------------------------------------------------------------ markers */

/** The map glyph: a flask in a round pin, dark and enlarged once picked. */
function FlaskPin({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="group relative flex flex-col items-center">
      <div
        className={`grid place-items-center rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.3)] transition-all duration-150 ${
          active
            ? "h-10 w-10 bg-ink ring-2 ring-white text-white"
            : "h-7 w-7 bg-white ring-1 ring-black/10 text-orange group-hover:h-9 group-hover:w-9 group-hover:bg-orange group-hover:text-white"
        }`}
      >
        <FlaskIcon className={active ? "h-5 w-5" : "h-4 w-4 group-hover:h-5 group-hover:w-5"} />
      </div>
      {/* The pin's point, so the pin sits on its coordinate rather than above it. */}
      <span
        className={`-mt-px h-2 w-2 rotate-45 rounded-[1px] ${active ? "bg-ink" : "bg-white group-hover:bg-orange"}`}
      />
      <span
        className={`pointer-events-none absolute top-full left-1/2 mt-1 max-w-[180px] -translate-x-1/2 truncate rounded-full bg-ink px-2 py-0.5 font-heading text-[11px] font-600 text-white shadow-md ${
          active ? "" : "hidden group-hover:block"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

/* ------------------------------------------------------- map plumbing */

/** Moves the camera when the list or the ZIP box asks it to. */
function PanTo({ camera }: { camera: Camera | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !camera) return;
    map.panTo(camera.center);
    if (camera.zoom != null) map.setZoom(camera.zoom);
  }, [map, camera]);
  return null;
}

/** Fills the ZIP box from the browser's location, matching it to a ZIP centre. */
function LocateMe({ onLocate }: { onLocate: (point: LatLng) => void }) {
  const [busy, setBusy] = useState(false);

  const locate = () => {
    if (!navigator.geolocation) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        onLocate({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => setBusy(false),
      { timeout: 8000 },
    );
  };

  return (
    <button
      type="button"
      onClick={locate}
      aria-label="Use my location"
      className="m-2.5 grid h-10 w-10 place-items-center rounded-lg bg-white text-ink/70 shadow-md ring-1 ring-black/10 transition-colors hover:bg-teal-50 hover:text-ink"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={busy ? "animate-pulse" : undefined}
      >
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        <circle cx="12" cy="12" r="7" />
        <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );
}

/* ---------------------------------------------------------------- sidebar */

type Tile = { url: string | null; label: string; stock: CardProgram["imageStock"] };

/**
 * The thumbnail strip, mirroring the store cards' dish row: provider photos
 * captioned with the subjects and tools evidenced on the provider's site.
 * Always three tiles wide so the list reads as one column; a tile with no
 * photo is a flask, and a tile with no caption claims nothing.
 */
const TILES = 3;

function tilesFor(p: CardProgram): Tile[] {
  const labels = [...new Set([...p.tools, ...p.subjects])];
  const captions = labels.length > 0 ? labels : ["DYCD after-school"];
  // programs.ts fills the row to TILES: the provider's own photos first, then
  // credited stock. Each entry carries its own credit because a row can mix
  // the two, and CC BY needs the attribution wherever the photo shows.
  return Array.from({ length: TILES }, (_, i) => ({
    url: p.images[i]?.url ?? null,
    label: captions[i] ?? "",
    stock: p.images[i]?.stock ?? null,
  }));
}

function ProgramRow({
  program,
  active,
  onSelect,
  onShowOnMap,
  cardRef,
}: {
  program: CardProgram;
  active: boolean;
  onSelect: () => void;
  onShowOnMap: () => void;
  cardRef: (el: HTMLElement | null) => void;
}) {
  return (
    <article
      ref={cardRef}
      onClick={onSelect}
      className={`cursor-pointer scroll-mt-28 border-b border-black/5 px-4 py-4 transition-colors ${
        active ? "bg-teal-50 ring-2 ring-inset ring-orange" : "hover:bg-teal-50/50"
      }`}
    >
      <h3 className="font-heading text-[15px] font-700 leading-snug text-ink">{program.name}</h3>
      <p className="mt-0.5 font-body text-xs text-ink/60">
        {[program.cost, program.ages, program.distance].filter(Boolean).join(" · ")}
      </p>
      <p className="mt-1 flex items-center gap-1.5 font-body text-xs font-600 text-teal-600">
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
        <span className="truncate">{program.days}</span>
      </p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {tilesFor(program).map((tile, i) => (
          <div key={i}>
            {/* relative: ProgramImage positions the stock-photo credit on it */}
            <div className="relative grid aspect-square place-items-center overflow-hidden rounded-lg bg-teal-50 ring-1 ring-black/5">
              <ProgramImage
                src={tile.url}
                alt=""
                stock={tile.stock}
                className="h-full w-full object-cover"
                fallback={<FlaskIcon className="h-6 w-6 text-teal-300" />}
              />
            </div>
            {tile.label && (
              <p className="mt-1 line-clamp-2 font-body text-[11px] leading-tight text-ink/70">{tile.label}</p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <a
          href={program.signupUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="rounded-lg bg-orange px-2 py-2 text-center font-heading text-xs font-600 text-white transition-colors hover:bg-orange-dark"
        >
          View &amp; sign up
        </a>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onShowOnMap();
          }}
          className="rounded-lg px-2 py-2 text-center font-heading text-xs font-600 text-ink ring-1 ring-black/15 transition-colors hover:bg-teal-50"
        >
          Show on map
        </button>
      </div>

      <p className="mt-2 font-body text-[11px] text-ink/45">
        {[program.org, program.neighborhood, program.zip].filter(Boolean).join(" · ")}
      </p>
    </article>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 font-heading text-xs font-600 transition-colors ${
        active ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-black/12 hover:bg-teal-50"
      }`}
    >
      {children}
    </button>
  );
}

/** The subject chip, which opens the dataset's own subject headings. */
function SubjectChip({
  groups,
  selected,
  onChange,
}: {
  groups: SubjectGroup[];
  selected: string | null;
  onChange: (subject: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (subject: string | null) => {
    onChange(subject);
    setOpen(false);
  };

  return (
    <div ref={root} className="shrink-0">
      <Chip active={selected !== null} onClick={() => setOpen((o) => !o)}>
        {selected ?? "Subject"} <span aria-hidden="true">▾</span>
      </Chip>
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-2 max-h-72 overflow-y-auto rounded-xl bg-white p-2 shadow-xl ring-1 ring-black/10">
          <button
            type="button"
            onClick={() => pick(null)}
            className="w-full rounded-lg px-3 py-2 text-left font-body text-sm font-600 text-ink hover:bg-teal-50"
          >
            All subjects
          </button>
          {groups.map((g) => (
            <div key={g.heading}>
              <p className="px-3 pb-1 pt-3 font-heading text-[11px] font-700 uppercase tracking-wide text-ink/45">
                {g.heading}
              </p>
              {g.options.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => pick(o.label)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left font-body text-sm font-600 transition-colors ${
                    selected === o.label ? "bg-orange text-white" : "text-ink hover:bg-teal-50"
                  }`}
                >
                  <span>{o.label}</span>
                  <span className={`text-xs ${selected === o.label ? "text-white" : "text-ink/45"}`}>{o.count}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- page */

const inBounds = (p: CardProgram, b: Bounds) =>
  p.lat! <= b.north && p.lat! >= b.south && p.lng! <= b.east && p.lng! >= b.west;

/** Grow the viewport a little so pins do not pop in at the edges while panning. */
function padded(b: Bounds): Bounds {
  const dLat = (b.north - b.south) * 0.2;
  const dLng = (b.east - b.west) * 0.2;
  return { north: b.north + dLat, south: b.south - dLat, east: b.east + dLng, west: b.west - dLng };
}

export default function MapView({
  programs,
  subjectGroups,
  centroids,
  zip: initialZip,
}: {
  programs: CardProgram[];
  subjectGroups: SubjectGroup[];
  centroids: ZipCentroids;
  /** From ?zip=, read by the server page. */
  zip: string;
}) {
  const pathname = usePathname();
  const mappable = useMemo(() => programs.filter((p) => p.lat != null && p.lng != null), [programs]);

  const [zip, setZip] = useState(() => initialZip.replace(/\D/g, "").slice(0, 5));
  const [subject, setSubject] = useState<string | null>(null);
  const [freeOnly, setFreeOnly] = useState(false);
  const [inSchoolOnly, setInSchoolOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchAsIMove, setSearchAsIMove] = useState(true);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [camera, setCamera] = useState<Camera | null>(null);

  const cards = useRef(new Map<string, HTMLElement>());
  const listTop = useRef<HTMLDivElement>(null);

  const match = useMemo(() => findByZip(mappable, zip, centroids), [mappable, zip, centroids]);
  const zipActive = match.kind === "in-zip" || match.kind === "nearby";

  /** Everything the chips allow. Markers come from here, so panning reveals
   *  pins the list has scrolled past rather than an empty map. */
  const filtered = useMemo(
    () =>
      match.programs.filter(
        (p) =>
          (!freeOnly || p.cost === "Free") &&
          (!inSchoolOnly || p.tag === "In school") &&
          (subject === null || p.subjects.includes(subject)),
      ),
    [match.programs, freeOnly, inSchoolOnly, subject],
  );

  /** A ZIP search is a deliberate question, so its answer is never clipped by
   *  where the map happens to be looking. */
  const listed = useMemo(() => {
    if (zipActive || !searchAsIMove || !bounds) return filtered;
    return filtered.filter((p) => inBounds(p, bounds));
  }, [filtered, zipActive, searchAsIMove, bounds]);

  const pinned = useMemo(() => {
    if (!bounds) return [];
    const view = padded(bounds);
    return filtered.filter((p) => inBounds(p, view));
  }, [filtered, bounds]);

  const applyZip = useCallback(
    (next: string) => {
      const digits = next.replace(/\D/g, "").slice(0, 5);
      setZip(digits);
      setSelectedId(null);
      const centre = centroids[digits];
      if (centre) setCamera({ center: centre, zoom: ZIP_ZOOM });
      else if (digits === "") setCamera({ center: NYC, zoom: CITY_ZOOM });
      window.history.replaceState(null, "", digits ? `${pathname}?zip=${digits}` : pathname);
      listTop.current?.scrollTo({ top: 0 });
    },
    [centroids, pathname],
  );

  // Clicking a pin is how the list is steered, so bring its card into view.
  useEffect(() => {
    if (selectedId) cards.current.get(selectedId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId, listed]);

  const heading =
    match.kind === "in-zip"
      ? `Programs in ${zip}`
      : match.kind === "nearby"
        ? `Nearest programs to ${zip}`
        : "All programs";

  const subheading = () => {
    const n = listed.length;
    const count = `${n} ${n === 1 ? "program" : "programs"}`;
    if (match.kind === "nearby") return `${count} within ${SPILLOVER_MILES} miles · no program sits inside ${zip}`;
    if (match.kind === "in-zip") return `${count} · nearest first`;
    if (match.kind === "unknown") return `${count} · we don’t know ZIP ${zip}, so all are shown`;
    if (searchAsIMove) return `${count} in this map area · tap a flask to see its program`;
    return `${count} across the five boroughs`;
  };

  return (
    <div className="flex w-full flex-col-reverse lg:h-[calc(100dvh-4rem)] lg:flex-row">
      {/* Sidebar */}
      <aside
        ref={listTop}
        className="relative w-full overflow-y-auto bg-white lg:h-full lg:w-[400px] lg:shrink-0 lg:border-r lg:border-black/10"
      >
        <div className="sticky top-0 z-20 border-b border-black/5 bg-white/95 px-4 py-3 backdrop-blur">
          <form onSubmit={(e) => e.preventDefault()} className="flex items-center gap-2 rounded-full bg-teal-50 px-3 ring-1 ring-black/10 focus-within:ring-2 focus-within:ring-orange">
            <svg
              aria-hidden="true"
              className="shrink-0 text-teal-600"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <input
              value={zip}
              onChange={(e) => applyZip(e.target.value)}
              inputMode="numeric"
              maxLength={5}
              aria-label="ZIP code"
              placeholder="Enter your ZIP code"
              className="w-full bg-transparent py-2.5 font-body text-sm text-ink placeholder:text-ink/45 focus:outline-none"
            />
            {zip !== "" && (
              <button
                type="button"
                onClick={() => applyZip("")}
                aria-label="Clear ZIP code"
                className="shrink-0 rounded-full p-1 text-ink/45 transition-colors hover:bg-white hover:text-ink"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
          </form>

          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
            <Chip active={freeOnly} onClick={() => setFreeOnly((v) => !v)}>
              Free
            </Chip>
            <Chip active={inSchoolOnly} onClick={() => setInSchoolOnly((v) => !v)}>
              In a school
            </Chip>
            <SubjectChip groups={subjectGroups} selected={subject} onChange={setSubject} />
          </div>
        </div>

        <div className="px-4 pb-1 pt-4">
          <h1 className="font-heading text-xl font-700 text-ink">{heading}</h1>
          <p className="mt-0.5 font-body text-xs text-ink/55">{subheading()}</p>
        </div>

        {listed.length > 0 ? (
          listed.map((p) => (
            <ProgramRow
              key={p.id}
              program={p}
              active={p.id === selectedId}
              onSelect={() => setSelectedId(p.id)}
              onShowOnMap={() => {
                setSelectedId(p.id);
                setCamera({ center: { lat: p.lat!, lng: p.lng! } });
              }}
              cardRef={(el) => {
                if (el) cards.current.set(p.id, el);
                else cards.current.delete(p.id);
              }}
            />
          ))
        ) : (
          <div className="px-4 py-10 text-center">
            <FlaskIcon className="mx-auto h-8 w-8 text-teal-200" />
            <p className="mt-3 font-heading font-600 text-ink">Nothing here yet</p>
            <p className="mt-1 font-body text-sm text-ink/55">
              {zipActive
                ? "Try a neighbouring ZIP code, or clear a filter."
                : "Zoom out, move the map, or clear a filter."}
            </p>
          </div>
        )}
      </aside>

      {/* Map */}
      <div className="relative h-[55vh] min-h-[280px] w-full bg-teal-800 lg:h-full lg:flex-1">
        {API_KEY ? (
          <APIProvider apiKey={API_KEY}>
            <GoogleMap
              className="absolute inset-0"
              mapId={MAP_ID}
              defaultCenter={match.center ?? NYC}
              defaultZoom={match.center ? ZIP_ZOOM : CITY_ZOOM}
              gestureHandling="greedy"
              clickableIcons={false}
              disableDefaultUI
              zoomControl
              onIdle={(e) => setBounds(e.map.getBounds()?.toJSON() ?? null)}
              onClick={() => setSelectedId(null)}
            >
              {pinned.map((p) => (
                <AdvancedMarker
                  key={p.id}
                  position={{ lat: p.lat!, lng: p.lng! }}
                  title={p.name}
                  zIndex={p.id === selectedId ? 30 : 10}
                  /* All five boroughs at once is 565 overlapping pins. Let the
                     map drop the ones it cannot place, keeping the picked pin
                     and thinning the rest out as you zoom in. */
                  collisionBehavior={
                    p.id === selectedId
                      ? CollisionBehavior.REQUIRED_AND_HIDES_OPTIONAL
                      : CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY
                  }
                  onClick={() => setSelectedId(p.id)}
                >
                  <FlaskPin active={p.id === selectedId} label={p.name} />
                </AdvancedMarker>
              ))}
              <PanTo camera={camera} />
              <MapControl position={ControlPosition.RIGHT_TOP}>
                <LocateMe
                  onLocate={(point) => {
                    const near = nearestZip(point, centroids);
                    if (near) applyZip(near);
                  }}
                />
              </MapControl>
            </GoogleMap>
          </APIProvider>
        ) : (
          <div
            className="absolute inset-0 grid place-items-center p-6 text-center"
            style={{ background: "radial-gradient(120% 120% at 30% 20%, #16bcc7 0%, #0e9aa6 45%, #0f636d 100%)" }}
          >
            <p className="max-w-xs font-body text-white/90">
              Set <code className="font-600">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> in <code>.env.local</code> to show
              the map.
            </p>
          </div>
        )}

        {/* "Search as I move the map", as on the reference design. */}
        <label
          className={`absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-white px-3 py-2 font-body text-xs font-600 shadow-md ring-1 ring-black/10 ${
            zipActive ? "cursor-not-allowed text-ink/40" : "cursor-pointer text-ink"
          }`}
          title={zipActive ? "Clear the ZIP code to browse by map area" : undefined}
        >
          <input
            type="checkbox"
            checked={searchAsIMove && !zipActive}
            disabled={zipActive}
            onChange={(e) => setSearchAsIMove(e.target.checked)}
            className="h-3.5 w-3.5 accent-ink"
          />
          Search as I move the map
        </label>
      </div>
    </div>
  );
}
